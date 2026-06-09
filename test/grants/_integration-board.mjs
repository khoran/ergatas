// Live integration check for Phase 2 (board review & approval).
import { SignJWT } from 'jose';
import assert from 'assert';

const board = await import('../../lib/server/grants/board.js');
const screening = await import('../../lib/server/grants/screening.js');

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({ sub: 'ext-secretary-1', email: 'sec@example.org', name: 'Secretary',
        roles: ['board_member', 'grant_staff'], role: 'ergatas_server' })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('5m').sign(secret);
const req = { ip: '198.51.100.20', headers: { 'user-agent': 'board-itest/1.0' } };

let pass = 0;
const ok = (l, c) => { assert(c, 'FAILED: ' + l); console.log('  ✔', l); pass++; };

const config = await board.getGovernanceConfig();
ok('default governance config has the exempt-purpose attestation',
   config.attestations && /conduit/.test(config.attestations.exempt_purpose));

// A prerequisite screening for the new grant.
const screen = await screening.recordScreening(token, req, {
    grantee_org: 'Bright Future Mission', country: 'KEN',
    targets: [{ name: 'Bright Future Mission', type: 'org' }],
    results: [{ name: 'Bright Future Mission', result: 'clear' }],
});

const goodVotes = [
    { member_name: 'Chair', board_role: 'board_chair', vote: 'approve' },
    { member_name: 'Sec',   board_role: 'board_secretary', vote: 'approve' },
    { member_name: 'M3',    vote: 'approve' },
    { member_name: 'M4',    vote: 'oppose' },
];
const finding = { affirmed: true, text: config.attestations.exempt_purpose };

console.log('1. approval missing the exempt-purpose finding is rejected');
let r1 = false;
try {
    await board.recordApproval(token, req, {
        review_type: 'new_grant', grantee_org: 'Bright Future Mission', outcome: 'approved',
        motion_text: 'Approve grant', votes: goodVotes,
        ofac_screening_id: screen.record_id, due_diligence_id: null,
        data: { due_diligence: { summary: 'vetted' } },
    });
} catch (e) { r1 = /exempt-purpose/.test(e.message); }
ok('rejected without affirmed finding', r1);

console.log('2. approval below quorum is rejected');
let r2 = false;
try {
    await board.recordApproval(token, req, {
        review_type: 'new_grant', grantee_org: 'Bright Future Mission', outcome: 'approved',
        motion_text: 'Approve', votes: [{ member_name: 'Solo', vote: 'approve' }],
        exempt_purpose_finding: finding, ofac_screening_id: screen.record_id,
        data: { due_diligence: { summary: 'vetted' } },
    });
} catch (e) { r2 = /quorum/.test(e.message); }
ok('rejected below quorum (default 3)', r2);

console.log('3. valid new-grant approval is recorded');
const approval = await board.recordApproval(token, req, {
    review_type: 'new_grant', grantee_org: 'Bright Future Mission', country: 'KEN',
    grant_reference: 'BFM-2026', outcome: 'approved_conditions', motion_text: 'Approve with conditions',
    votes: goodVotes, exempt_purpose_finding: finding,
    ofac_screening_id: screen.record_id,
    data: {
        due_diligence: { summary: 'vetted' },
        conditions: ['Quarterly reports required'],
        delegation: { authorized: true, scope: 'Staff may release up to $2,000/month within budget' },
        proposed_terms: { purpose: 'staff salaries', amount: 24000, schedule: '$2000/mo', term: '12mo' },
    },
});
ok('approval recorded', approval.outcome === 'approved_conditions');
ok('quorum computed met', approval.quorum_met === true);
ok('tally stored', approval.data.tally.approve === 3 && approval.data.tally.oppose === 1);
ok('links to screening', approval.ofac_screening_id === screen.record_id);

console.log('4. annual review chains via prior_approval_id and supersedes prior');
const renewal = await board.reviseApproval(token, req, approval.record_id, {
    review_type: 'annual_review', grantee_org: 'Bright Future Mission', outcome: 'renewed',
    motion_text: 'Renew for another year', votes: goodVotes, exempt_purpose_finding: finding,
    ofac_screening_id: screen.record_id,
    data: {
        reports_received: 4, reports_expected: 4, reconciliation_status: 'balanced',
        compliance_flags: [], re_screening: { result: 'clear' },
    },
});
ok('renewal links to prior approval', renewal.prior_approval_id === approval.record_id);
const priorAfter = await board.getApproval(token, approval.record_id);
ok('prior approval now superseded', priorAfter.status === 'superseded');

console.log(`\nALL ${pass} board integration assertions passed.`);
