import chai from 'chai';
const expect = chai.expect;

import { parseCsv } from '../lib/shared/csv-parse.js';

describe("parseCsv", function(){
    it("parses a simple header + rows", function(){
        const { headers, rows } = parseCsv("title,post_date\nHello,2026-01-01\nWorld,2026-02-02\n");
        expect(headers).to.deep.equal(["title","post_date"]);
        expect(rows).to.have.length(2);
        expect(rows[0]).to.deep.equal({ title:"Hello", post_date:"2026-01-01" });
        expect(rows[1]).to.deep.equal({ title:"World", post_date:"2026-02-02" });
    });

    it("handles quoted fields with embedded commas", function(){
        const { rows } = parseCsv('title,description\n"A title","A description, with a comma"\n');
        expect(rows[0].title).to.equal("A title");
        expect(rows[0].description).to.equal("A description, with a comma");
    });

    it("handles escaped double-quotes", function(){
        const { rows } = parseCsv('title\n"She said ""hi"" today"\n');
        expect(rows[0].title).to.equal('She said "hi" today');
    });

    it("handles newlines embedded inside quoted fields", function(){
        const { rows } = parseCsv('title,description\nRow1,"line one\nline two"\n');
        expect(rows).to.have.length(1);
        expect(rows[0].description).to.equal("line one\nline two");
    });

    it("handles CRLF line endings", function(){
        const { headers, rows } = parseCsv("title,post_date\r\nHello,2026-01-01\r\n");
        expect(headers).to.deep.equal(["title","post_date"]);
        expect(rows).to.have.length(1);
        expect(rows[0].post_date).to.equal("2026-01-01");
    });

    it("does not emit a trailing empty record for a trailing newline", function(){
        const { rows } = parseCsv("title\nA\nB\n");
        expect(rows).to.have.length(2);
    });

    it("works without a trailing newline", function(){
        const { rows } = parseCsv("title\nA");
        expect(rows).to.have.length(1);
        expect(rows[0].title).to.equal("A");
    });

    it("defaults missing columns to '' and ignores extra columns", function(){
        const { rows } = parseCsv("title,description,post_date\nOnlyTitle\n");
        expect(rows[0]).to.deep.equal({ title:"OnlyTitle", description:"", post_date:"" });
        const extra = parseCsv("title\nA,B,C\n");
        expect(extra.rows[0]).to.deep.equal({ title:"A" });
    });

    it("strips a UTF-8 BOM from the first header", function(){
        const { headers } = parseCsv("﻿title,post_date\nA,2026-01-01\n");
        expect(headers[0]).to.equal("title");
    });

    it("skips fully blank lines between records", function(){
        const { rows } = parseCsv("title\nA\n\nB\n");
        expect(rows.map(r => r.title)).to.deep.equal(["A","B"]);
    });

    it("returns empty structures for empty input", function(){
        expect(parseCsv("")).to.deep.equal({ headers: [], rows: [] });
        expect(parseCsv(null)).to.deep.equal({ headers: [], rows: [] });
    });
});
