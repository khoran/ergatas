// ============================================================================
// Disbursement records (Phase 5, lifecycle [5]).
//
// Records monthly disbursements WITHIN the board-delegated scope. Enforces:
//   - the linked board approval is current (status 'final') and is an approval
//     outcome (not deferred/denied/suspended/terminated),
//   - delegation was authorized, and
//   - the amount is within the delegated monthly cap (if one is configured).
// Anything outside scope requires a fresh board decision. Also sums "sent" per
// grantee/period to pre-fill salary reports. Does NOT move money.
// ============================================================================
import * as records from './records.js';
import * as board from './board.js';
import { ensureFields } from '../../shared/shared-utils.js';

const APPROVAL_OUTCOMES = new Set(['approved', 'approved_conditions', 'renewed', 'modified']);

async function assertWithinScope(token, payload) {
    const approval = await board.getApproval(token, payload.board_approval_id);
    if (!approval) throw new Error('unknown board approval');
    if (approval.status !== 'final')
        throw new Error('the linked board approval is superseded; use the current approval');
    if (!APPROVAL_OUTCOMES.has(approval.outcome))
        throw new Error('the linked board decision (' + approval.outcome + ') does not authorize disbursement');

    const delegation = (approval.data && approval.data.delegation) || {};
    if (!delegation.authorized)
        throw new Error('this approval did not delegate disbursement authority; a fresh board decision is required');

    // Optional structured cap: delegation.monthly_cap (number). If present, enforce it.
    if (delegation.monthly_cap != null && Number(payload.amount) > Number(delegation.monthly_cap))
        throw new Error('amount ' + payload.amount + ' exceeds the delegated monthly cap of ' +
                        delegation.monthly_cap + '; a fresh board decision is required');

    return approval;
}

export async function recordDisbursement(token, req, payload) {
    ensureFields(payload, ['grantee_org', 'board_approval_id', 'amount']);
    await assertWithinScope(token, payload);
    return records.createRecord({
        table: 'disbursement', token, req, status: 'recorded',
        record: {
            grantee_org: payload.grantee_org,
            board_approval_id: payload.board_approval_id,
            reporting_period: payload.reporting_period || null,
            amount: Number(payload.amount),
            currency: payload.currency || 'USD',
            allocation: payload.allocation || [],
            method: payload.method || null,
            scheduled_date: payload.scheduled_date || null,
            sent_date: payload.sent_date || null,
            note: payload.note || null,
        },
    });
}

export async function listDisbursements(token, granteeOrg, period) {
    return records.listRecords({ table: 'disbursement', token,
        filters: { status: 'recorded', grantee_org: granteeOrg, reporting_period: period } });
}

export async function getDisbursement(token, recordId) {
    return records.getRecord({ table: 'disbursement', recordId, token });
}

/**
 * Sum disbursed amounts for a grantee+period, with a per-employee/role breakdown
 * from each disbursement's allocation — used to pre-fill a salary report's "sent".
 */
export async function sentForPeriod(token, granteeOrg, period) {
    const rows = await listDisbursements(token, granteeOrg, period);
    const byEmployee = {};
    let total = 0;
    for (const d of rows || []) {
        total += Number(d.amount) || 0;
        for (const a of (d.allocation || [])) {
            const key = a.employee || a.role || 'unallocated';
            byEmployee[key] = (byEmployee[key] || 0) + (Number(a.amount) || 0);
        }
    }
    return { total: Math.round(total * 100) / 100, byEmployee };
}
