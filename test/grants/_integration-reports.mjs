// Live integration check for Phase 4 (salary-use report).
import { SignJWT } from 'jose';
import assert from 'assert';

const reports = await import('../../lib/server/grants/reports.js');

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const grantee = await new SignJWT({ sub: 'ext-grantee-2', email: 'g2@example.org', name: 'Grantee Two',
        roles: ['grantee'], role: 'ergatas_server' })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('5m').sign(secret);
const req = { ip: '198.51.100.40', headers: { 'user-agent': 'reports-itest/1.0' } };

let pass = 0;
const ok = (l, c) => { assert(c, 'FAILED: ' + l); console.log('  ✔', l); pass++; };

console.log('1. a reconciled, certified report is recorded');
const rec = await reports.recordSalaryReport(grantee, req, {
    grantee_org: 'Bright Future Mission', country: 'KEN', reporting_period: 'Q1 2026',
    agreement_version: 'v1.0',
    lines: [
        { employee: 'Alice', role: 'Teacher', sent: 1000, applied: 1000 },
        { employee: 'Bob', role: 'Nurse', sent: 800, applied: 600, explanation: 'started mid-quarter' },
    ],
    charitable_use_confirmed: true, attestation_confirmed: true, typed_signature: 'Jane Director',
});
ok('totals computed server-side', rec.data.totals.sent === 1800 && rec.data.totals.applied === 1600 && rec.data.totals.variance === 200);
ok('balanced line has null explanation', rec.data.lines[0].explanation === null);
ok('verbatim certifications captured', Array.isArray(rec.attestation_text) && rec.attestation_text.length === 2);
ok('submitter identity from session', rec.submitter_external_user_id === 'ext-grantee-2');
ok('status submitted', rec.status === 'submitted');

console.log('2. a variance without explanation is rejected');
let r = false;
try {
    await reports.recordSalaryReport(grantee, req, {
        grantee_org: 'X', reporting_period: 'Q1', lines: [{ employee: 'A', sent: 100, applied: 90 }],
        charitable_use_confirmed: true, attestation_confirmed: true, typed_signature: 'X' });
} catch (e) { r = /explanation/.test(e.message); }
ok('unexplained variance rejected', r);

console.log('3. missing certification is rejected');
let c = false;
try {
    await reports.recordSalaryReport(grantee, req, {
        grantee_org: 'X', reporting_period: 'Q1', lines: [{ employee: 'A', sent: 100, applied: 100 }],
        charitable_use_confirmed: false, attestation_confirmed: true, typed_signature: 'X' });
} catch (e) { c = /certification/.test(e.message); }
ok('missing certification rejected', c);

console.log('4. correction supersedes the prior report');
const fixed = await reports.reviseReport(grantee, req, rec.record_id, {
    grantee_org: 'Bright Future Mission', reporting_period: 'Q1 2026',
    lines: [{ employee: 'Alice', role: 'Teacher', sent: 1000, applied: 1000 },
            { employee: 'Bob', role: 'Nurse', sent: 800, applied: 800 }],
    charitable_use_confirmed: true, attestation_confirmed: true, typed_signature: 'Jane Director' });
ok('correction links to prior', fixed.prior_record_id === rec.record_id);
const prior = await reports.getReport(grantee, rec.record_id);
ok('prior report superseded', prior.status === 'superseded');

console.log(`\nALL ${pass} salary-report integration assertions passed.`);
