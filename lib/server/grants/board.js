// ============================================================================
// Board review & approval (Phase 2, lifecycle [2]/[7]).
//
// Records one immutable grants.board_approval per grantee decision. Voting
// mechanics and the exempt-purpose attestation come from grants.governance_config
// (configurable, for counsel) — this module computes quorum/tally and ENFORCES
// the submit gates from the spec, then writes the record through records.js.
// ============================================================================
import * as records from './records.js';
import { deadlineSetting } from './report-schedule.js';
import { getServerDB } from '../utils.js';
import { ensureFields } from '../../shared/shared-utils.js';

// Outcomes that authorize/continue funding — they require the exempt-purpose
// finding and a met quorum.
const APPROVAL_OUTCOMES = new Set(['approved', 'approved_conditions', 'renewed', 'modified']);
// Outcomes that must carry at least one recorded condition.
const CONDITIONAL_OUTCOMES = new Set(['approved_conditions', 'modified']);
const NEW_GRANT_OUTCOMES = new Set(['approved', 'approved_conditions', 'deferred', 'denied']);
const ANNUAL_OUTCOMES = new Set(['renewed', 'modified', 'suspended', 'terminated']);

// ---- Governance config -------------------------------------------------------
export async function getGovernanceConfig(scope = 'default') {
    const db = await getServerDB();
    const rows = await db.grants.getGrantsGovernanceRows(scope);
    return (rows && rows[0] && rows[0].config) || {};
}

export async function updateGovernanceConfig(scope, config) {
    const db = await getServerDB();
    scope = scope || 'default';
    const row = { config, last_updated_on: new Date().toISOString() };
    // governance_config is mutable (not write-once). PostgREST's merge-duplicates
    // upsert emits INSERT ... ON CONFLICT, which Postgres rejects on a view, so we
    // go through the view with an explicit update-else-insert.
    const updated = await db.grants.patchGrantsGovernanceRow(scope, row);
    if (updated && updated.length) return updated;
    return db.grants.insertGrantsGovernanceRow(Object.assign({ scope }, row));
}

// ---- Organization defaults ---------------------------------------------------
// Standing information used to prefill the board-approval form: the board
// roster ({name, role}[]) and a default motion text. Kept in the governance
// config row as the board_members / default_motion_text keys. These are only
// starting values; each decision still records its own votes and motion.
function cleanBoardMembers(members) {
    if (!Array.isArray(members)) throw new Error('board_members must be a list');
    return members
        .map(m => {
            const row = { name: String((m && m.name) || '').trim(), role: String((m && m.role) || '').trim() };
            // optional link to the member's Ergatas account (for board access)
            const key = Number(m && m.user_key);
            if (Number.isInteger(key) && key > 0) row.user_key = key;
            return row;
        })
        .filter(m => m.name !== '');
}

// Also exposes the grantor's legal name and address (config.grantor.*), which
// fill the {{grantor_legal_name}} / {{grantor_address}} agreement tokens.
export async function getOrgDefaults(scope = 'default') {
    const config = await getGovernanceConfig(scope);
    const grantor = config.grantor || {};
    return {
        board_members: Array.isArray(config.board_members) ? config.board_members : [],
        default_motion_text: config.default_motion_text || '',
        grantor_legal_name: grantor.legal_name || '',
        grantor_address: grantor.address || '',
        report_deadline: deadlineSetting(config),
    };
}

// Merges only the defaults keys into the stored config, so saving this page
// can never overwrite quorum, attestation or the grantor's exempt-purpose text.
// Grantor fields left out of the request are kept as they are.
export async function updateOrgDefaults(scope, defaults) {
    scope = scope || 'default';
    const config = await getGovernanceConfig(scope);
    const grantor = Object.assign({}, config.grantor);
    if (defaults.grantor_legal_name !== undefined) {
        const legalName = String(defaults.grantor_legal_name || '').trim();
        if (!legalName) throw new Error("Ergatas's legal name is required");
        grantor.legal_name = legalName;
    }
    if (defaults.grantor_address !== undefined)
        grantor.address = String(defaults.grantor_address || '').trim();
    let reportDeadline = config.report_deadline;
    if (defaults.report_deadline !== undefined) {
        const month = Number(defaults.report_deadline && defaults.report_deadline.month);
        const day = Number(defaults.report_deadline && defaults.report_deadline.day);
        if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31))
            throw new Error('the annual report due date needs a valid month and day');
        reportDeadline = { month, day };
    }
    const merged = Object.assign({}, config, {
        board_members: cleanBoardMembers(defaults.board_members),
        default_motion_text: String(defaults.default_motion_text || '').trim(),
        grantor,
        ...(reportDeadline ? { report_deadline: reportDeadline } : {}),
    });
    await updateGovernanceConfig(scope, merged);
    return getOrgDefaults(scope);
}

// ---- Vote tally / quorum -----------------------------------------------------
export function tallyVotes(votes) {
    const t = { approve: 0, oppose: 0, abstain: 0, recuse: 0 };
    for (const v of votes || []) if (t[v.vote] != null) t[v.vote]++;
    return t;
}

// Recused members are excluded from quorum and the threshold base.
export function computeQuorum(votes, config) {
    const present = (votes || []).filter(v => v.vote !== 'recuse').length;
    const quorum = Number(config.quorum) || 0;
    return { present, quorum_met: present >= quorum };
}

export function meetsThreshold(tally, config) {
    const base = tally.approve + tally.oppose + tally.abstain; // non-recused present
    if (base === 0) return false;
    const th = config.approve_threshold;
    if (th === 'two_thirds') return tally.approve >= Math.ceil((2 / 3) * base);
    if (typeof th === 'number') return tally.approve >= Math.ceil(th * base);
    return tally.approve > base / 2; // 'majority' (default)
}

