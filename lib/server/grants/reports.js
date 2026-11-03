// ============================================================================
// Salary-use report (Phase 4, lifecycle [6]).
//
// Reconciles funds *sent* (from disbursements) to funds *applied* to salary per
// employee, requires an explanation for any variance, captures two verbatim
// certifications, and writes an immutable, attested record. The reconciliation
// and gating are enforced server-side, not just in the browser.
// ============================================================================
import { isAnnualPeriod } from './report-schedule.js';
import { getServerDB } from '../utils.js';
import * as records from './records.js';
import { listAcceptances, getVersion } from './agreements.js';
import { granteeOrgOptions, requireGranteeOrg } from './grantees.js';
import { donationsForPeriod } from './donations.js';
import { ensureFields } from '../../shared/shared-utils.js';

// Verbatim certification wording (spec §5). Kept as constants so the exact text
// affirmed is captured on every record. (Confirm wording with counsel.)
export const CONFIRMATION_1 =
    'Each individual listed performed the charitable role funded by this grant during the period.';
export const CONFIRMATION_2 =
    'The amounts are accurate, the grant funds were used solely for the Charitable Purpose, ' +
    'and no portion was used for any prohibited purpose under the Grant Agreement.';

const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Compute per-line variance + totals; throws on the spec's submit gates.
export function reconcile(payload) {
    const lines = payload.lines || [];
    if (lines.length === 0) throw new Error('the salary ledger has no lines');

    const out = [];
    const totals = { sent: 0, applied: 0, variance: 0 };
    for (const l of lines) {
        if (!payload.role_based_mode && !(l.employee && String(l.employee).trim()) && !(l.role && String(l.role).trim()))
            throw new Error('each ledger line needs an employee or role');
        if (l.applied == null || l.applied === '' || isNaN(Number(l.applied)))
            throw new Error('every "applied to salary" amount must be entered');
        if (Number(l.applied) < 0) throw new Error('"applied to salary" cannot be negative');

        const sent = round2(l.sent || 0);
        const applied = round2(l.applied);
        const variance = round2(sent - applied);
        if (variance !== 0 && !(l.explanation && String(l.explanation).trim()))
            throw new Error('a variance on "' + (l.employee || l.role || 'a line') + '" requires an explanation');

        out.push({ employee: l.employee || null, role: l.role || null, sent, applied, variance,
                   explanation: variance === 0 ? null : l.explanation });
        totals.sent = round2(totals.sent + sent);
        totals.applied = round2(totals.applied + applied);
        totals.variance = round2(totals.variance + variance);
    }
    return { lines: out, totals };
}

function validateCertification(payload) {
    if (payload.charitable_use_confirmed !== true) throw new Error('the charitable-use certification is required');
    if (payload.attestation_confirmed !== true) throw new Error('the accuracy/solely-charitable certification is required');
    if (!(payload.typed_signature && payload.typed_signature.trim())) throw new Error('a typed-name signature is required');
}

// The current (non-superseded) acceptance for a grantee, with its version label —
// the report certifies against these terms. Read under the server role.
async function currentAcceptanceFor(granteeOrg) {
    const acceptances = await listAcceptances(undefined, granteeOrg);   // newest first
    const acceptance = (Array.isArray(acceptances) && acceptances[0]) || null;
    if (!acceptance) return { acceptance: null, versionLabel: null };
    const version = await getVersion(undefined, acceptance.agreement_version_id);
    return { acceptance, versionLabel: (version && version.version_label) || null };
}

function buildRecord(payload, acceptance, versionLabel) {
    validateCertification(payload);
    // Reporting is annual: the period is the calendar year being reported on.
    const period = String(payload.reporting_period || '').trim();
    if (!isAnnualPeriod(period)) throw new Error('the reporting period must be a year, e.g. 2026');
    if (Number(period) > new Date().getUTCFullYear())
        throw new Error('cannot report on a future year (' + period + ')');
    payload = { ...payload, reporting_period: period };
    const { lines, totals } = reconcile(payload);
    return {
        report_type: payload.report_type || 'salary_use_periodic',
        grantee_org: payload.grantee_org,
        country: payload.country || acceptance.grantee_country || null,
        reporting_period: payload.reporting_period,
        // Chain links are server-derived from the grantee's current acceptance —
        // never typed by the submitter.
        agreement_version: versionLabel,
        board_approval_id: acceptance.board_approval_id || null,
        acceptance_record_id: acceptance.record_id,
        role_based_mode: payload.role_based_mode === true,
        data: { lines, totals },
        charitable_use_confirmed: true,
        attestation_confirmed: true,
        attestation_text: [CONFIRMATION_1, CONFIRMATION_2],
        typed_signature: payload.typed_signature,
    };
}

