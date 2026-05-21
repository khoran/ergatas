import { AppError } from './app-error.js';
import { jwtPayload, getServerDB, sendTemplatedEmail, userIdToEmail } from './utils.js';

const DOCUMENT_TYPES = ['budget', 'report'];

// Returns the first day of the last fully completed period before `now`.
function previousPeriodStart(now, frequency) {
    const d = new Date(now);
    switch (frequency) {
        case 'monthly':
            return new Date(d.getFullYear(), d.getMonth() - 1, 1);
        case 'quarterly': {
            const q = Math.floor(d.getMonth() / 3);
            if (q === 0) return new Date(d.getFullYear() - 1, 9, 1); // Q4 last year
            return new Date(d.getFullYear(), (q - 1) * 3, 1);
        }
        case 'semi_annual':
            if (d.getMonth() < 6) return new Date(d.getFullYear() - 1, 6, 1);
            return new Date(d.getFullYear(), 0, 1);
        case 'annual':
            return new Date(d.getFullYear() - 1, 0, 1);
        default:
            throw new Error('unknown submission_frequency: ' + frequency);
    }
}

// Returns the deadline date for a given period (deadline_day of the month after period end).
function deadlineForPeriod(periodStart, frequency, deadlineDay) {
    let monthsInPeriod;
    switch (frequency) {
        case 'monthly':    monthsInPeriod = 1;  break;
        case 'quarterly':  monthsInPeriod = 3;  break;
        case 'semi_annual': monthsInPeriod = 6; break;
        case 'annual':     monthsInPeriod = 12; break;
        default: throw new Error('unknown submission_frequency: ' + frequency);
    }
    // Month after period end (JS Date handles overflow into next year)
    return new Date(periodStart.getFullYear(), periodStart.getMonth() + monthsInPeriod, deadlineDay);
}

function formatPeriodLabel(periodStart, frequency) {
    const year = periodStart.getFullYear();
    switch (frequency) {
        case 'monthly':
            return periodStart.toLocaleString('default', { month: 'long', year: 'numeric' });
        case 'quarterly': {
            const q = Math.floor(periodStart.getMonth() / 3) + 1;
            return `Q${q} ${year}`;
        }
        case 'semi_annual':
            return periodStart.getMonth() === 0 ? `H1 ${year}` : `H2 ${year}`;
        case 'annual':
            return `${year}`;
        default:
            return periodStart.toISOString().slice(0, 10);
    }
}

function toISODate(d) {
    return d.toISOString().slice(0, 10);
}

// Looks up user_key via user_info (accessible to ergatas_server, bypasses RLS on users table).
async function getUserKey(sdb, userId) {
    const info = await sdb.dbAuthGet('/user_info?external_user_id=eq.' + userId, sdb.single());
    if (!info) throw new AppError('user not found');
    return info.user_key;
}

// Returns the worker_documents settings for the org a user belongs to, or null if not enabled.
export async function getWorkerOrgSettings(userId) {
    const sdb = await getServerDB();
    const user_key = await getUserKey(sdb, userId);

    const profiles = await sdb.dbAuthGet(
        '/all_profile_search?user_key=eq.' + user_key +
        '&state=not.in.(disabled,blocked)&limit=1'
    );
    if (!profiles || profiles.length === 0) return null;

    const orgKey = profiles[0].data?.organization_key;
    if (!orgKey) return null;

    const org = await sdb.dbAuthGet(
        '/organizations_view?organization_key=eq.' + orgKey,
        sdb.single()
    );
    if (!org) return null;

    return {
        org,
        workerDocSettings: org.settings?.worker_documents ?? null,
    };
}

export async function getWorkerDocSettings(token) {
    const payload = await jwtPayload(token);
    if (!payload) throw new AppError('not authenticated');
    const result = await getWorkerOrgSettings(payload.sub);
    return { enabled: result?.workerDocSettings?.enabled === true };
}

export async function recordWorkerDocument(token, { document_type, storage_path, original_filename, submission_period }) {
    const payload = await jwtPayload(token);
    if (!payload) throw new AppError('not authenticated');

    if (!DOCUMENT_TYPES.includes(document_type))
        throw new AppError('invalid document_type');

    const { workerDocSettings } = await getWorkerOrgSettings(payload.sub) ?? {};
    if (!workerDocSettings?.enabled)
        throw new AppError('worker documents not enabled for your organization');

    const sdb = await getServerDB();
    const user_key = await getUserKey(sdb, payload.sub);

    await sdb.dbAuthPost('/worker_documents_view', {
        user_key,
        document_type,
        storage_path,
        original_filename,
        submission_period,
    });

    // Resolve any open reminder for this period
    await sdb.dbAuthPatch(
        `/worker_document_reminders_view?user_key=eq.${user_key}&document_type=eq.${document_type}&submission_period=eq.${submission_period}&resolved_on=is.null`,
        { resolved_on: new Date().toISOString() }
    );
}

export async function listWorkerDocuments(token) {
    const payload = await jwtPayload(token);
    if (!payload) throw new AppError('not authenticated');

    const sdb = await getServerDB();
    const user_key = await getUserKey(sdb, payload.sub);

    const [docs, settings] = await Promise.all([
        sdb.dbAuthGet(`/worker_documents_view?user_key=eq.${user_key}&order=submission_period.desc`),
        getWorkerOrgSettings(payload.sub),
    ]);

    return {
        documents: docs ?? [],
        workerDocSettings: settings?.workerDocSettings ?? null,
    };
}

export async function deleteWorkerDocument(token, worker_document_key) {
    const payload = await jwtPayload(token);
    if (!payload) throw new AppError('not authenticated');

    const sdb = await getServerDB();
    const user_key = await getUserKey(sdb, payload.sub);

    await sdb.dbAuthDelete(
        `/worker_documents_view?worker_document_key=eq.${worker_document_key}&user_key=eq.${user_key}`
    );
}

