import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';

// The grants tables live in the isolated `grants` Postgres schema; PostgREST
// selects it with the profile headers. Every method targets a `_view`, never a
// base table, and (project rule) all grants URL/filter construction stays here.
function grantsProfile(headers){
    return Object.assign(headers || {}, { 'Content-Profile': 'grants', 'Accept-Profile': 'grants' });
}

// PostgREST eq-filter query string from a {column: value} map (null/undefined
// values are skipped), always newest-first by the record timestamp.
function recordQuery(filters){
    const parts = Object.entries(filters || {})
        .filter(([, v]) => v != null)
        .map(([col, v]) => col + '=eq.' + encodeURIComponent(v));
    parts.push('order=timestamp_utc.desc');
    return '?' + parts.join('&');
}

const recordView = table => '/' + table + '_view';

export class GrantsRepo extends BaseRepo {

    // ---- immutable record tables (ofac_screening, board_approval, …) ----------
    /** Insert a finalized record row; returns the persisted representation. */
    insertGrantRecord(table, row){
        return this.client.authPost(recordView(table), row,
            grantsProfile(H.single(H.representation())));
    }
    /** The one permitted mutation: flip a record's status to 'superseded'. */
    markGrantRecordSuperseded(table, recordId){
        return this.client.authPatch(recordView(table) + '?record_id=eq.' + recordId,
            { status: 'superseded' }, grantsProfile());
    }
    getGrantRecord(table, recordId){
        return this.client.authGet(recordView(table) + '?record_id=eq.' + recordId,
            grantsProfile(H.single()));
    }
    /** List records matching a {column: value} equality filter map, newest first. */
    listGrantRecords(table, filters){
        return this.client.authGet(recordView(table) + recordQuery(filters), grantsProfile());
    }

    // ---- governance config (mutable, keyed by scope) ---------------------------
    getGrantsGovernanceRows(scope){
        return this.client.authGet('/governance_config_view?scope=eq.' + encodeURIComponent(scope),
            grantsProfile());
    }
    patchGrantsGovernanceRow(scope, row){
        return this.client.authPatch('/governance_config_view?scope=eq.' + encodeURIComponent(scope),
            row, grantsProfile(H.representation()));
    }
    insertGrantsGovernanceRow(row){
        return this.client.authPost('/governance_config_view', row, grantsProfile(H.representation()));
    }

    // ---- OFAC list reference data (mutable, replaced on refresh) ---------------
    clearOfacList(listName){
        return this.client.authDelete('/ofac_list_entries_view?list_name=eq.' + encodeURIComponent(listName),
            null, grantsProfile());
    }
    insertOfacEntries(rows){
        return this.client.authPost('/ofac_list_entries_view', rows, grantsProfile());
    }
    latestOfacListVersion(){
        return this.client.authGet('/ofac_list_entries_view?select=list_name,list_version&order=list_version.desc&limit=1',
            grantsProfile());
    }
    /** Fuzzy name match via the grants.match_ofac function (rpc — not a table). */
    matchOfacName(name, threshold){
        return this.client.authPost('/rpc/match_ofac', { p_query: name, p_threshold: threshold },
            grantsProfile());
    }

    // ---- agreement versions (append-only) --------------------------------------
    insertGrantAgreementVersion(row){
        return this.client.authPost('/grant_agreement_version_view', row,
            grantsProfile(H.single(H.representation())));
    }
    listGrantAgreementVersions(){
        return this.client.authGet('/grant_agreement_version_view?order=created_on.desc', grantsProfile());
    }
    getGrantAgreementVersion(versionId){
        return this.client.authGet('/grant_agreement_version_view?agreement_version_id=eq.' + versionId,
            grantsProfile(H.single()));
    }

    // ---- grantee (non-profit) lookup — web schema, no grants profile -----------
    listGrantNonProfits(){
        return this.client.authGet('/non_profits_view?select=non_profit_key,registered_name,country_code,city,state,is_shell&order=registered_name');
    }

    // ---- per-worker donations for the salary-report prefill (web schema) --------
    // Donations to an org's workers (by non_profit_key) within [fromDate, toDate),
    // confirmed AND paid only. Server-role view web.grant_worker_donations — the
    // server first validates the caller is authorized for the org (grants/reports.js).
    listWorkerDonations(nonProfitKey, fromDate, toDate){
        return this.client.authGet('/grant_worker_donations' +
            '?non_profit_key=eq.' + Number(nonProfitKey) +
            '&confirmed=is.true&paid=is.true' +
            '&created_on=gte.' + encodeURIComponent(fromDate) +
            '&created_on=lt.' + encodeURIComponent(toDate) +
            '&select=missionary_profile_key,name,amount,created_on');
    }

    // ---- grantee-user → organization resolution (web schema) -------------------
    // Which organization(s) a signed-in user may accept an agreement for: their
    // own worker profiles' orgs and any profiles shared with them (see
    // granteeOrgOptions in lib/server/grants/grantees.js for the policy).
    listProfileOrgKeysByUser(externalUserId){
        return this.client.authGet('/all_profile_search?external_user_id=eq.' + encodeURIComponent(externalUserId) +
            '&select=missionary_profile_key,organization_key:data->>organization_key');
    }
    listProfileOrgKeysByProfileKeys(profileKeys){
        return this.client.authGet('/all_profile_search?missionary_profile_key=in.(' +
            profileKeys.map(k => Number(k)).join(',') +
            ')&select=missionary_profile_key,organization_key:data->>organization_key');
    }
    listOrganizationNonProfitKeys(orgKeys){
        return this.client.authGet('/organizations_view?organization_key=in.(' +
            orgKeys.map(k => Number(k)).join(',') + ')&select=organization_key,non_profit_key');
    }

    // ---- annual report reminders (mutable bookkeeping; server role) ----------
    /** Writable managers (external user ids) of the organizations under a grantee name. */
    listGranteeOrgManagers(granteeOrg){
        return this.client.authGet('/grantee_org_managers_view?grantee_org=eq.' + encodeURIComponent(granteeOrg),
            grantsProfile());
    }
    /** The grantee organizations (registered names) a user is a writable manager of. */
    listManagedGranteeOrgs(externalUserId){
        return this.client.authGet('/grantee_org_managers_view?external_user_id=eq.' + encodeURIComponent(externalUserId) +
            '&select=grantee_org', grantsProfile());
    }
    listReportReminders(granteeOrg, reportingPeriod){
        return this.client.authGet('/report_reminders_view?grantee_org=eq.' + encodeURIComponent(granteeOrg) +
            '&reporting_period=eq.' + encodeURIComponent(reportingPeriod), grantsProfile());
    }
    insertReportReminder(row){
        return this.client.authPost('/report_reminders_view', row, grantsProfile(H.representation()));
    }
    updateReportReminder(reportReminderKey, row){
        return this.client.authPatch('/report_reminders_view?report_reminder_key=eq.' + Number(reportReminderKey),
            row, grantsProfile(H.representation()));
    }
    /** Marks a grantee's open reminder for a year resolved (its report is on file). */
    resolveReportReminder(granteeOrg, reportingPeriod, resolvedOn){
        return this.client.authPatch('/report_reminders_view?grantee_org=eq.' + encodeURIComponent(granteeOrg) +
            '&reporting_period=eq.' + encodeURIComponent(reportingPeriod) + '&resolved_on=is.null',
            { resolved_on: resolvedOn }, grantsProfile());
    }
}
