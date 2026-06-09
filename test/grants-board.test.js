import chai from 'chai';
const expect = chai.expect;

import { tallyVotes, computeQuorum, meetsThreshold } from '../lib/server/grants/board.js';

describe('grants board voting logic', function () {
    const votes = [
        { member_name: 'A', vote: 'approve' },
        { member_name: 'B', vote: 'approve' },
        { member_name: 'C', vote: 'oppose' },
        { member_name: 'D', vote: 'recuse', conflict_reason: 'conflict' },
        { member_name: 'E', vote: 'abstain' },
    ];

    it('tallies by vote type', function () {
        expect(tallyVotes(votes)).to.deep.equal({ approve: 2, oppose: 1, abstain: 1, recuse: 1 });
    });

    it('excludes recused members from quorum count', function () {
        // 4 non-recused present
        expect(computeQuorum(votes, { quorum: 4 })).to.deep.equal({ present: 4, quorum_met: true });
        expect(computeQuorum(votes, { quorum: 5 }).quorum_met).to.equal(false);
    });

    it('majority threshold over non-recused base', function () {
        // base = approve+oppose+abstain = 4; approve=2; majority needs > 2 -> false
        expect(meetsThreshold({ approve: 2, oppose: 1, abstain: 1 }, { approve_threshold: 'majority' })).to.equal(false);
        expect(meetsThreshold({ approve: 3, oppose: 1, abstain: 0 }, { approve_threshold: 'majority' })).to.equal(true);
    });

    it('two-thirds threshold', function () {
        // base=6, 2/3 -> ceil(4)=4
        expect(meetsThreshold({ approve: 4, oppose: 2, abstain: 0 }, { approve_threshold: 'two_thirds' })).to.equal(true);
        expect(meetsThreshold({ approve: 3, oppose: 3, abstain: 0 }, { approve_threshold: 'two_thirds' })).to.equal(false);
    });
});