// ---- Validation --------------------------------------------------------------
function validate(payload, config, screening) {
    const { review_type, outcome, votes, motion_text, exempt_purpose_finding, data = {} } = payload;

    if (review_type === 'new_grant' && !NEW_GRANT_OUTCOMES.has(outcome))
        throw new Error('invalid outcome "' + outcome + '" for a new-grant review');
    if (review_type === 'annual_review' && !ANNUAL_OUTCOMES.has(outcome))
        throw new Error('invalid outcome "' + outcome + '" for an annual review');

    if (!motion_text || !motion_text.trim()) throw new Error('motion/resolution text is required');
    if (!votes || votes.length === 0) throw new Error('at least one recorded vote is required');
    for (const v of votes) {
        if (v.vote === 'recuse' && !(v.conflict_reason && v.conflict_reason.trim()))
            throw new Error('a recused member requires a conflict-of-interest reason (' + (v.member_name || '?') + ')');
    }

    const { quorum_met } = computeQuorum(votes, config);

    if (APPROVAL_OUTCOMES.has(outcome)) {
        if (!quorum_met) throw new Error('quorum not met; cannot record an approval/renewal');
        if (!(exempt_purpose_finding && exempt_purpose_finding.affirmed === true && exempt_purpose_finding.text && exempt_purpose_finding.text.trim()))
            throw new Error('the exempt-purpose & control finding must be affirmed (verbatim) to approve/renew');
    }
    if (CONDITIONAL_OUTCOMES.has(outcome) && !(Array.isArray(data.conditions) && data.conditions.length > 0))
        throw new Error('a conditional/modified outcome requires at least one recorded condition');
    if (data.delegation && data.delegation.authorized && !(data.delegation.scope && String(data.delegation.scope).trim()))
        throw new Error('delegated disbursement authority requires a recorded scope');

    if (review_type === 'new_grant') {
        if (!payload.due_diligence_id && !(data.due_diligence && data.due_diligence.summary))
            throw new Error('new-grant approval requires recorded due diligence');
        if (!payload.ofac_screening_id && !(data.ofac_screening && data.ofac_screening.result))
            throw new Error('new-grant approval requires a recorded OFAC screening result');
    }
    if (review_type === 'annual_review' && APPROVAL_OUTCOMES.has(outcome)) {
        if (data.reports_received == null) throw new Error('annual review requires the reports-received status');
        if (!data.reconciliation_status) throw new Error('annual review requires a reconciliation status');
        for (const f of (data.compliance_flags || []))
            if (!(f.disposition && String(f.disposition).trim()))
                throw new Error('each compliance flag must be acknowledged/actioned');
        if (!(data.re_screening && data.re_screening.result))
            throw new Error('annual review requires a re-screening result');
    }

    // A linked screening that is blocked can never support an approval.
    if (APPROVAL_OUTCOMES.has(outcome) && screening && screening.overall_result === 'blocked')
        throw new Error('the linked OFAC screening is blocked; funding cannot be approved');
}

// ---- Public API --------------------------------------------------------------
async function fetchScreening(id) {
    if (!id) return null;
    try { return await records.getRecord({ table: 'ofac_screening', recordId: id }); } catch { return null; }
}

function buildRecord(payload, config) {
    const tally = tallyVotes(payload.votes);
    const { quorum_met } = computeQuorum(payload.votes, config);
    const data = Object.assign({}, payload.data, {
        votes: payload.votes,
        tally,
        threshold_met: meetsThreshold(tally, config),
        governance: { quorum: config.quorum, approve_threshold: config.approve_threshold },
    });
    return {
        review_type: payload.review_type,
        grantee_org: payload.grantee_org,
        country: payload.country || null,
        grant_reference: payload.grant_reference || null,
        ofac_screening_id: payload.ofac_screening_id || null,
        due_diligence_id: payload.due_diligence_id || null,
        meeting_date: payload.meeting_date || null,
        meeting_reference: payload.meeting_reference || null,
        exempt_purpose_finding: payload.exempt_purpose_finding || {},
        motion_text: payload.motion_text,
        outcome: payload.outcome,
        quorum_met,
        data,
    };
}

export async function recordApproval(token, req, payload) {
    ensureFields(payload, ['review_type', 'grantee_org', 'outcome', 'votes']);
    const config = await getGovernanceConfig(payload.scope);
    const screening = await fetchScreening(payload.ofac_screening_id);
    validate(payload, config, screening);
    return records.createRecord({ table: 'board_approval', token, req, record: buildRecord(payload, config) });
}

// Amend/annual-review a prior approval: write a replacement linked to the prior,
// flip the prior to 'superseded'.
export async function reviseApproval(token, req, priorId, payload) {
    ensureFields(payload, ['review_type', 'grantee_org', 'outcome', 'votes']);
    const config = await getGovernanceConfig(payload.scope);
    const screening = await fetchScreening(payload.ofac_screening_id);
    validate(payload, config, screening);
    const record = buildRecord(payload, config);
    return records.supersede({ table: 'board_approval', priorId, token, req, record, linkColumn: 'prior_approval_id' });
}

export async function listApprovals(token, granteeOrg) {
    return records.listRecords({ table: 'board_approval', token,
        filters: { status: 'final', grantee_org: granteeOrg } });
}

export async function getApproval(token, recordId) {
    return records.getRecord({ table: 'board_approval', recordId, token });
}
