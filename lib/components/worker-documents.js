import { ensureFields } from '../shared/shared-utils';

const DOCUMENT_TYPE_LABELS = { budget: 'Budget', report: 'Report' };

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

// Steps back one period from an ISO date string.
function previousPeriodStart(isoDate, frequency) {
    const d = new Date(isoDate + 'T00:00:00');
    switch (frequency) {
        case 'monthly':     return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
        case 'quarterly':   return new Date(d.getFullYear(), d.getMonth() - 3, 1).toISOString().slice(0, 10);
        case 'semi_annual': return new Date(d.getFullYear(), d.getMonth() - 6, 1).toISOString().slice(0, 10);
        case 'annual':      return new Date(d.getFullYear() - 1, 0, 1).toISOString().slice(0, 10);
        default:            return null;
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

            const userKey = self.appState.loggedInUser().user_key();
            self.bucketPrefix = 'worker-docs/user_' + userKey;

            // Incremented after upload to signal file-collection to refresh its list.
            self.refreshTrigger = ko.observable(0);

            // "Add document" form state
            self.addDocFormVisible = ko.observable(false);
            self.newDocType = ko.observable('budget');
            self.newDocPeriod = ko.observable(null);
            self.documentTypeOptions = Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));

            // Last 4 periods selectable in the form, derived from current frequency.
            self.periodOptions = ko.pureComputed(() => {
                const freq = self.frequency();
                const options = [];
                let start = currentPeriodStart(freq);
                for (let i = 0; i < 4 && start; i++) {
                    options.push({ value: start, label: periodLabel(start, freq) });
                    start = previousPeriodStart(start, freq);
                }
                return options;
            });

            self.openAddDocForm = function () {
                self.newDocPeriod(currentPeriodStart(self.frequency()));
                self.addDocFormVisible(true);
            };

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

            self.uploadNewDocument = async function () {
                const uploaderUtils = await import(/* webpackChunkName: "uppy", webpackPrefetch: true */ '../client/upload');
                const uppy = uploaderUtils.generalFileUploader(self.bucketPrefix);

                uppy.on('transloadit:complete', async (assembly) => {
                    uppy.getPlugin('Dashboard').closeModal();
                    const allResults = Object.values(assembly.results).flat();
                    if (!allResults.length) return;
                    const file = allResults[0];

                    try {
                        const fullUrl = file.url || '';
                        const storagePath = fullUrl.slice(fullUrl.indexOf('worker-docs/'));
                        await self.server.authPostJson('/api/workerDocuments/record', {
                            document_type:     self.newDocType(),
                            storage_path:      storagePath,
                            original_filename: file.name || file.basename || 'document',
                            submission_period: self.newDocPeriod(),
                        });
                        await self.load();
                        self.refreshTrigger(self.refreshTrigger() + 1);
                        self.addDocFormVisible(false);
                    } catch (err) {
                        console.error('worker-documents: failed to record document', err);
                        alertify.error('Upload succeeded but failed to save the record. Please contact support.');
                    }
                });

                uppy.getPlugin('Dashboard').openModal();
            };

            // Passed to file-collection; handles DB + blob deletion.
            self.onDeleteFile = async function (file) {
                const doc = self.documents().find(d =>
                    d.storage_path && d.storage_path.endsWith('/' + file.name)
                );
                if (!doc) {
                    console.error('worker-documents: no DB record found for blob', file.name);
                    return;
                }
                await self.server.authPostJson('/api/workerDocuments/delete', {
                    worker_document_key: doc.worker_document_key,
                });
                await self.load();
            };

            self.load();
        },
        template: require('./worker-documents.html'),
    });
}
