// ============================================================================
// Grant agreements + clickwrap acceptance (Phase 3, lifecycle [3]/[4]).
//
// Agreement templates are versioned and append-only; each version's body is
// hashed. An acceptance binds to the exact version shown (snapshot + hash +
// identity + timestamp), never just a boolean. A new version forces re-acceptance.
// ============================================================================
import crypto from 'crypto';
import * as records from './records.js';
import { getServerDB, getDB, sendTemplatedEmail, jwtPayload } from '../utils.js';
import { ensureFields } from '../../shared/shared-utils.js';

const GRANTS_HEADERS = { 'Content-Profile': 'grants', 'Accept-Profile': 'grants' };
const sha256 = t => crypto.createHash('sha256').update(t).digest('hex');

// ---- Versions (append-only) --------------------------------------------------
export async function publishVersion(token, req, payload) {
    ensureFields(payload, ['version_label', 'body']);
    const submitter = await jwtPayload(token);
    const db = await getServerDB();
    const row = {
        version_label: payload.version_label,
        body: payload.body,
        document_hash: sha256(payload.body),
        terms: payload.terms || {},
        language: payload.language || 'en',
        governing_version: payload.governing_version !== false,
        published_by: submitter.sub,
    };
    return db.dbAuthPost('/grant_agreement_version_view', row, db.representation(db.single(GRANTS_HEADERS)));
}

// Reads run under the caller's role (grant_staff/board_member/grantee all have
// read_all on grant_agreement_version), so a grantee can view the agreement they
// are accepting. Falls back to the server role for internal token-less callers.
export async function listVersions(token) {
    const db = token ? getDB(token) : await getServerDB();
    return db.dbAuthGet('/grant_agreement_version_view?order=created_on.desc', GRANTS_HEADERS);
}

export async function getVersion(token, versionId) {
    const db = token ? getDB(token) : await getServerDB();
    return db.dbAuthGet('/grant_agreement_version_view?agreement_version_id=eq.' + versionId, db.single(GRANTS_HEADERS));
}

// ---- Acceptance (write-once clickwrap) ---------------------------------------
function validateAcceptance(payload) {
    if (payload.authorized_representation_confirmed !== true)
        throw new Error('the signer must confirm they are authorized to bind the organization');
    if (payload.consent_to_electronic_records !== true)
        throw new Error('electronic-records consent (E-SIGN) is required');
    if (!Array.isArray(payload.assent_checkbox_text) || payload.assent_checkbox_text.length === 0)
        throw new Error('the assent checkbox wording must be captured');
    if (!payload.signer_full_name || !payload.signer_full_name.trim())
        throw new Error('signer full name is required');
}

async function buildAcceptanceRecord(token, payload) {
    validateAcceptance(payload);
    const version = await getVersion(token, payload.agreement_version_id);
    if (!version) throw new Error('unknown agreement version');

    // The exact text the signer saw must match the published version (terms binding).
    const snapshot = payload.agreement_document_snapshot || version.body;
    if (sha256(snapshot) !== version.document_hash)
        throw new Error('the accepted document does not match the published version (hash mismatch)');

    return {
        grantee_org_legal_name: payload.grantee_org_legal_name,
        grantee_country: payload.grantee_country || null,
        signer_full_name: payload.signer_full_name,
        signer_title: payload.signer_title || null,
        signer_email: payload.signer_email || null,
        email_verified: payload.email_verified === true,
        authorized_representation_confirmed: true,
        agreement_version_id: payload.agreement_version_id,
        board_approval_id: payload.board_approval_id || null,
        agreement_document_hash: version.document_hash,
        agreement_document_snapshot: snapshot,
        grant_terms_snapshot: payload.grant_terms_snapshot || version.terms || {},
        consent_to_electronic_records: true,
        assent_checkbox_text: payload.assent_checkbox_text,
        typed_signature: payload.typed_signature || null,
    };
}

async function sendConfirmation(record) {
    const to = [record.signer_email].filter(Boolean).join(',');
    if (!to) return;
    try {
        await sendTemplatedEmail('grant-agreement-accepted', to, {
            grantee: record.grantee_org_legal_name,
            signer: record.signer_full_name,
            reference: record.record_id,
            version: record.agreement_version_id,
        });
    } catch (e) {
        console.warn('grant acceptance confirmation email failed (non-fatal): ' + e.message);
    }
}

export async function recordAcceptance(token, req, payload) {
    ensureFields(payload, ['agreement_version_id', 'grantee_org_legal_name', 'signer_full_name']);
    const record = await buildAcceptanceRecord(token, payload);
    const saved = await records.createRecord({ table: 'acceptance_record', token, req, record, status: 'accepted' });
    await sendConfirmation(saved);
    return saved;
}

// Re-accept a new version: write a new acceptance linked to the prior, retire prior.
export async function reAccept(token, req, priorId, payload) {
    ensureFields(payload, ['agreement_version_id', 'grantee_org_legal_name', 'signer_full_name']);
    const record = await buildAcceptanceRecord(token, payload);
    const saved = await records.supersede({ table: 'acceptance_record', priorId, token, req, record, status: 'accepted' });
    await sendConfirmation(saved);
    return saved;
}

export async function listAcceptances(token, granteeOrg) {
    let query = 'status=eq.accepted&order=timestamp_utc.desc';
    if (granteeOrg) query += '&grantee_org_legal_name=eq.' + encodeURIComponent(granteeOrg);
    return records.listRecords({ table: 'acceptance_record', query, token });
}

export async function getAcceptance(token, recordId) {
    return records.getRecord({ table: 'acceptance_record', recordId, token });
}
