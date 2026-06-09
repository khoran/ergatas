// Manual integration check for the grants record layer against the LOCAL stack.
// Run with env pointing at the local PostgREST + JWT secret, e.g.:
//   POSTGREST_SERVER_URL_BASE=http://localhost:3001 JWT_SECRET=... node test/grants/_integration.mjs
// (the runner script test/grants/run-integration.sh wires these up from docker/.env)
import { SignJWT } from 'jose';
import assert from 'assert';

const records = await import('../../lib/server/grants/records.js');
const { getServerDB } = await import('../../lib/server/utils.js');

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
// A user token: this is the *submitter* identity the record must capture.
const userToken = await new SignJWT({
        sub: 'ext-user-OFFICER-1', email: 'officer@example.org', name: 'Officer One',
        roles: ['grant_staff'], role: 'ergatas_server',
    })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('5m')
    .sign(secret);

const fakeReq = { ip: '203.0.113.9', headers: { 'user-agent': 'integration-test/1.0' } };

let pass = 0;
function ok(label, cond) { assert(cond, 'FAILED: ' + label); console.log('  ✔', label); pass++; }

console.log('1. createRecord ignores client-supplied integrity/identity fields');
const created = await records.createRecord({
    table: 'ofac_screening', token: userToken, req: fakeReq,
    record: {
        grantee_org: 'Integration Test Charity', country: 'KEN', overall_result: 'clear',
        data: { targets: [{ name: 'Integration Test Charity', type: 'org' }] },
        // hostile client values that MUST be overridden server-side:
        submitter_external_user_id: 'CLIENT-FORGED', timestamp_utc: '1999-01-01T00:00:00Z',
        ip_address: '127.0.0.1', content_hash: 'forged',
    },
});
ok('submitter identity comes from the token', created.submitter_external_user_id === 'ext-user-OFFICER-1');
ok('ip captured from request', created.ip_address === '203.0.113.9');
ok('user agent captured from request', created.user_agent === 'integration-test/1.0');
ok('timestamp is server-set (not the forged 1999 value)', new Date(created.timestamp_utc).getUTCFullYear() >= 2025);
ok('client-forged content_hash was replaced', created.content_hash !== 'forged' && /^[0-9a-f]{64}$/.test(created.content_hash));
ok('canonical_content snapshot stored', typeof created.canonical_content === 'string' && created.canonical_content.includes('Integration Test Charity'));
ok('verifyRecord passes on the persisted row', records.verifyRecord(created));
ok('status defaults to final', created.status === 'final');

console.log('2. content mutation through the view is rejected by the DB (write-once)');
let blocked = false;
try {
    const db = await getServerDB();
    await db.dbAuthPatch('/ofac_screening_view?record_id=eq.' + created.record_id,
        { grantee_org: 'TAMPERED' }, { 'Content-Profile': 'grants', 'Accept-Profile': 'grants' });
} catch (e) { blocked = true; }
ok('content PATCH throws', blocked);

console.log('3. supersede writes a linked replacement and retires the prior');
const replacement = await records.supersede({
    table: 'ofac_screening', priorId: created.record_id, token: userToken, req: fakeReq,
    record: { grantee_org: 'Integration Test Charity', country: 'KEN', overall_result: 'escalated',
              data: { note: 'corrected after review' } },
});
ok('replacement links to prior via prior_record_id', replacement.prior_record_id === created.record_id);
ok('replacement is final', replacement.status === 'final');
const priorAfter = await records.getRecord({ table: 'ofac_screening', recordId: created.record_id });
ok('prior is now superseded', priorAfter.status === 'superseded');

console.log(`\nALL ${pass} integration assertions passed.`);
