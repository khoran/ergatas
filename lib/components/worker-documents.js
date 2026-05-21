import alertify from 'alertifyjs';
import { ensureFields } from '../shared/shared-utils';

const DOCUMENT_TYPE_LABELS = { budget: 'Budget', report: 'Report' };
const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_LABELS);

function periodLabel(periodStart, frequency) {
    const d = new Date(periodStart + 'T00:00:00');
    const year = d.getFullYear();
    switch (frequency) {
        case 'monthly':    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
        case 'quarterly':  return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + year;
        case 'semi_annual': return d.getMonth() < 6 ? 'H1 ' + year : 'H2 ' + year;
        case 'annual':     return String(year);
        default:           return periodStart;
    }
}

// Returns ISO date string for the first day of the most recent complete period.
function currentPeriodStart(frequency) {
    const d = new Date();
    switch (frequency) {
        case 'monthly':
            return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
        case 'quarterly': {
            const q = Math.floor(d.getMonth() / 3);
            if (q === 0) return new Date(d.getFullYear() - 1, 9, 1).toISOString().slice(0, 10);
            return new Date(d.getFullYear(), (q - 1) * 3, 1).toISOString().slice(0, 10);
        }
        case 'semi_annual':
            if (d.getMonth() < 6) return new Date(d.getFullYear() - 1, 6, 1).toISOString().slice(0, 10);
            return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
        case 'annual':
            return new Date(d.getFullYear() - 1, 0, 1).toISOString().slice(0, 10);
        default:
            return null;
    }
}

export function register() {
    const name = 'worker-documents';
    ko.components.register(name, {
        viewModel: function (params) {
            const self = this;
            ensureFields(params, ['appState']);
            self.appState = params.appState;
            self.server = self.appState.server;

            self.loading = ko.observable(true);
            self.documents = ko.observableArray([]);
            self.workerDocSettings = ko.observable(null);
            self.error = ko.observable(null);

            self.enabled = ko.pureComputed(() => !!self.workerDocSettings()?.enabled);
            self.frequency = ko.pureComputed(() => self.workerDocSettings()?.submission_frequency ?? 'quarterly');

            self.currentPeriod = ko.pureComputed(() => {
                const freq = self.frequency();
                const periodStr = currentPeriodStart(freq);
                if (!periodStr) return null;
                return {
                    period: periodStr,
                    label: periodLabel(periodStr, freq),
                };
            });

            // For each document type, return the submitted doc for the current period (or null).
            self.currentPeriodSlots = ko.pureComputed(() => {
                const cp = self.currentPeriod();
                if (!cp) return [];
                const docs = self.documents();
                return DOCUMENT_TYPES.map(type => {
                    const submitted = docs.find(d => d.document_type === type && d.submission_period === cp.period);
                    return {
                        type,
                        label: DOCUMENT_TYPE_LABELS[type],
                        period: cp.period,
                        periodLabel: cp.label,
                        submitted: submitted ?? null,
                    };
                });
            });

            // Docs from previous periods
            self.historicalDocs = ko.pureComputed(() => {
                const cp = self.currentPeriod();
                const docs = self.documents();
                if (!cp) return docs;
                return docs.filter(d => d.submission_period !== cp.period);
            });

            self.load = async function () {
                self.loading(true);
                self.error(null);
                try {
                    const result = await self.server.authPostJson('/api/workerDocuments/list');
                    self.documents(result.documents ?? []);
                    self.workerDocSettings(result.workerDocSettings);
                } catch (err) {
                    console.error('worker-documents: failed to load', err);
                    self.error('Failed to load documents. Please try again.');
                } finally {
                    self.loading(false);
                }
            };

            self.uploadDocument = async function (slot) {
                const uploaderUtils = await import(/* webpackChunkName: "uppy", webpackPrefetch: true */ '../client/upload');
                const userKey = self.appState.loggedInUser().user_key();
                const uppy = uploaderUtils.generalFileUploader('worker-docs/user_' + userKey);

                uppy.on('transloadit:complete', async (assembly) => {
                    uppy.getPlugin('Dashboard').closeModal();
                    const results = assembly.results;
                    const allResults = Object.values(results).flat();
                    if (!allResults.length) return;
                    const file = allResults[0];

                    try {
                        const fullUrl = file.url || '';
                        const storagePath = fullUrl.slice(fullUrl.indexOf('worker-docs/'));
                        await self.server.authPostJson('/api/workerDocuments/record', {
                            document_type:     slot.type,
                            storage_path:      storagePath,
                            original_filename: file.name || file.basename || 'document',
                            submission_period: slot.period,
                        });
                        await self.load();
                    } catch (err) {
                        console.error('worker-documents: failed to record document', err);
                        alertify.error('Upload succeeded but failed to save the record. Please contact support.');
                    }
                });

                uppy.getPlugin('Dashboard').openModal();
            };

            self.deleteDocument = function (doc) {
                alertify.confirm(
                    'Delete Document',
                    `Are you sure you want to delete this ${DOCUMENT_TYPE_LABELS[doc.document_type]} document?`,
                    async () => {
                        try {
                            await self.server.authPostJson('/api/workerDocuments/delete', {
                                worker_document_key: doc.worker_document_key,
                            });
                            await self.load();
                        } catch (err) {
                            console.error('worker-documents: failed to delete', err);
                            alertify.error('Failed to delete document.');
                        }
                    },
                    () => {}
                );
            };

            self.formatDate = function (isoString) {
                if (!isoString) return '';
                return new Date(isoString).toLocaleDateString();
            };

            self.docTypeLabel = function (type) {
                return DOCUMENT_TYPE_LABELS[type] ?? type;
            };

            self.load();
        },
        template: require('./worker-documents.html'),
    });
}
