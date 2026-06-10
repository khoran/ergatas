import { AppError } from './app-error.js';
import { jwtPayload, getServerDB, sendTemplatedEmail, userIdToEmail, deleteBlobAndThumbnailByPath } from './utils.js';

const DOCUMENT_TYPES = ['budget', 'report'];
const REMINDER_INTERVAL_DAYS = 14;
const MAX_REMINDERS = 3;

// Budgets are always annual; reports follow the org's configured report_frequency.
function frequencyForDocType(docType, reportFrequency) {
    if (docType === 'budget') return 'annual';
    return reportFrequency;
}

// Returns the first day of the last fully completed period before `now`.
function previousPeriodStart(now, frequency) {
    const d = new Date(now);
    switch (frequency) {
        case 'quarterly': {
            const q = Math.floor(d.getMonth() / 3);
            if (q === 0) return new Date(d.getFullYear() - 1, 9, 1); // Q4 last year
            return new Date(d.getFullYear(), (q - 1) * 3, 1);
        }
        case 'annual':
            return new Date(d.getFullYear() - 1, 0, 1);
        default:
            throw new Error('unknown frequency: ' + frequency);
    }
}

// Returns the deadline date for a given period (deadline_day of the month after period end).
function deadlineForPeriod(periodStart, frequency, deadlineDay) {
    let monthsInPeriod;
    switch (frequency) {
        case 'quarterly':  monthsInPeriod = 3;  break;
        case 'annual':     monthsInPeriod = 12; break;
        default: throw new Error('unknown frequency: ' + frequency);
    }
    return new Date(periodStart.getFullYear(), periodStart.getMonth() + monthsInPeriod, deadlineDay);
}

