// Live integration check for Phase 1 (OFAC ingest + screening) against the LOCAL
// stack. Wired by test/grants/run-integration.sh.
import { SignJWT } from 'jose';
import assert from 'assert';

const ofac = await import('../../lib/server/grants/ofac.js');
const screening = await import('../../lib/server/grants/screening.js');

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({ sub: 'ext-staff-1', email: 'staff@example.org', name: 'Staffer',
        roles: ['grant_staff'], role: 'ergatas_server' })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('5m').sign(secret);
const req = { ip: '198.51.100.7', headers: { 'user-agent': 'ofac-itest/1.0' } };

let pass = 0;
const ok = (l, c) => { assert(c, 'FAILED: ' + l); console.log('  ✔', l); pass++; };

console.log('1. ingest sample SDN list');
const sdn = '111,"AL-QAIDA","entity","SDGT","-0-"\n222,"HELPER FOUNDATION","entity","IRAN","-0-"';
const alt = '111,1,"aka","AL QAEDA","-0-"';
const ingest = await ofac.ingestList({ listName: 'SDN', listVersion: '2026-06-01-test', primaryCsv: sdn, altCsv: alt });
ok('ingested 3 name rows (2 primary + 1 aka)', ingest.count === 3);
ok('current list version reflects ingest', (await ofac.currentListVersion()) === '2026-06-01-test');

console.log('2. screen targets (fuzzy match)');
const screened = await ofac.screenTargets([
    { name: 'al qaeda', type: 'org' },               // should hit
    { name: 'Bright Future Mission', type: 'org' },  // should be clean
]);
ok('known bad name flagged potential', screened[0].auto_result === 'potential_match' && screened[0].matches.length > 0);
ok('unrelated name is clear', screened[1].auto_result === 'clear' && screened[1].matches.length === 0);

console.log('3. finalize an immutable screening record (escalated)');
const rec = await screening.recordScreening(token, req, {
    grantee_org: 'Bright Future Mission',
    country: 'KEN',
    targets: [{ name: 'Bright Future Mission', type: 'org' }, { name: 'Jane Director', type: 'director' }],
    results: [
        { name: 'Bright Future Mission', result: 'clear' },
        { name: 'Jane Director', result: 'potential_match', disposition_note: 'reviewing partial name match' },
    ],
});
ok('overall_result computed as escalated', rec.overall_result === 'escalated');
ok('screening stamped with list_source_version', rec.list_source_version === '2026-06-01-test');
ok('submitter identity from token', rec.submitter_external_user_id === 'ext-staff-1');

console.log('4. non-clear result without a disposition note is rejected');
let rejected = false;
try {
    await screening.recordScreening(token, req, {
        grantee_org: 'X', results: [{ name: 'X', result: 'potential_match' }],
    });
} catch (e) { rejected = true; }
ok('missing disposition note throws', rejected);

console.log('5. due diligence record');
const dd = await screening.recordDueDiligence(token, req, {
    grantee_org: 'Bright Future Mission', summary: 'Vetted; registered charity', risk_rating: 'low',
});
ok('due diligence record created with risk_rating', dd.risk_rating === 'low');

console.log(`\nALL ${pass} OFAC integration assertions passed.`);
