// ============================================================================
// Annual salary-report reminders — modelled on Ministry Review's document
// reminders (lib/server/worker-documents.js).
//
// Runs daily. For every grantee that owes an annual salary-use report (accepted
// agreement + funding authorized; see report-schedule.js), once a year's report
// is within REMINDER_LEAD_DAYS of its due date and still not filed, the
// organization's owners are emailed: the writable managers of its organization
// listing(s) plus the person who accepted the agreement. Reminders repeat every
// REMINDER_INTERVAL_DAYS, at most MAX_REMINDERS times per report, tracked in
// grants.report_reminders. Filing the report resolves its reminder.
// ============================================================================
import * as records from './records.js';
import { getGovernanceConfig } from './board.js';
import { owedYears, reportYear, reportDeadline, isoDate } from './report-schedule.js';
import { getServerDB, sendTemplatedEmail, fusionUserSummary } from '../utils.js';

export const REMINDER_LEAD_DAYS = 30;       // first reminder this long before the due date
export const REMINDER_INTERVAL_DAYS = 14;
export const MAX_REMINDERS = 4;             // e.g. Mar 1, Mar 15, Mar 29, then one overdue notice
export const EMAIL_TEMPLATE = 'grant-report-reminder';
const DAY = 86400000;

const newestBy = (rows, key) => {
    const map = new Map();
    for (const r of rows || []) if (r[key] && !map.has(r[key])) map.set(r[key], r);   // lists are newest first
    return map;
};
const longDate = d => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

// The people to remind for a grantee: its organization managers plus the
// agreement signer, de-duplicated by email.
async function recipientsFor(sdb, granteeOrg, acceptance, lookupUser) {
    const out = new Map();
    const managers = await sdb.grants.listGranteeOrgManagers(granteeOrg) || [];
    for (const m of managers) {
        try {
            const u = await lookupUser(m.external_user_id);
            if (!u || !u.email) continue;
            if (!(u.roles || []).includes('grantee'))
                console.warn('grant-reports: reminder recipient', u.email, 'for', granteeOrg,
                    'lacks the grantee role and cannot open the salary report page');
            out.set(u.email.toLowerCase(), { email: u.email, firstName: u.firstName || '' });
        } catch (err) {
            console.error('grant-reports: failed to look up user', m.external_user_id, err.message);
        }
    }
    const signer = acceptance && acceptance.signer_email;
    if (signer && !out.has(signer.toLowerCase()))
        out.set(signer.toLowerCase(), { email: signer, firstName: (acceptance.signer_full_name || '').split(' ')[0] });
    return [...out.values()];
}

/**
 * Send any reminders that are due. Options are for tests: `today`, `sendEmail`
 * (template, to, variables), `lookupUser` (externalUserId → {email, firstName, roles}).
 * Returns a summary of what was sent.
 */
export async function checkReportDeadlines({ today = new Date(), sendEmail = sendTemplatedEmail,
                                             lookupUser = fusionUserSummary } = {}) {
    const sdb = await getServerDB();
    const [config, approvals, acceptances, reports] = await Promise.all([
        getGovernanceConfig('default'),
        records.listRecords({ table: 'board_approval', filters: { status: 'final' } }),
        records.listRecords({ table: 'acceptance_record', filters: { status: 'accepted' } }),
        records.listRecords({ table: 'salary_report', filters: { status: 'submitted' } }),
    ]);
    const approvalByOrg = newestBy(approvals, 'grantee_org');
    const acceptanceByOrg = newestBy(acceptances, 'grantee_org_legal_name');
    const reportedYears = new Map();
    for (const r of reports || []) {
        const y = reportYear(r.reporting_period);
        if (!y) continue;
        if (!reportedYears.has(r.grantee_org)) reportedYears.set(r.grantee_org, new Set());
        reportedYears.get(r.grantee_org).add(y);
    }

    const summary = [];
    for (const [org, approval] of approvalByOrg) {
        const acceptance = acceptanceByOrg.get(org);
        const filed = reportedYears.get(org) || new Set();
        const pending = [];

        for (const year of owedYears({ acceptance, approval, today })) {
            const period = String(year);
            if (filed.has(year)) {
                await sdb.grants.resolveReportReminder(org, period, today.toISOString());
                continue;
            }
            const deadline = reportDeadline(year, config);
            if (today < new Date(deadline.getTime() - REMINDER_LEAD_DAYS * DAY)) continue;   // not coming due yet

            const reminder = (await sdb.grants.listReportReminders(org, period) || [])[0] || null;
            if (reminder) {
                if (reminder.resolved_on) continue;
                if (reminder.reminders_sent >= MAX_REMINDERS) continue;
                if (reminder.last_reminder_sent_on &&
                    today - new Date(reminder.last_reminder_sent_on) < REMINDER_INTERVAL_DAYS * DAY) continue;
            }
            pending.push({ year, period, deadline, reminder,
                           remindersSent: reminder ? reminder.reminders_sent + 1 : 1 });
        }
        if (pending.length === 0) continue;

        const recipients = await recipientsFor(sdb, org, acceptance, lookupUser);
        if (recipients.length === 0) {
            console.warn('grant-reports: report(s) due for', org, 'but no owner email on file; skipping');
            continue;
        }

        const reportsVar = pending.map(p => ({
            year: p.year,
            deadlineDate: longDate(p.deadline),
            overdue: today >= p.deadline,
            remindersSent: p.remindersSent,
            maxReminders: MAX_REMINDERS,
        }));
        const sentTo = [];
        for (const r of recipients) {
            try {
                await sendEmail(EMAIL_TEMPLATE, r.email, {
                    firstName: r.firstName,
                    granteeOrg: org,
                    reportUrl: 'https://' + process.env.DOMAIN + '/dashboard/grants-reports',
                    reports: reportsVar,
                });
                sentTo.push(r.email);
            } catch (err) {
                console.error('grant-reports: failed to send reminder to', r.email, 'for', org, err.message);
            }
        }
        if (sentTo.length === 0) continue;
        console.log('grant-reports: reminded', sentTo.join(', '), 'for', org, '—',
            pending.map(p => `${p.period}(${p.remindersSent}/${MAX_REMINDERS})`).join(', '));

        for (const p of pending) {
            const row = { reminders_sent: p.remindersSent, last_reminder_sent_on: today.toISOString(),
                          last_sent_to: sentTo.join(', ') };
            if (p.reminder) await sdb.grants.updateReportReminder(p.reminder.report_reminder_key, row);
            else await sdb.grants.insertReportReminder({ grantee_org: org, reporting_period: p.period,
                                                        deadline_date: isoDate(p.deadline), ...row });
        }
        summary.push({ grantee_org: org, sent_to: sentTo, periods: pending.map(p => p.period) });
    }
    return summary;
}