function formatPeriodLabel(periodStart, frequency) {
    const year = periodStart.getFullYear();
    switch (frequency) {
        case 'quarterly': {
            const q = Math.floor(periodStart.getMonth() / 3) + 1;
            return `Q${q} ${year}`;
        }
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
    const info = await sdb.getUserInfoByUserId(userId);
    if (!info) throw new AppError('user not found');
    return info.user_key;
}

// Fetches the profile and verifies the caller's user_key owns it.
async function getOwnedProfile(sdb, userId, missionary_profile_key) {
    const user_key = await getUserKey(sdb, userId);
    const profile = await sdb.profiles.getProfilePreviewByKey(missionary_profile_key);
    if (!profile) throw new AppError('profile not found');
    if (profile.user_key !== user_key) throw new AppError('not authorized for this profile');
    return profile;
}

// Returns the worker_documents settings for the org that owns the given profile, or null if not enabled.
async function getWorkerOrgSettingsForProfile(sdb, profile) {
    const orgKey = profile.data?.organization_key;
    if (!orgKey) return null;

    const org = await sdb.organizations.getOrg(orgKey);
    if (!org) return null;

    return {
        org,
        workerDocSettings: org.settings?.worker_documents ?? null,
    };
}

export async function recordWorkerDocument(token, { missionary_profile_key, document_type, storage_path, original_filename, submission_period }) {
    const payload = await jwtPayload(token);
    if (!payload) throw new AppError('not authenticated');

    if (!DOCUMENT_TYPES.includes(document_type))
        throw new AppError('invalid document_type');

    const sdb = await getServerDB();
    const profile = await getOwnedProfile(sdb, payload.sub, missionary_profile_key);

    const { workerDocSettings } = await getWorkerOrgSettingsForProfile(sdb, profile) ?? {};
    if (!workerDocSettings?.enabled)
        throw new AppError('worker documents not enabled for your organization');

    try {
        await sdb.workerDocs.insertDocument({
            missionary_profile_key,
            document_type,
            storage_path,
            original_filename,
            submission_period,
        });
    } catch (err) {
        if (err.status === 409) {
            // Unique constraint: a doc for this (profile, type, period) already exists.
            // Clean up the just-uploaded blob since no record points to it.
            try { await deleteBlobAndThumbnailByPath(storage_path); }
            catch (cleanupErr) { console.error('worker-documents: failed to clean up orphaned blob', storage_path, cleanupErr.message); }
            throw new AppError('DOCUMENT_EXISTS');
        }
        throw err;
    }

    // Resolve any open reminder for this period
    await sdb.workerDocs.resolveOpenReminder(missionary_profile_key, document_type, submission_period, new Date().toISOString());
}

export async function listWorkerDocuments(token, missionary_profile_key) {
    const payload = await jwtPayload(token);
    if (!payload) throw new AppError('not authenticated');
    if (!missionary_profile_key) throw new AppError('missionary_profile_key required');

    const sdb = await getServerDB();
    const profile = await getOwnedProfile(sdb, payload.sub, missionary_profile_key);

    const [docs, settings] = await Promise.all([
        sdb.workerDocs.listDocumentsForProfile(missionary_profile_key),
        getWorkerOrgSettingsForProfile(sdb, profile),
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

    const doc = await sdb.workerDocs.getDocument(worker_document_key);
    if (!doc) throw new AppError('document not found');

    const profile = await sdb.profiles.getProfilePreviewByKey(doc.missionary_profile_key);
    if (!profile || profile.user_key !== user_key)
        throw new AppError('not authorized for this profile');

    await sdb.workerDocs.deleteDocument(worker_document_key);

    await deleteBlobAndThumbnailByPath(doc.storage_path);
}

export async function getOrgCompliance(token, submission_period) {
    const payload = await jwtPayload(token);
    if (!payload) throw new AppError('not authenticated');

    const sdb = await getServerDB();
    const orgFilter = await sdb.getUserOrgSearchFilter(payload.sub);
    if (!orgFilter || orgFilter.read_only) throw new AppError('not authorized');

    const { organization_key } = orgFilter;

    // Get all active profiles in the org
    const profiles = await sdb.profiles.listActiveOrgProfiles(organization_key);
    if (!profiles || profiles.length === 0) return [];

    const profileKeys = profiles.map(p => p.missionary_profile_key);

    const [docs, reminders] = await Promise.all([
        sdb.workerDocs.listDocumentsForProfiles(profileKeys, submission_period),
        sdb.workerDocs.listUnresolvedRemindersForProfiles(profileKeys),
    ]);

    return profiles.map(profile => ({
        user_key: profile.user_key,
        missionary_profile_key: profile.missionary_profile_key,
        first_name: profile.data?.first_name,
        last_name: profile.data?.last_name,
        documents: (docs ?? []).filter(d => d.missionary_profile_key === profile.missionary_profile_key),
        outstanding_reminders: (reminders ?? []).filter(r => r.missionary_profile_key === profile.missionary_profile_key),
    }));
}

export async function updateOrgDocSettings(token, organization_key, worker_documents_config) {
    const payload = await jwtPayload(token);
    if (!payload || !payload.roles?.includes('organization_review'))
        throw new AppError('not authorized');

    const sdb = await getServerDB();
    const org = await sdb.organizations.getOrg(organization_key);
    if (!org) throw new AppError('organization not found');

    const updatedSettings = { ...(org.settings ?? {}), worker_documents: worker_documents_config };
    await sdb.organizations.updateOrg(organization_key, { settings: updatedSettings });
}

// Sends a single reminder email for testing. Any template variable can be overridden;
// unspecified ones are filled from the caller's identity and the current period.
export async function sendTestReminderEmail(token, params) {
    const payload = await jwtPayload(token);
    if (!payload) throw new AppError('not authenticated');
    if (!payload.roles?.includes('organization_review')) throw new AppError('not authorized');

    const {
        to_email,
        first_name,
        documents,
        document_count,
        // Single-doc shortcuts (used when `documents` and `document_count` not provided):
        document_type = 'report',
        period_label,
        deadline_date,
        reminders_sent = 1,
        report_frequency = 'quarterly',
        deadline_day = 15,
    } = params ?? {};

    const email = to_email || await userIdToEmail(payload.sub);
    const now = new Date();

    const buildOne = (docType, override = {}) => {
        if (!DOCUMENT_TYPES.includes(docType))
            throw new AppError('invalid document_type: ' + docType);
        const freq = frequencyForDocType(docType, override.report_frequency ?? report_frequency);
        const periodStart = previousPeriodStart(now, freq);
        const computedDeadline = deadlineForPeriod(periodStart, freq, override.deadline_day ?? deadline_day);
        return {
            documentType:  docType,
            periodLabel:   override.period_label  ?? period_label  ?? formatPeriodLabel(periodStart, freq),
            deadlineDate:  override.deadline_date ?? deadline_date ?? computedDeadline.toLocaleDateString(),
            remindersSent: override.reminders_sent ?? reminders_sent,
        };
    };

    const randomDoc = () => {
        const docType = DOCUMENT_TYPES[Math.floor(Math.random() * DOCUMENT_TYPES.length)];
        const freq = frequencyForDocType(docType, report_frequency);
        const periodStart = previousPeriodStart(now, freq);
        const computedDeadline = deadlineForPeriod(periodStart, freq, deadline_day);
        return {
            documentType:  docType,
            periodLabel:   formatPeriodLabel(periodStart, freq),
            deadlineDate:  computedDeadline.toLocaleDateString(),
            remindersSent: 1 + Math.floor(Math.random() * MAX_REMINDERS),
        };
    };

    let documentsList;
    if (Array.isArray(documents) && documents.length > 0) {
        documentsList = documents.map(d => buildOne(d.document_type ?? document_type, d));
    } else if (document_count > 0) {
        documentsList = Array.from({ length: document_count }, randomDoc);
    } else {
        documentsList = [buildOne(document_type)];
    }

    const variables = {
        firstName: first_name ?? 'Test',
        uploadUrl: 'https://' + process.env.DOMAIN + '/profile/edit/81#files',
        documents: documentsList,
    };

    await sendTemplatedEmail('worker-document-reminder', email, variables);

    return { sent_to: email, variables };
}

export async function checkWorkerDocumentDeadlines() {
    const now = new Date();
    const sdb = await getServerDB();

    const allOrgs = await sdb.organizations.listAllOrgs();
    const orgs = (allOrgs ?? []).filter(o => o.settings?.worker_documents?.enabled === true);

    for (const org of orgs) {
        const config = org.settings.worker_documents;
        const { report_frequency, deadline_day } = config;

        const profiles = await sdb.profiles.listActiveOrgProfiles(org.organization_key);
        if (!profiles || profiles.length === 0) continue;

        if (!deadline_day) {
            console.warn('worker-documents: org', org.organization_key, 'is enabled but missing deadline_day; skipping');
            continue;
        }

        const docTypeContexts = [];
        for (const docType of DOCUMENT_TYPES) {
            const frequency = frequencyForDocType(docType, report_frequency);
            if (!frequency) {
                console.warn('worker-documents: org', org.organization_key, 'missing report_frequency; skipping', docType);
                continue;
            }
            const periodStart = previousPeriodStart(now, frequency);
            const deadline = deadlineForPeriod(periodStart, frequency, deadline_day);

            if (now < deadline) {
                console.log('worker-documents: org', org.organization_key, docType, 'deadline', toISODate(deadline), 'not reached; skipping');
                continue;
            }

            docTypeContexts.push({
                docType,
                frequency,
                periodStart,
                deadline,
                periodStartStr: toISODate(periodStart),
            });
        }

        if (docTypeContexts.length === 0) continue;
        console.log('worker-documents: processing org', org.organization_key, 'docTypes', docTypeContexts.map(c => `${c.docType}/${c.periodStartStr}`).join(','), 'profiles', profiles.length);

        for (const profile of profiles) {
            const who = `${profile.missionary_profile_key} (${profile.data?.first_name ?? ''} ${profile.data?.last_name ?? ''})`;
            const pending = [];

            for (const ctx of docTypeContexts) {
                const { docType, periodStartStr } = ctx;

                const docs = await sdb.workerDocs.getDocumentForPeriod(profile.missionary_profile_key, docType, periodStartStr);

                if (docs && docs.length > 0) {
                    console.log('worker-documents: skip', who, docType, periodStartStr, '— document already submitted');
                    await sdb.workerDocs.resolveOpenReminder(profile.missionary_profile_key, docType, periodStartStr, now.toISOString());
                    continue;
                }

                const reminders = await sdb.workerDocs.listRemindersForPeriod(profile.missionary_profile_key, docType, periodStartStr);
                const reminder = reminders && reminders[0];

                if (reminder) {
                    if (reminder.resolved_on) {
                        console.log('worker-documents: skip', who, docType, periodStartStr, '— reminder already resolved on', reminder.resolved_on);
                        continue;
                    }
                    if (reminder.reminders_sent >= MAX_REMINDERS) {
                        console.log('worker-documents: skip', who, docType, periodStartStr, '— reminder cap reached', reminder.reminders_sent, '/', MAX_REMINDERS);
                        continue;
                    }
                    if (reminder.last_reminder_sent_on) {
                        const last = new Date(reminder.last_reminder_sent_on);
                        if ((now - last) < REMINDER_INTERVAL_DAYS * 86400 * 1000) {
                            const daysSince = Math.floor((now - last) / 86400000);
                            console.log('worker-documents: skip', who, docType, periodStartStr, '— last reminder sent', daysSince, 'days ago, under', REMINDER_INTERVAL_DAYS, 'day cadence');
                            continue;
                        }
                    }
                }

                pending.push({ ctx, reminder, remindersSent: reminder ? reminder.reminders_sent + 1 : 1 });
            }

            if (pending.length === 0) continue;

            let email;
            try {
                email = await userIdToEmail(profile.external_user_id);
            } catch (err) {
                console.error('worker-documents: failed to get email for user', profile.external_user_id, err.message);
                continue;
            }

            try {
                await sendTemplatedEmail('worker-document-reminder', email, {
                    firstName: profile.data?.first_name ?? '',
                    uploadUrl: 'https://' + process.env.DOMAIN + '/profile/edit/' + profile.missionary_profile_key + '#files',
                    documents: pending.map(p => ({
                        documentType:  p.ctx.docType,
                        periodLabel:   formatPeriodLabel(p.ctx.periodStart, p.ctx.frequency),
                        deadlineDate:  p.ctx.deadline.toLocaleDateString(),
                        remindersSent: p.remindersSent,
                    })),
                });
                console.log('worker-documents: sent reminder to', email, 'for', who, '— documents:',
                    pending.map(p => `${p.ctx.docType}/${p.ctx.periodStartStr}(${p.remindersSent}/${MAX_REMINDERS})`).join(', '));
            } catch (err) {
                console.error('worker-documents: failed to send reminder email to', email, err.message);
                continue;
            }

            for (const p of pending) {
                if (p.reminder) {
                    await sdb.workerDocs.updateReminder(p.reminder.worker_document_reminder_key, {
                        reminders_sent: p.reminder.reminders_sent + 1,
                        last_reminder_sent_on: now.toISOString(),
                    });
                } else {
                    await sdb.workerDocs.insertReminder({
                        missionary_profile_key: profile.missionary_profile_key,
                        document_type:          p.ctx.docType,
                        submission_period:      p.ctx.periodStartStr,
                        deadline_date:          toISODate(p.ctx.deadline),
                        reminders_sent:         1,
                        last_reminder_sent_on:  now.toISOString(),
                    });
                }
            }
        }
    }
}
