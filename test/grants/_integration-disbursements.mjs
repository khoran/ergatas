// Live integration check for Phase 5 (disbursement + delegated-scope enforcement
// + suspension halt).
import { SignJWT } from 'jose';
import assert from 'assert';

const board = await import('../../lib/server/grants/board.js');
const screening = await import('../../lib/server/grants/screening.js');
const disb = await import('../../lib/server/grants/disbursements.js');

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({ sub: 'ext-staff-5', email: 's5@example.org', name: 'Staff5',
        roles: ['grant_staff', 'board_member'], role: 'ergatas_server' })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('5m').sign(secret);
const req = { ip: '198.51.100.50', headers: { 'user-agent': 'disb-itest/1.0' } };

let pass = 0;
const ok = (l, c) => { assert(c, 'FAILED: ' + l); console.log('  ✔', l); pass++; };

const config = await board.getGovernanceConfig();
const finding = { affirmed: true, text: config.attestations.exempt_purpose };
const votes = [
    { member_name: 'C', vote: 'approve' }, { member_name: 'S', vote: 'approve' }, { member_name: 'M', vote: 'approve' },
];
const screen = await screening.recordScreening(token, req, {
    grantee_org: 'Bright Future Mission', results: [{ name: 'Bright Future Mission', result: 'clear' }] });

console.log('1. approval delegating disbursement up to a monthly cap');
const approval = await board.recordApproval(token, req, {
    review_type: 'new_grant', grantee_org: 'Bright Future Mission', outcome: 'approved',
    motion_text: 'Approve', votes, exempt_purpose_finding: finding, ofac_screening_id: screen.record_id,
    data: { due_diligence: { summary: 'ok' },
            delegation: { authorized: true, scope: 'up to $2,000/month', monthly_cap: 2000 } },
});
ok('approval recorded with delegation', approval.data.delegation.monthly_cap === 2000);

console.log('2. within-scope disbursement is recorded');
const d1 = await disb.recordDisbursement(token, req, {
    grantee_org: 'Bright Future Mission', board_approval_id: approval.record_id,
    reporting_period: 'Q1 2026', amount: 2000, currency: 'USD',
    allocation: [{ employee: 'Alice', amount: 1200 }, { employee: 'Bob', amount: 800 }],
});
ok('disbursement recorded', d1.status === 'recorded' && Number(d1.amount) === 2000);

console.log('3. over-cap disbursement is rejected');
let over = false;
try {
    await disb.recordDisbursement(token, req, {
        grantee_org: 'Bright Future Mission', board_approval_id: approval.record_id, amount: 5000 });
} catch (e) { over = /exceeds the delegated monthly cap/.test(e.message); }
ok('over-cap rejected', over);

console.log('4. sentForPeriod sums disbursements with per-employee breakdown');
const sum = await disb.sentForPeriod(token, 'Bright Future Mission', 'Q1 2026');
ok('total summed', sum.total === 2000);
ok('per-employee breakdown', sum.byEmployee.Alice === 1200 && sum.byEmployee.Bob === 800);

console.log('5. suspension halts further disbursement');
const suspend = await board.reviseApproval(token, req, approval.record_id, {
    review_type: 'annual_review', grantee_org: 'Bright Future Mission', outcome: 'suspended',
    motion_text: 'Suspend pending review', votes,
    data: { reports_received: 0, reports_expected: 1, reconciliation_status: 'issues',
            compliance_flags: [{ flag: 'missing report', disposition: 'suspend' }], re_screening: { result: 'clear' } },
});
let halted = false;
try {
    // the original approval is now superseded; disbursing against it must fail
    await disb.recordDisbursement(token, req, {
        grantee_org: 'Bright Future Mission', board_approval_id: approval.record_id, amount: 100 });
} catch (e) { halted = /superseded/.test(e.message); }
ok('disbursement against superseded approval halted', halted);
let halted2 = false;
try {
    await disb.recordDisbursement(token, req, {
        grantee_org: 'Bright Future Mission', board_approval_id: suspend.record_id, amount: 100 });
} catch (e) { halted2 = /does not authorize/.test(e.message); }
ok('disbursement against suspended decision halted', halted2);

console.log(`\nALL ${pass} disbursement integration assertions passed.`);
