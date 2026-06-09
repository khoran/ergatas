// Shared display helpers for worker documents (used by the worker-documents
// container component and the worker-document-list row component).

export const DOCUMENT_TYPE_LABELS = { budget: 'Budget', report: 'Report' };

// Budgets are always annual; reports use the org's configured report frequency.
export function frequencyForDocType(docType, reportFrequency) {
    if (docType === 'budget') return 'annual';
    return reportFrequency;
}

export function periodLabel(periodStart, frequency) {
    const d = new Date(periodStart + 'T00:00:00');
    const year = d.getFullYear();
    switch (frequency) {
        case 'quarterly':  return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + year;
        case 'annual':     return String(year);
        default:           return periodStart;
    }
}
