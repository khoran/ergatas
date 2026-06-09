import chai from 'chai';
const expect = chai.expect;

import { reconcile, CONFIRMATION_1, CONFIRMATION_2 } from '../lib/server/grants/reports.js';

describe('grants salary-report reconciliation', function () {

    it('computes per-line variance and totals', function () {
        const { lines, totals } = reconcile({ lines: [
            { employee: 'A', sent: 1000, applied: 1000 },
            { employee: 'B', sent: 500, applied: 400, explanation: 'partial month' },
        ]});
        expect(lines[0].variance).to.equal(0);
        expect(lines[1].variance).to.equal(100);
        expect(totals).to.deep.equal({ sent: 1500, applied: 1400, variance: 100 });
    });

    it('clears explanation on balanced rows', function () {
        const { lines } = reconcile({ lines: [{ employee: 'A', sent: 100, applied: 100, explanation: 'ignored' }] });
        expect(lines[0].explanation).to.equal(null);
    });

    it('requires an explanation when variance != 0', function () {
        expect(() => reconcile({ lines: [{ employee: 'A', sent: 100, applied: 90 }] }))
            .to.throw(/requires an explanation/);
    });

    it('requires every applied amount', function () {
        expect(() => reconcile({ lines: [{ employee: 'A', sent: 100 }] })).to.throw(/applied/);
    });

    it('rejects negative applied', function () {
        expect(() => reconcile({ lines: [{ employee: 'A', sent: 100, applied: -5, explanation: 'x' }] }))
            .to.throw(/negative/);
    });

    it('role-based mode allows missing employee name', function () {
        const { lines } = reconcile({ role_based_mode: true, lines: [{ role: 'Teacher', sent: 100, applied: 100 }] });
        expect(lines[0].employee).to.equal(null);
    });

    it('exposes the verbatim certifications', function () {
        expect(CONFIRMATION_1).to.match(/charitable role/);
        expect(CONFIRMATION_2).to.match(/solely for the Charitable Purpose/);
    });
});