export async function getOrgCompliance(token, submission_period) {
    const payload = await jwtPayload(token);
    if (!payload) throw new AppError('not authenticated');

    const sdb = await getServerDB();
    const orgFilter = await sdb.getUserOrgSearchFilter(payload.sub);
    if (!orgFilter || orgFilter.read_only) throw new AppError('not authorized');

    const { organization_key } = orgFilter;

    // Get all active profiles in the org
    const profiles = await sdb.dbAuthGet(
        `/all_profile_search?data->>organization_key=eq.${organization_key}&state=not.in.(disabled,blocked)`
    );
    if (!profiles || profiles.length === 0) return [];

    const userKeys = profiles.map(p => p.user_key);

    let docFilter = `/worker_documents_view?user_key=in.(${userKeys.join(',')})`;
    if (submission_period) docFilter += `&submission_period=eq.${submission_period}`;

    let reminderFilter = `/worker_document_reminders_view?user_key=in.(${userKeys.join(',')})&resolved_on=is.null`;

    const [docs, reminders] = await Promise.all([
        sdb.dbAuthGet(docFilter),
        sdb.dbAuthGet(reminderFilter),
    ]);

    return profiles.map(profile => ({
        user_key: profile.user_key,
        missionary_profile_key: profile.missionary_profile_key,
        first_name: profile.data?.first_name,
        last_name: profile.data?.last_name,
        documents: (docs ?? []).filter(d => d.user_key === profile.user_key),
        outstanding_reminders: (reminders ?? []).filter(r => r.user_key === profile.user_key),
    }));
}

export async function updateOrgDocSettings(token, organization_key, worker_documents_config) {
    const payload = await jwtPayload(token);
    if (!payload || !payload.roles?.includes('organization_review'))
        throw new AppError('not authorized');

    const sdb = await getServerDB();
    const org = await sdb.dbAuthGet(
        '/organizations_view?organization_key=eq.' + organization_key,
        sdb.single()
    );
    if (!org) throw new AppError('organization not found');

    const updatedSettings = { ...(org.settings ?? {}), worker_documents: worker_documents_config };
    await sdb.dbAuthPatch(
        '/organizations_view?organization_key=eq.' + organization_key,
        { settings: updatedSettings }
    );
}

export async function checkWorkerDocumentDeadlines() {
    const now = new Date();
    const sdb = await getServerDB();

    const allOrgs = await sdb.dbAuthGet('/organizations_view');
    const orgs = (allOrgs ?? []).filter(o => o.settings?.worker_documents?.enabled === true);

    for (const org of orgs) {
        const config = org.settings.worker_documents;
        const { submission_frequency, deadline_day } = config;

        const periodStart = previousPeriodStart(now, submission_frequency);
        const deadline = deadlineForPeriod(periodStart, submission_frequency, deadline_day);

        if (now < deadline) continue;

        const periodStartStr = toISODate(periodStart);

        const profiles = await sdb.dbAuthGet(
            `/all_profile_search?data->>organization_key=eq.${org.organization_key}&state=not.in.(disabled,blocked)`
        );
        if (!profiles || profiles.length === 0) continue;

        for (const profile of profiles) {
            for (const docType of DOCUMENT_TYPES) {
                const docs = await sdb.dbAuthGet(
                    `/worker_documents_view?user_key=eq.${profile.user_key}&document_type=eq.${docType}&submission_period=eq.${periodStartStr}`
                );

                if (docs && docs.length > 0) {
                    // Submitted — resolve any open reminder
                    await sdb.dbAuthPatch(
                        `/worker_document_reminders_view?user_key=eq.${profile.user_key}&document_type=eq.${docType}&submission_period=eq.${periodStartStr}&resolved_on=is.null`,
                        { resolved_on: now.toISOString() }
                    );
                    continue;
                }

                // Check existing reminder record
                const reminders = await sdb.dbAuthGet(
                    `/worker_document_reminders_view?user_key=eq.${profile.user_key}&document_type=eq.${docType}&submission_period=eq.${periodStartStr}`
                );
                const reminder = reminders && reminders[0];

                let email;
                try {
                    email = await userIdToEmail(profile.external_user_id);
                } catch (err) {
                    console.error('worker-documents: failed to get email for user', profile.external_user_id, err.message);
                    continue;
                }

                try {
                    await sendTemplatedEmail('worker-document-reminder', email, {
                        first_name:     profile.data?.first_name ?? '',
                        document_type:  docType,
                        period_label:   formatPeriodLabel(periodStart, submission_frequency),
                        deadline_date:  deadline.toLocaleDateString(),
                        upload_url:     'https://' + process.env.DOMAIN + '/dashboard',
                        reminders_sent: reminder ? reminder.reminders_sent + 1 : 1,
                    });
                } catch (err) {
                    console.error('worker-documents: failed to send reminder email to', email, err.message);
                    continue;
                }

                if (reminder) {
                    await sdb.dbAuthPatch(
                        `/worker_document_reminders_view?worker_document_reminder_key=eq.${reminder.worker_document_reminder_key}`,
                        {
                            reminders_sent: reminder.reminders_sent + 1,
                            last_reminder_sent_on: now.toISOString(),
                        }
                    );
                } else {
                    await sdb.dbAuthPost('/worker_document_reminders_view', {
                        user_key:               profile.user_key,
                        document_type:          docType,
                        submission_period:      periodStartStr,
                        deadline_date:          toISODate(deadline),
                        reminders_sent:         1,
                        last_reminder_sent_on:  now.toISOString(),
                    });
                }
            }
        }
    }
}
