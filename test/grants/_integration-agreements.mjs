// Live integration check for Phase 3 (agreement versions + clickwrap acceptance).
import { SignJWT } from 'jose';
import assert from 'assert';

const agreements = await import('../../lib/server/grants/agreements.js');

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const mkToken = (sub, roles) => new SignJWT({ sub, email: sub + '@example.org', name: sub,
        roles, role: 'ergatas_server' })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('5m').sign(secret);

const staff = await mkToken('ext-staff-2', ['grant_staff']);
const grantee = await mkToken('ext-grantee-1', ['grantee']);
const req = { ip: '198.51.100.30', headers: { 'user-agent': 'agreements-itest/1.0' } };

let pass = 0;
const ok = (l, c) => { assert(c, 'FAILED: ' + l); console.log('  ✔', l); pass++; };

console.log('1. publish a versioned agreement (append-only, hashed)');
const body = 'GRANT AGREEMENT v1\nThe Grantor retains full discretion and control...';
const version = await agreements.publishVersion(staff, req, {
    version_label: 'v1.0 ' + Math.random().toString(36).slice(2, 8),
    body, terms: { purpose: 'salaries', amount: 24000 },
});
ok('version published with document_hash', /^[0-9a-f]{64}$/.test(version.document_hash));

console.log('2. clickwrap acceptance binds to the exact version (snapshot + hash + identity)');
const accept = await agreements.recordAcceptance(grantee, req, {
    agreement_version_id: version.agreement_version_id,
    grantee_org_legal_name: 'Bright Future Mission',
    grantee_country: 'KEN',
    signer_full_name: 'Jane Director', signer_title: 'Director', signer_email: 'jane@bfm.example',
    authorized_representation_confirmed: true,
    consent_to_electronic_records: true,
    assent_checkbox_text: ['I have read and agree to the Grant Agreement (v1.0).'],
    agreement_document_snapshot: body,
    typed_signature: 'Jane Director',
});
ok('acceptance stores the document snapshot', accept.agreement_document_snapshot === body);
ok('acceptance hash matches the version hash', accept.agreement_document_hash === version.document_hash);
ok('signer identity captured from session', accept.submitter_external_user_id === 'ext-grantee-1');
ok('status accepted', accept.status === 'accepted');

console.log('3. acceptance of altered text is rejected (hash mismatch)');
let mismatch = false;
try {
    await agreements.recordAcceptance(grantee, req, {
        agreement_version_id: version.agreement_version_id,
        grantee_org_legal_name: 'Bright Future Mission', signer_full_name: 'Jane Director',
        authorized_representation_confirmed: true, consent_to_electronic_records: true,
        assent_checkbox_text: ['I agree'], agreement_document_snapshot: body + ' (TAMPERED)',
    });
} catch (e) { mismatch = /hash mismatch/.test(e.message); }
ok('altered snapshot rejected', mismatch);

console.log('4. missing authorization confirmation is rejected');
let unauth = false;
try {
    await agreements.recordAcceptance(grantee, req, {
        agreement_version_id: version.agreement_version_id, grantee_org_legal_name: 'X',
        signer_full_name: 'Y', authorized_representation_confirmed: false,
        consent_to_electronic_records: true, assent_checkbox_text: ['I agree'],
    });
} catch (e) { unauth = /authorized/.test(e.message); }
ok('unauthorized signer rejected', unauth);

console.log('5. re-accept (new version) supersedes the prior acceptance');
const v2body = body + '\nv2 amendment';
const v2 = await agreements.publishVersion(staff, req, {
    version_label: 'v2.0 ' + Math.random().toString(36).slice(2, 8), body: v2body, terms: {} });
const reaccept = await agreements.reAccept(grantee, req, accept.record_id, {
    agreement_version_id: v2.agreement_version_id, grantee_org_legal_name: 'Bright Future Mission',
    signer_full_name: 'Jane Director', authorized_representation_confirmed: true,
    consent_to_electronic_records: true, assent_checkbox_text: ['I agree to v2'],
    agreement_document_snapshot: v2body,
});
ok('re-acceptance links to prior', reaccept.prior_record_id === accept.record_id);
const priorAfter = await agreements.getAcceptance(staff, accept.record_id);
ok('prior acceptance superseded', priorAfter.status === 'superseded');

console.log(`\nALL ${pass} agreement integration assertions passed.`);
