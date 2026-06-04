import { ensureFields } from '../shared/shared-utils';

const DOCUMENT_TYPE_LABELS = { budget: 'Budget', report: 'Report' };

function periodLabel(periodStart, frequency) {
    const d = new Date(periodStart + 'T00:00:00');
    const year = d.getFullYear();
    switch (frequency) {
        case 'quarterly':  return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + year;
        case 'annual':     return String(year);
        default:           return periodStart;
    }
}

// Returns ISO date string for the first day of the most recent complete period.
function currentPeriodStart(frequency) {
    const d = new Date();
    switch (frequency) {
        case 'quarterly': {
            const q = Math.floor(d.getMonth() / 3);
            if (q === 0) return new Date(d.getFullYear() - 1, 9, 1).toISOString().slice(0, 10);
            return new Date(d.getFullYear(), (q - 1) * 3, 1).toISOString().slice(0, 10);
        }
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
        case 'quarterly':   return new Date(d.getFullYear(), d.getMonth() - 3, 1).toISOString().slice(0, 10);
        case 'annual':      return new Date(d.getFullYear() - 1, 0, 1).toISOString().slice(0, 10);
        default:            return null;
    }
}

// Budgets are always annual; reports use the org's configured report frequency.
function frequencyForDocType(docType, reportFrequency) {
    if (docType === 'budget') return 'annual';
    return reportFrequency;
}

export function register() {
    const name = 'worker-documents';
    ko.components.register(name, {
        viewModel: function (params) {
            const self = this;
            ensureFields(params, ['appState', 'missionary_profile_key']);
            self.appState = params.appState;
            self.server = self.appState.server;
            self.missionary_profile_key = ko.unwrap(params.missionary_profile_key);

            self.loading = ko.observable(true);
            self.documents = ko.observableArray([]);
            self.workerDocSettings = ko.observable(null);
            self.error = ko.observable(null);

            self.enabled = ko.pureComputed(() => !!self.workerDocSettings()?.enabled);
            self.reportFrequency = ko.pureComputed(() => self.workerDocSettings()?.report_frequency ?? 'quarterly');

            self.bucketPrefix = 'worker_docs/MPK' + self.missionary_profile_key;
            self.refreshTrigger = ko.observable(0);

            self.addDocFormVisible = ko.observable(false);
            self.newDocType = ko.observable('budget');
            self.newDocPeriod = ko.observable(null);
            self.documentTypeOptions = Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));

            self.currentFrequency = ko.pureComputed(() =>
                frequencyForDocType(self.newDocType(), self.reportFrequency())
            );

            self.periodOptions = ko.pureComputed(() => {
                const freq = self.currentFrequency();
                const options = [];
                let start = currentPeriodStart(freq);
                for (let i = 0; i < 4 && start; i++) {
                    options.push({ value: start, label: periodLabel(start, freq) });
                    start = previousPeriodStart(start, freq);
                }
                return options;
            });

            // When the document type changes, reset to the current period for that type's frequency.
            self.newDocType.subscribe(() => {
                self.newDocPeriod(currentPeriodStart(self.currentFrequency()));
            });

            self.openAddDocForm = function () {
                self.newDocPeriod(currentPeriodStart(self.currentFrequency()));
                self.addDocFormVisible(true);
            };

            // Caption passed to file-collection. Looks up the document record by
            // filename and returns "<period> — <type>" for display under the thumbnail.
            self.fileCaption = function (file) {
                const doc = self.documents().find(d =>
                    d.storage_path && d.storage_path.endsWith('/' + file.name)
                );
                if (!doc) return '';
                const freq = frequencyForDocType(doc.document_type, self.reportFrequency());
                return periodLabel(doc.submission_period, freq) +
                    ' — ' + (DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type);
            };

            self.load = async function () {
                self.loading(true);
                self.error(null);
                try {
                    const result = await self.server.authPostJson('/api/workerDocuments/list', {
                        missionary_profile_key: self.missionary_profile_key,
                    });
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
                const uppy = uploaderUtils.workerDocumentUploader(self.bucketPrefix);

                uppy.on('transloadit:complete', async (assembly) => {
                    uppy.getPlugin('Dashboard').closeModal();
                    const allResults = Object.values(assembly.results).flat();
                    if (!allResults.length) return;
                    const file = allResults[0];

                    try {
                        const fullUrl = file.url || '';
                        const storagePath = fullUrl.slice(fullUrl.indexOf('worker_docs/'));
                        await self.server.authPostJson('/api/workerDocuments/record', {
                            missionary_profile_key: self.missionary_profile_key,
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
                        if (err.responseJSON?.message === 'DOCUMENT_EXISTS') {
                            alertify.alert(
                                'Document Already Exists',
                                'You already have a ' + (DOCUMENT_TYPE_LABELS[self.newDocType()] || self.newDocType()).toLowerCase() +
                                ' uploaded for this period. To replace it, delete the existing document first and then upload again.'
                            );
                        } else {
                            alertify.error('Upload succeeded but failed to save the record. Please contact support.');
                        }
                    }
                });

                uppy.getPlugin('Dashboard').openModal();
            };

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
