// ============================================================================
// Immutable record layer for the Foreign Grant Compliance System.
//
// Every compliance record (OFAC screening, board approval, agreement acceptance,
// salary report, …) is written through this module so that the integrity columns
// are ALWAYS server-authoritative and identical in shape:
//
//   record_id      — server-assigned (DB default gen_random_uuid)
//   timestamp_utc  — server clock (UTC ISO-8601)
//   content_hash   — SHA-256 over the canonical record content
//   ip_address     — from the request
//   user_agent     — from the request
//   submitter_*    — identity from the authenticated JWT (never the client body)
//   status         — initial status; only ever transitions to 'superseded'
//
// Records are write-once at the database level (see grants.enforce_write_once in
// sql/40-grants.sql). Corrections are made by `supersede()`, which writes a new
// record and flips the prior one to 'superseded' — never an in-place edit.
//
// The tables live in the dedicated Postgres `grants` schema and are reached ONLY
// through their per-table `_view` views (project rule: no table is queried
// directly), via PostgREST with the Content-Profile / Accept-Profile headers.
// Callers pass the logical table name (e.g. 'ofac_screening'); this module maps
// it to the corresponding view ('ofac_screening_view').
// ============================================================================
import crypto from 'crypto';
import { getServerDB, getDB, jwtPayload } from '../utils.js';

const GRANTS_PROFILE = 'grants';

// ---- Canonical content + hashing ---------------------------------------------
// The evidentiary content of a record is captured as a canonical (key-sorted)
// JSON string, stored verbatim in the `canonical_content` column, and hashed.
// Hashing the stored snapshot — rather than the DB-round-tripped row — makes
// verification immune to representation drift (timestamp formatting, jsonb key
// order, default columns) and matches the specs' "store the exact snapshot +
// hash" requirement.
//
// Surrogate / lifecycle / audit columns are NOT part of the content: the
// record_id is just a handle, `status` is mutable (final -> superseded), and
// created_on/by are DB-managed.
const NON_CONTENT_KEYS = new Set([
    'record_id', 'status', 'canonical_content', 'content_hash', 'created_on', 'created_by',
]);

function canonicalize(value) {
    if (value === undefined) value = null;
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

// The canonical content string for a row (everything evidentiary, omitting
// surrogate/lifecycle/audit columns).
export function canonicalContent(row) {
    const content = {};
    for (const k of Object.keys(row)) if (!NON_CONTENT_KEYS.has(k)) content[k] = row[k];
    return canonicalize(content);
}

function sha256(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

// SHA-256 of a row's canonical content (used at creation time).
export function computeContentHash(row) {
    return sha256(canonicalContent(row));
}

// ---- PostgREST helpers -------------------------------------------------------
function grantsHeaders(extra) {
    return Object.assign({ 'Content-Profile': GRANTS_PROFILE, 'Accept-Profile': GRANTS_PROFILE }, extra || {});
}

// All access goes through the table's view, never the base table. Each grants
// table has a matching `<table>_view` (security_invoker, auto-updatable) so the
// base-table write-once triggers and RLS still apply.
function viewPath(table) {
    return '/' + table + '_view';
}

async function integrityFields(token, req) {
    const payload = await jwtPayload(token);
    if (payload == null || payload.sub == null)
        throw new Error('cannot create grant record: no authenticated submitter');
    return {
        submitter_external_user_id: payload.sub,
        submitter_name:  payload.name || payload.fullName || null,
        submitter_email: payload.email || null,
        submitter_roles: payload.roles || null,
        timestamp_utc:   new Date().toISOString(),
        ip_address:      (req && req.ip) || null,
        user_agent:      (req && req.headers && req.headers['user-agent']) || null,
    };
}

// ---- Public API --------------------------------------------------------------

/**
 * Create a finalized, immutable record in a grants.* table.
 * @param {string} table  grants table name (e.g. 'ofac_screening')
 * @param {string} token  the authenticated user's JWT (submitter identity)
 * @param {object} req    the express request (ip / user-agent)
 * @param {object} record the business columns + nested `data` for the record type
 * @param {string} [status] initial status (defaults to the table's column default)
 * @returns the persisted row (representation)
 */
export async function createRecord({ table, token, req, record, status }) {
    const integrity = await integrityFields(token, req);
    // record holds the business columns (+ optional prior-link column); integrity
    // (server-set) always wins over any client-supplied values.
    const row = Object.assign({}, record, integrity);
    if (status != null) row.status = status;

    // Snapshot the exact content, store it verbatim, and hash the snapshot.
    row.canonical_content = canonicalContent(row);
    row.content_hash = sha256(row.canonical_content);

    const db = await getServerDB();
    return db.dbAuthPost(viewPath(table), row, db.representation(db.single(grantsHeaders())));
}

/**
 * Correct a record by writing a replacement and marking the prior 'superseded'.
 * The replacement links back via `prior_record_id` (chains the audit trail).
 */
export async function supersede({ table, priorId, token, req, record, status, linkColumn = 'prior_record_id' }) {
    const replacement = await createRecord({
        table, token, req,
        record: Object.assign({ [linkColumn]: priorId }, record),
        status,
    });

    const db = await getServerDB();
    await db.dbAuthPatch(viewPath(table) + '?record_id=eq.' + priorId,
        { status: 'superseded' }, grantsHeaders());

    return replacement;
}

/**
 * Verify a persisted record's evidentiary snapshot is intact: the stored
 * `canonical_content` still hashes to the stored `content_hash`. This is robust
 * across DB round-trips (canonical_content is stored verbatim as text). The
 * structured columns are independently protected from edits by the database
 * write-once trigger (grants.enforce_write_once).
 */
export function verifyRecord(record) {
    if (record == null || record.canonical_content == null || record.content_hash == null) return false;
    return record.content_hash === sha256(record.canonical_content);
}

/**
 * Fetch a single record by id. With a user `token` the read runs under that
 * user's DB role (FusionAuth maps their grant app-role to a grants-capable PG
 * role, e.g. ergatas_grant_staff), so the grants-schema RLS policies enforce who
 * can read what; falls back to the server role when no token is given (internal
 * callers). Writes stay server-mediated — see createRecord/supersede.
 */
export async function getRecord({ table, recordId, token }) {
    const db = token ? getDB(token) : await getServerDB();
    return db.dbAuthGet(viewPath(table) + '?record_id=eq.' + recordId, db.single(grantsHeaders()));
}

/** List records with an optional PostgREST filter/order query string. Runs under the caller's role (see getRecord). */
export async function listRecords({ table, query, token }) {
    const db = token ? getDB(token) : await getServerDB();
    const suffix = query ? ('?' + query) : '';
    return db.dbAuthGet(viewPath(table) + suffix, grantsHeaders());
}
