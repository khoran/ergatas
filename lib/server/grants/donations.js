// ============================================================================
// Donation totals for the salary-report prefill (Phase 4, lifecycle [6]).
//
// The salary report's "sent for salary" is prefilled from the ACTUAL donations
// each of the grantee org's workers received during the reporting period (the
// Stripe-backed web.possible_transactions), summed per worker. Only confirmed AND
// paid donations count. Reads run under the server role via a dedicated web view;
// the caller's authorization for the org is validated in reports.reportContext
// BEFORE this is called.
// ============================================================================
import { getServerDB } from '../utils.js';

// Parse a reporting period into a [from, to) range of ISO date strings, or null
// if it is missing/malformed. Reports are annual ("YYYY" → the calendar year);
// legacy monthly periods ("YYYY-MM" → that month) are still accepted.
export function periodRange(period){
    const p = String(period || '').trim();
    const y = /^(\d{4})$/.exec(p);
    if (y) return { from: y[1] + '-01-01', to: (Number(y[1]) + 1) + '-01-01' };
    const m = /^(\d{4})-(\d{2})$/.exec(p);
    if (!m) return null;
    const year = Number(m[1]), month = Number(m[2]);   // month is 1-12
    if (month < 1 || month > 12) return null;
    const pad = n => String(n).padStart(2, '0');
    const from = year + '-' + pad(month) + '-01';
    const to = month === 12 ? (year + 1) + '-01-01' : year + '-' + pad(month + 1) + '-01';
    return { from, to };
}

/**
 * Sum donations per worker for a grantee org (by non_profit_key) over a period,
 * shaped like disbursements.sentForPeriod so the salary-report client prefill is
 * unchanged: { total, byWorker: { <worker name>: amount } }. Returns zeros when
 * the org key or period is missing/malformed.
 */
export async function donationsForPeriod(nonProfitKey, period){
    const range = periodRange(period);
    if (nonProfitKey == null || !range) return { total: 0, byWorker: {} };

    const db = await getServerDB();
    const rows = await db.grants.listWorkerDonations(nonProfitKey, range.from, range.to) || [];

    const byWorker = {};
    let total = 0;
    for (const r of rows) {
        const amount = Number(r.amount) || 0;
        total += amount;
        const key = (r.name && r.name.trim()) || ('profile ' + r.missionary_profile_key);
        byWorker[key] = Math.round(((byWorker[key] || 0) + amount) * 100) / 100;
    }
    return { total: Math.round(total * 100) / 100, byWorker };
}
