// ============================================================================
// Salary-use report (Phase 4, lifecycle [6]).
//
// Reconciles funds *sent* (from disbursements) to funds *applied* to salary per
// employee, requires an explanation for any variance, captures two verbatim
// certifications, and writes an immutable, attested record. The reconciliation
// and gating are enforced server-side, not just in the browser.
// ============================================================================
import * as records from './records.js';
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

function buildRecord(payload) {
    validateCertification(payload);
    const { lines, totals } = reconcile(payload);
    return {
        report_type: payload.report_type || 'salary_use_periodic',
        grantee_org: payload.grantee_org,
        country: payload.country || null,
        reporting_period: payload.reporting_period,
        agreement_version: payload.agreement_version || null,
        grant_reference: payload.grant_reference || null,
        board_approval_id: payload.board_approval_id || null,
        acceptance_record_id: payload.acceptance_record_id || null,
        role_based_mode: payload.role_based_mode === true,
        data: { lines, totals },
        charitable_use_confirmed: true,
        attestation_confirmed: true,
        attestation_text: [CONFIRMATION_1, CONFIRMATION_2],
        typed_signature: payload.typed_signature,
    };
}

export async function recordSalaryReport(token, req, payload) {
    ensureFields(payload, ['grantee_org', 'reporting_period', 'lines']);
    return records.createRecord({ table: 'salary_report', token, req, record: buildRecord(payload), status: 'submitted' });
}

export async function reviseReport(token, req, priorId, payload) {
    ensureFields(payload, ['grantee_org', 'reporting_period', 'lines']);
    return records.supersede({ table: 'salary_report', priorId, token, req, record: buildRecord(payload), status: 'submitted' });
}

export async function listReports(token, granteeOrg) {
    let query = 'status=eq.submitted&order=timestamp_utc.desc';
    if (granteeOrg) query += '&grantee_org=eq.' + encodeURIComponent(granteeOrg);
    return records.listRecords({ table: 'salary_report', query, token });
}

export async function getReport(token, recordId) {
    return records.getRecord({ table: 'salary_report', recordId, token });
}
