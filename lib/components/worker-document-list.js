// Row-based list of a worker's review documents. Each worker_documents record is
// shown as its own row (so multiple records sharing a storage_path are all shown,
// unlike a file/blob-centric listing) with a small thumbnail preview, the document
// name, type and period, and download / delete icons.
//
// INPUT params
//   - documents: ko.observableArray of worker_documents records
//                ({ worker_document_key, document_type, storage_path, original_filename, submission_period })
//   - server: ServerAPI (for /api/listUserFiles to resolve preview + download URLs)
//   - bucketPrefix: storage prefix the documents live under
//   - reportFrequency: org report frequency (observable or value), for period labels
//   - onDelete: async fn(doc) invoked (after confirm) to delete a record
//   - refreshTrigger: optional observable; bump to re-resolve file links
//   - readOnly: hide the delete icon when true
import { DOCUMENT_TYPE_LABELS, frequencyForDocType, periodLabel } from '../client/worker-document-format';

const THUMB_POSTFIX = '-ergatas-thumbnail.png';

export function register() {
    ko.components.register('worker-document-list', {
        viewModel: function (params) {
            const self = this;
            self.server = params.server;
            self.documents = params.documents;
            self.bucketPrefix = ko.unwrap(params.bucketPrefix);
            self.readOnly = ko.unwrap(params.readOnly) === true;
            const onDelete = typeof params.onDelete === 'function' ? params.onDelete : null;
            const reportFrequency = () => ko.unwrap(params.reportFrequency) || 'quarterly';

            // Storage files for the prefix, used to resolve each document's preview
            // thumbnail and download URL by filename.
            self.files = ko.observableArray([]);
            self.loadFiles = async function () {
                try {
                    self.files(await self.server.postJson('/api/listUserFiles', { prefix: self.bucketPrefix }) || []);
                } catch (err) {
                    console.error('worker-document-list: failed to list files', err);
                    self.files([]);
                }
            };

            self.rows = ko.pureComputed(function () {
                const byName = {};
                self.files().forEach(f => { byName[f.name] = f; });
                const freqFor = reportFrequency();
                return (ko.unwrap(self.documents) || []).map(function (doc) {
                    const base = (doc.storage_path || '').split('/').pop();
                    const file = byName[base];
                    const thumb = byName[base.replace(/\.[^.]+$/, '') + '.png' + THUMB_POSTFIX];
                    const freq = frequencyForDocType(doc.document_type, freqFor);
                    return {
                        doc: doc,
                        name: doc.original_filename || base,
                        typeLabel: DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type,
                        periodLabel: periodLabel(doc.submission_period, freq),
                        downloadUrl: file ? file.link : null,
                        thumbUrl: thumb ? thumb.link : (file ? file.link : null),
                        thumbFailed: ko.observable(false),
                    };
                });
            });

            self.deleteRow = function (row) {
                if (!onDelete) return;
                alertify.confirm('Delete Document', "Delete '" + row.name + "'?",
                    async function () { await onDelete(row.doc); },
                    function () {});
            };

            self.loadFiles();
            if (ko.isObservable(params.refreshTrigger))
                params.refreshTrigger.subscribe(() => self.loadFiles());
            // Documents typically load after this component binds; re-resolve links
            // (which also picks up a newly uploaded file) whenever they change.
            if (ko.isObservable(params.documents))
                params.documents.subscribe(() => self.loadFiles());
        },
        template: require('./worker-document-list.html'),
    });
}
