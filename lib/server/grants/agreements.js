// ============================================================================
// Grant agreements + clickwrap acceptance (Phase 3, lifecycle [3]/[4]).
//
// Agreement templates are versioned and append-only; each version's body is
// hashed. An acceptance binds to the exact version shown (snapshot + hash +
// identity + timestamp), never just a boolean. A new version forces re-acceptance.
// ============================================================================
import crypto from 'crypto';
import { marked } from 'marked';
import * as records from './records.js';
import { getServerDB, getDB, sendTemplatedEmail, jwtPayload } from '../utils.js';
import { getGovernanceConfig, listApprovals } from './board.js';
import { ensureFields } from '../../shared/shared-utils.js';

// Returns a FRESH headers object each call. The data-access header helpers
// (single/representation/…) mutate the object passed to them, so a shared constant
// would get permanently tagged (e.g. with the single-object Accept header) and break
// later multi-row queries (PGRST116 / 406).
const grantsHeaders = () => ({ 'Content-Profile': 'grants', 'Accept-Profile': 'grants' });
const sha256 = t => crypto.createHash('sha256').update(t).digest('hex');

// ---- Template variable substitution ------------------------------------------
// Agreement bodies are markdown templates with {{token}} placeholders. Tokens are
// resolved (server-side) from: the grantee's submitted values, the grantor info in
// governance config (config.grantor.*), and the version's `terms` JSON. Any token
// the author uses that isn't in `terms` or the system set is supported by adding it
// to the version's terms JSON at publish time. Unknown tokens are left intact so a
// reviewer notices them.
const APPROVAL_OUTCOMES = new Set(['approved', 'approved_conditions', 'renewed', 'modified']);

// Grant-specific details (amount, schedule, purpose, term, reference) are NOT part
// of the agreement template — they come from the most recent approved board decision
// for the grantee. Read under the server role (grantees can't read board approvals).
async function latestApprovalFor(granteeOrg) {
    if (!granteeOrg) return null;
    const approvals = await listApprovals(undefined, granteeOrg);   // server role; newest first
    if (!Array.isArray(approvals)) return null;
    return approvals.find(a => APPROVAL_OUTCOMES.has(a.outcome)) || null;
}

function approvalVariables(approval) {
    const pt = (approval && approval.data && approval.data.proposed_terms) || {};
    const val = v => (v == null ? '' : v);
    return {
        grant_amount:    val(pt.amount),
        grant_schedule:  val(pt.schedule),
        grant_purpose:   val(pt.purpose),
        grant_term:      val(pt.term),
        grant_reference: val(approval && approval.grant_reference),
    };
}

function agreementVariables({ version, approval, grantee, signer, grantorConfig, dateAccepted }) {
    const terms = (version && version.terms) || {};
    const grantor = (grantorConfig && grantorConfig.grantor) || {};
    grantee = grantee || {};
    signer = signer || {};
    return {
        // template-defined tokens first (lowest priority), then board-approval grant
        // details, then the system tokens below (which win on any name clash).
        ...terms,
        ...approvalVariables(approval),
        grantee_legal_name: grantee.legal_name || '',
        grantee_country:    grantee.country || '',
        grantee_address:    grantee.address || '',
        signer_name:        signer.name || '',
        signer_title:       signer.title || '',
        signer_email:       signer.email || '',
        grantor_legal_name:    grantor.legal_name || '',
        grantor_address:       grantor.address || '',
        grantor_exempt_purpose: grantor.exempt_purpose || '',
        version_label:      (version && version.version_label) || '',
        date_accepted:      dateAccepted || '',
    };
}

// Replace {{token}} with its value; leave unknown tokens untouched.
export function renderAgreement(body, vars) {
    return String(body == null ? '' : body).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) =>
        Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key] == null ? '' : vars[key]) : match);
}

// Build the substituted markdown for a version + grantee context, plus rendered HTML.
async function renderAgreementForGrantee(token, payload) {
    const version = await getVersion(token, payload.agreement_version_id);
    if (!version) throw new Error('unknown agreement version');
    const grantorConfig = await getGovernanceConfig('default');
    const approval = await latestApprovalFor(payload.grantee_org_legal_name);
    const vars = agreementVariables({
        version,
        approval,
        grantee: { legal_name: payload.grantee_org_legal_name, country: payload.grantee_country, address: payload.grantee_address },
        signer: { name: payload.signer_full_name, title: payload.signer_title, email: payload.signer_email },
        grantorConfig,
        dateAccepted: payload.date_accepted || '',
    });
    const markdown = renderAgreement(version.body, vars);
    return { version, markdown };
}

// Public: render a version for display to a grantee (markdown + HTML).
export async function renderForGrantee(token, payload) {
    ensureFields(payload, ['agreement_version_id']);
    const { version, markdown } = await renderAgreementForGrantee(token, payload);
    return { agreement_version_id: version.agreement_version_id, version_label: version.version_label,
             markdown, html: marked.parse(markdown) };
}

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
    return db.dbAuthPost('/grant_agreement_version_view', row, db.representation(db.single(grantsHeaders())));
}

// Reads run under the caller's role (grant_staff/board_member/grantee all have
// read_all on grant_agreement_version), so a grantee can view the agreement they
// are accepting. Falls back to the server role for internal token-less callers.
export async function listVersions(token) {
    const db = token ? getDB(token) : await getServerDB();
    return db.dbAuthGet('/grant_agreement_version_view?order=created_on.desc', grantsHeaders());
}

export async function getVersion(token, versionId) {
    const db = token ? getDB(token) : await getServerDB();
    return db.dbAuthGet('/grant_agreement_version_view?agreement_version_id=eq.' + versionId, db.single(grantsHeaders()));
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

    // The signer accepts the SUBSTITUTED document. Render it server-side (never trust
    // a client-supplied snapshot) so the stored snapshot is authoritative, and hash
    // that exact text. The template version it derives from is linked via
    // agreement_version_id (whose own document_hash fixes the template integrity).
    const dateAccepted = new Date().toISOString().slice(0, 10);
    const { version, markdown } = await renderAgreementForGrantee(token, { ...payload, date_accepted: dateAccepted });
    const snapshot = markdown;

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
        agreement_document_hash: sha256(snapshot),
        agreement_document_snapshot: snapshot,
        grant_terms_snapshot: version.terms || {},
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
