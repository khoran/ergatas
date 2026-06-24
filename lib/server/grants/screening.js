// ============================================================================
// Screening orchestration (Phase 1): turns OFAC matching + staff dispositions
// into immutable grants.ofac_screening / grants.due_diligence records.
//
// Flow: staff run a match preview (ofac.screenTargets), disposition each target
// (clear / potential_match / confirmed_match), then finalize a screening record.
// A non-clear overall result gates the board approval downstream.
// ============================================================================
import * as records from './records.js';
import * as ofac from './ofac.js';
import { ensureFields } from '../../shared/shared-utils.js';

// Derive the overall result from per-target dispositions (most severe wins).
export function computeOverallResult(results) {
    if (results.some(r => r.result === 'confirmed_match')) return 'blocked';
    if (results.some(r => r.result === 'potential_match')) return 'escalated';
    return 'clear';
}

/**
 * Finalize an immutable OFAC screening record.
 * payload: { grantee_org, country?, targets[], results[]{name,result,disposition_note,evidence_ref},
 *            lists_checked?, jurisdiction_program_check?, overall_result? }
 */
export async function recordScreening(token, req, payload) {
    ensureFields(payload, ['grantee_org', 'results']);

    const overall = payload.overall_result || computeOverallResult(payload.results);
    // A non-clear target must carry a disposition note (escalation evidence).
    for (const r of payload.results) {
        if (r.result && r.result !== 'clear' && !(r.disposition_note && r.disposition_note.trim())) {
            throw new Error('a non-clear screening result for "' + r.name + '" requires a disposition note');
        }
    }

    const list_source_version = await ofac.currentListVersion();
    return records.createRecord({
        table: 'ofac_screening', token, req,
        record: {
            grantee_org: payload.grantee_org,
            country: payload.country || null,
            overall_result: overall,
            list_source_version,
            data: {
                targets: payload.targets || [],
                results: payload.results,
                lists_checked: payload.lists_checked || ['SDN', 'CONSOLIDATED'],
                jurisdiction_program_check: payload.jurisdiction_program_check || null,
            },
        },
    });
}

/** Finalize an immutable due-diligence record. */
export async function recordDueDiligence(token, req, payload) {
    ensureFields(payload, ['grantee_org']);
    return records.createRecord({
        table: 'due_diligence', token, req,
        record: {
            grantee_org: payload.grantee_org,
            summary: payload.summary || null,
            risk_rating: payload.risk_rating || null,
            data: { evidence_refs: payload.evidence_refs || [] },
        },
    });
}

/** Correct a prior screening (writes a replacement, retires the prior). */
export async function reviseScreening(token, req, priorId, payload) {
    ensureFields(payload, ['grantee_org', 'results']);
    const overall = payload.overall_result || computeOverallResult(payload.results);
    const list_source_version = await ofac.currentListVersion();
    return records.supersede({
        table: 'ofac_screening', priorId, token, req,
        record: {
            grantee_org: payload.grantee_org, country: payload.country || null,
            overall_result: overall, list_source_version,
            data: {
                targets: payload.targets || [], results: payload.results,
                lists_checked: payload.lists_checked || ['SDN', 'CONSOLIDATED'],
                jurisdiction_program_check: payload.jurisdiction_program_check || null,
            },
        },
    });
}

/** List current (non-superseded) screenings, optionally for one grantee. */
export async function listScreenings(token, granteeOrg) {
    let query = 'status=eq.final&order=timestamp_utc.desc';
    if (granteeOrg) query += '&grantee_org=eq.' + encodeURIComponent(granteeOrg);
    return records.listRecords({ table: 'ofac_screening', query, token });
}

/** List current (non-superseded) due-diligence records, optionally for one grantee. */
export async function listDueDiligence(token, granteeOrg) {
    let query = 'status=eq.final&order=timestamp_utc.desc';
    if (granteeOrg) query += '&grantee_org=eq.' + encodeURIComponent(granteeOrg);
    return records.listRecords({ table: 'due_diligence', query, token });
}
