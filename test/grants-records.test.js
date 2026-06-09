import chai from 'chai';
const expect = chai.expect;

import { computeContentHash, canonicalContent, verifyRecord } from '../lib/server/grants/records.js';

// Build a persisted-shape row the way createRecord would (snapshot + hash).
function persisted(business) {
    const row = { record_id: 'uuid-1', status: 'final', created_on: 'z', created_by: 'srv', ...business };
    row.canonical_content = canonicalContent(row);
    row.content_hash = computeContentHash(row);
    return row;
}

describe('grants record layer — content hashing', function () {

    it('produces a stable SHA-256 hex digest', function () {
        expect(computeContentHash({ a: 1, b: 'x' })).to.match(/^[0-9a-f]{64}$/);
    });

    it('is independent of key order (canonical)', function () {
        const h1 = computeContentHash({ a: 1, b: { c: 2, d: 3 } });
        const h2 = computeContentHash({ b: { d: 3, c: 2 }, a: 1 });
        expect(h1).to.equal(h2);
    });

    it('excludes surrogate / lifecycle / audit columns from content', function () {
        const base = { grantee_org: 'X', overall_result: 'clear', timestamp_utc: 't' };
        const withExtras = { ...base, record_id: 'r', status: 'final', content_hash: 'h', created_on: 'z', created_by: 'srv' };
        expect(computeContentHash(withExtras)).to.equal(computeContentHash(base));
    });

    it('changes when any business field changes', function () {
        expect(computeContentHash({ grantee_org: 'X', amount: 100 }))
            .to.not.equal(computeContentHash({ grantee_org: 'X', amount: 101 }));
    });

    it('verifyRecord confirms an intact persisted row', function () {
        expect(verifyRecord(persisted({ grantee_org: 'X', overall_result: 'clear' }))).to.equal(true);
    });

    it('verifyRecord rejects a tampered snapshot', function () {
        const row = persisted({ grantee_org: 'X', overall_result: 'clear' });
        row.canonical_content = row.canonical_content.replace('clear', 'blocked');
        expect(verifyRecord(row)).to.equal(false);
    });

    it('verifyRecord rejects a tampered hash', function () {
        const row = persisted({ grantee_org: 'X', overall_result: 'clear' });
        row.content_hash = 'deadbeef';
        expect(verifyRecord(row)).to.equal(false);
    });

    it('status flip (final -> superseded) preserves verification', function () {
        const row = persisted({ grantee_org: 'X', overall_result: 'clear' });
        row.status = 'superseded'; // status is not part of content
        expect(verifyRecord(row)).to.equal(true);
    });
});
