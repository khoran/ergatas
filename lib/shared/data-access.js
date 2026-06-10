// Shim: data-access was split into ./data-access/ (transport client, pure
// header/shape helpers, FilterAppender family, and per-domain repos behind the
// DataAccess facade). This file preserves the original import path
// ('../shared/data-access') so every existing importer keeps working.
export * from './data-access/index.js';
