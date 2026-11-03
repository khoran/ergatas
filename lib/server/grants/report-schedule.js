// ============================================================================
// Annual salary-use reporting rules, shared by the overview pipeline, report
// validation and the reminder job.
//
// Reports are always ANNUAL: one report per calendar year, its reporting_period
// is the year ("YYYY"). The report for year Y is due on a configurable month/day
// of year Y+1 (governance config `report_deadline`, default March 31, i.e. 90
// days after year end). Older reports may carry a monthly "YYYY-MM" period; they
// count toward the year they fall in.
// ============================================================================

export const DEFAULT_REPORT_DEADLINE = { month: 3, day: 31 };
const FUNDED_OUTCOMES = new Set(['approved', 'approved_conditions', 'renewed', 'modified']);

export const isAnnualPeriod = p => /^\d{4}$/.test(String(p || '').trim());

// The calendar year a report's period belongs to ("2026" or legacy "2026-05").
export function reportYear(period) {
    const m = /^(\d{4})(-\d{2})?$/.exec(String(period || '').trim());
    return m ? Number(m[1]) : null;
}

export function deadlineSetting(config) {
    const d = (config && config.report_deadline) || {};
    const month = Number(d.month), day = Number(d.day);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
    return { ...DEFAULT_REPORT_DEADLINE };
}

// Due date (UTC midnight) of the report for `year`; day is clamped to the month's length.
export function reportDeadline(year, config) {
    const { month, day } = deadlineSetting(config);
    const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
    return new Date(Date.UTC(year + 1, month - 1, Math.min(day, lastDay)));
}

export const isoDate = d => d.toISOString().slice(0, 10);

/**
 * The years an organization owes a report for, given its current acceptance and
 * board decision. Reports are owed once the agreement is accepted and funding
 * was authorized, for every closed calendar year from the year funding started
 * (the later of acceptance and approval). A suspended or terminated grant still
 * owes the years it was active in, up to the year of that decision.
 */
export function owedYears({ acceptance, approval, today = new Date() }) {
    if (!acceptance || !approval) return [];
    const outcome = approval.outcome;
    const stopped = outcome === 'suspended' || outcome === 'terminated';
    if (!FUNDED_OUTCOMES.has(outcome) && !stopped) return [];
    const startYear = Math.max(new Date(acceptance.timestamp_utc).getUTCFullYear(),
                               new Date(approval.timestamp_utc).getUTCFullYear());
    let lastYear = today.getUTCFullYear() - 1;   // most recent closed year
    if (stopped) lastYear = Math.min(lastYear, new Date(approval.meeting_date || approval.timestamp_utc).getUTCFullYear());
    const years = [];
    for (let y = startYear; y <= lastYear; y++) years.push(y);
    return years;
}

export const reportsExpected = ({ acceptance, approval }) =>
    !!acceptance && !!approval && (FUNDED_OUTCOMES.has(approval.outcome) ||
        approval.outcome === 'suspended' || approval.outcome === 'terminated');