// A report can only be filed against an accepted agreement (lifecycle order).
async function requireAcceptance(granteeOrg) {
    const found = await currentAcceptanceFor(granteeOrg);
    if (!found.acceptance)
        throw new Error('no accepted grant agreement on file for "' + granteeOrg +
            '"; the agreement must be accepted before a salary-use report can be filed');
    return found;
}

export async function recordSalaryReport(token, req, payload) {
    ensureFields(payload, ['grantee_org', 'reporting_period', 'lines']);
    await requireGranteeOrg(token, payload.grantee_org);
    const { acceptance, versionLabel } = await requireAcceptance(payload.grantee_org);
    const saved = await records.createRecord({ table: 'salary_report', token, req,
        record: buildRecord(payload, acceptance, versionLabel), status: 'submitted' });
    await resolveReminder(saved);
    return saved;
}

// Filing the report stops its reminder emails (report-reminders.js). Never fails
// the submission: the daily job also resolves reminders for filed years.
async function resolveReminder(saved) {
    try {
        const sdb = await getServerDB();
        await sdb.grants.resolveReportReminder(saved.grantee_org, saved.reporting_period, new Date().toISOString());
    } catch (err) {
        console.warn('salary report: could not resolve reminder for', saved && saved.grantee_org, err.message);
    }
}

export async function reviseReport(token, req, priorId, payload) {
    ensureFields(payload, ['grantee_org', 'reporting_period', 'lines']);
    await requireGranteeOrg(token, payload.grantee_org);
    const { acceptance, versionLabel } = await requireAcceptance(payload.grantee_org);
    return records.supersede({ table: 'salary_report', priorId, token, req,
        record: buildRecord(payload, acceptance, versionLabel), status: 'submitted' });
}

/**
 * Context for the salary-report form: the grantee's current agreement (so the UI
 * can show what the report certifies against, or warn that acceptance is missing)
 * and the per-worker donation totals for the period (to pre-fill "sent for
 * salary"). "Sent" is sourced from the ACTUAL donations the org's workers received
 * (web.possible_transactions), not from the manual disbursement ledger.
 *
 * `grantee_org` is client-supplied, so we resolve it to a non_profit_key ONLY when
 * it is among the orgs the caller is authorized to act for (granteeOrgOptions);
 * an unauthorized org yields no donor totals. Reads run under the server role.
 */
export async function reportContext(token, granteeOrg, period) {
    const { acceptance, versionLabel } = await currentAcceptanceFor(granteeOrg);

    // Authorize + resolve the org to its non_profit_key before returning donor data.
    let nonProfitKey = null;
    const authorizedOrgs = await granteeOrgOptions(token);
    const match = (authorizedOrgs || []).find(np => np.registered_name === granteeOrg);
    if (match) nonProfitKey = match.non_profit_key;

    const donations = (period && nonProfitKey != null)
        ? await donationsForPeriod(nonProfitKey, period)
        : { total: 0, byWorker: {} };

    return {
        has_acceptance: acceptance != null,
        agreement_version_label: versionLabel,
        date_accepted: acceptance ? acceptance.timestamp_utc : null,
        // Kept under `sent.byEmployee` so the client prefill is unchanged; the
        // values are now per-worker donation totals rather than disbursements.
        sent: { total: donations.total, byEmployee: donations.byWorker },
    };
}

export async function listReports(token, granteeOrg) {
    return records.listRecords({ table: 'salary_report', token,
        filters: { status: 'submitted', grantee_org: granteeOrg } });
}

/**
 * The salary-use reports a signed-in grantee may see: the reports filed for the
 * org(s) they are authorized to act for (granteeOrgOptions). Grantees have no DB
 * read access to grants.salary_report (RLS grants SELECT to server/staff only),
 * so the read runs under the SERVER role and is scoped here to the caller's own
 * orgs — never to a client-supplied org name. Superseded revisions are hidden;
 * newest first across orgs.
 */
export async function listReportsForGrantee(token) {
    const orgs = await granteeOrgOptions(token);
    if (!Array.isArray(orgs) || orgs.length === 0) return [];
    const all = [];
    for (const org of orgs) {
        const rows = await records.listRecords({ table: 'salary_report',   // server role (no token)
            filters: { grantee_org: org.registered_name } });
        if (Array.isArray(rows)) all.push(...rows.filter(r => r.status !== 'superseded'));
    }
    all.sort((a, b) => String(b.timestamp_utc || '').localeCompare(String(a.timestamp_utc || '')));
    return all;
}

export async function getReport(token, recordId) {
    return records.getRecord({ table: 'salary_report', recordId, token });
}
