import chai from 'chai';
const expect = chai.expect;

import { parseCsvLine, parseSdnCsv, parseAltCsv, normalizeName } from '../lib/server/grants/ofac.js';
import { computeOverallResult } from '../lib/server/grants/screening.js';

describe('grants OFAC parsing & screening logic', function () {

    it('parseCsvLine handles quotes, commas, and OFAC -0- empties', function () {
        expect(parseCsvLine('123,"SMITH, John","individual","SDGT",-0-'))
            .to.deep.equal(['123', 'SMITH, John', 'individual', 'SDGT', '']);
    });

    it('parseSdnCsv extracts entity rows with split programs', function () {
        const rows = parseSdnCsv('123,"AL-QAIDA","entity","SDGT; SDNTK","-0-"\n456,"Doe, Jane","individual","IRAN","-0-"');
        expect(rows).to.have.lengthOf(2);
        expect(rows[0]).to.include({ ent_num: '123', name: 'AL-QAIDA', name_kind: 'primary', entity_type: 'entity' });
        expect(rows[0].programs).to.deep.equal(['SDGT', 'SDNTK']);
        expect(rows[1].entity_type).to.equal('individual');
    });

    it('parseAltCsv extracts aka name variants', function () {
        const rows = parseAltCsv('123,1,"aka","AL QAEDA","-0-"');
        expect(rows[0]).to.include({ ent_num: '123', name: 'AL QAEDA', name_kind: 'aka' });
    });

    it('normalizeName lowercases and strips punctuation', function () {
        expect(normalizeName('AL-QAIDA, (Group)!')).to.equal('al qaida group');
    });

    it('computeOverallResult escalates on potential, blocks on confirmed', function () {
        expect(computeOverallResult([{ result: 'clear' }])).to.equal('clear');
        expect(computeOverallResult([{ result: 'clear' }, { result: 'potential_match' }])).to.equal('escalated');
        expect(computeOverallResult([{ result: 'potential_match' }, { result: 'confirmed_match' }])).to.equal('blocked');
    });
});
