// ============================================================================
// Grant pipeline — one status row per organization that has started the grant
// process (i.e. has at least one OFAC screening on file), for the staff/board
// overview. Combines each organization's newest screening, due diligence, board
// decision, agreement acceptance and salary reports into:
//   - stage:      where the organization is in the process
//   - next:       the next step (dashboard page + board review type)
//   - agreement:  whether the agreement has been accepted
//   - reports:    whether an annual salary-use report is due
//   - annual:     when the next annual review is due
//
// Reads run under the server role; the endpoint checks the caller is grant
// staff or a board member first.
// ============================================================================
import * as records from './records.js';
import { getGovernanceConfig } from './board.js';
import { reportYear, reportDeadline, owedYears, reportsExpected, isoDate } from './report-schedule.js';

const FUNDED_OUTCOMES = new Set(['approved', 'approved_conditions', 'renewed', 'modified']);
// Start flagging an annual review this many days before its anniversary.
const ANNUAL_REVIEW_WARNING_DAYS = 30;

const newest = rows => (Array.isArray(rows) && rows.length ? rows[0] : null);   // lists are newest first
const groupBy = (rows, key) => {
    const map = new Map();
    for (const r of rows || []) {
        const k = r[key];
        if (!k) continue;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(r);
    }
    return map;
};

/**
 * Annual salary-report status (see report-schedule.js). `outstanding` lists the
 * closed years with no report yet, oldest first, each with its due date; `due`
 * is true when any is outstanding and `overdue` when one is past its due date.
 * `next` is the upcoming report when nothing is outstanding.
 */
export function reportStatus({ acceptance, approval, reports, today, config }) {
    if (!reportsExpected({ acceptance, approval })) return { expected: false };
    const reported = new Set((reports || []).map(r => reportYear(r.reporting_period)).filter(Boolean));
    const lastYear = reported.size ? Math.max(...reported) : null;
    const outstanding = owedYears({ acceptance, approval, today })
        .filter(y => !reported.has(y))
        .map(y => ({ year: y, due_date: isoDate(reportDeadline(y, config)),
                     overdue: today >= reportDeadline(y, config) }));
    // the next report is for the current year, or the one after if it is already filed
    const nextYear = Math.max(today.getUTCFullYear(), (lastYear || 0) + 1);
    const stopped = approval.outcome === 'suspended' || approval.outcome === 'terminated';
    return {
        expected: true,
        schedule: 'annually',
        last_year: lastYear,
        outstanding,
        due: outstanding.length > 0,
        overdue: outstanding.some(o => o.overdue),
        next: (outstanding.length || stopped) ? null
            : { year: nextYear, due_date: isoDate(reportDeadline(nextYear, config)) },
    };
}

export function annualReviewStatus(approval, today) {
    if (!approval || !(FUNDED_OUTCOMES.has(approval.outcome) || approval.outcome === 'suspended')) return null;
    const base = new Date(approval.meeting_date || approval.timestamp_utc);
    const dueDate = new Date(base);
    dueDate.setUTCFullYear(dueDate.getUTCFullYear() + 1);
    const warnFrom = new Date(dueDate.getTime() - ANNUAL_REVIEW_WARNING_DAYS * 86400000);
    return {
        due_date: dueDate.toISOString().slice(0, 10),
        due: today >= warnFrom,
        overdue: today >= dueDate,
    };
}

const NEW_GRANT = { page: 'grants-board', review_type: 'new_grant' };
const ANNUAL = { page: 'grants-board', review_type: 'annual_review' };
const SCREENING = { page: 'grants-screening' };

export function stageFor({ screening, dueDiligence, approval }) {
    if (screening.overall_result === 'blocked')
        return { stage: 'Screening blocked', tone: 'danger', next: { ...SCREENING, label: 'Re-screen' } };
    if (!dueDiligence)
        return { stage: 'Due diligence needed', tone: 'warning', next: { ...SCREENING, label: 'Record due diligence' } };
    if (!approval)
        return { stage: 'Awaiting board approval', tone: 'info', next: { ...NEW_GRANT, label: 'New grant review' } };
    switch (approval.outcome) {
        case 'deferred':   return { stage: 'Board deferred', tone: 'warning', next: { ...NEW_GRANT, label: 'New grant review' } };
        case 'denied':     return { stage: 'Denied', tone: 'secondary', next: { ...NEW_GRANT, label: 'New grant review' } };
        case 'terminated': return { stage: 'Terminated', tone: 'secondary', next: { ...NEW_GRANT, label: 'New grant review' } };
        case 'suspended':  return { stage: 'Suspended', tone: 'danger', next: { ...ANNUAL, label: 'Annual review' } };
        case 'renewed':    return { stage: 'Renewed', tone: 'success', next: { ...ANNUAL, label: 'Annual review' } };
        case 'modified':   return { stage: 'Renewed with changes', tone: 'success', next: { ...ANNUAL, label: 'Annual review' } };
        case 'approved_conditions':
                           return { stage: 'Approved with conditions', tone: 'success', next: { ...ANNUAL, label: 'Annual review' } };
        default:           return { stage: 'Approved', tone: 'success', next: { ...ANNUAL, label: 'Annual review' } };
    }
}

export async function listPipeline({ today = new Date() } = {}) {
    // server role (no token); the caller's role is checked by the endpoint
    const [config, screenings, dueDiligence, approvals, acceptances, reports] = await Promise.all([
        getGovernanceConfig('default'),
        records.listRecords({ table: 'ofac_screening' }),
        records.listRecords({ table: 'due_diligence' }),
        records.listRecords({ table: 'board_approval', filters: { status: 'final' } }),
        records.listRecords({ table: 'acceptance_record', filters: { status: 'accepted' } }),
        records.listRecords({ table: 'salary_report', filters: { status: 'submitted' } }),
    ]);
    const live = rows => (rows || []).filter(r => r.status !== 'superseded');
    const byScreening = groupBy(live(screenings), 'grantee_org');
    const byDd = groupBy(live(dueDiligence), 'grantee_org');
    const byApproval = groupBy(approvals, 'grantee_org');
    const byAcceptance = groupBy(acceptances, 'grantee_org_legal_name');
    const byReports = groupBy(reports, 'grantee_org');

    const rows = [];
    for (const [org, orgScreenings] of byScreening) {
        const screening = newest(orgScreenings);
        const dd = newest(byDd.get(org));
        const approval = newest(byApproval.get(org));
        const acceptance = newest(byAcceptance.get(org));
        const s = stageFor({ screening, dueDiligence: dd, approval });
        rows.push({
            grantee_org: org,
            country: (approval && approval.country) || screening.country || null,
            stage: s.stage,
            tone: s.tone,
            next: s.next,
            screening: { result: screening.overall_result, date: screening.timestamp_utc },
            decision: approval ? { outcome: approval.outcome, date: approval.meeting_date || approval.timestamp_utc } : null,
            agreement: acceptance
                ? { accepted: true, date: acceptance.timestamp_utc, signer: acceptance.signer_full_name }
                : { accepted: false },
            reports: reportStatus({ acceptance, approval, reports: byReports.get(org), today, config }),
            annual: annualReviewStatus(approval, today),
        });
    }
    rows.sort((a, b) => a.grantee_org.localeCompare(b.grantee_org));
    return rows;
}
