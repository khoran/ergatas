import chai from 'chai';
const expect = chai.expect;

import { DataAccess, FTSFilterAppender, FilterAppender } from '../lib/shared/data-access.js';

describe("data-access facade", function(){
    // construction makes no network calls; dummy ajax fn is never invoked here.
    const da = new DataAccess("http://example.invalid", () => Promise.resolve(null), null);

    it("seals the PostgREST transport — db* methods are unreachable", function(){
        for(const m of ["dbRequest","dbGet","dbAuthGet","dbPost","dbAuthPost",
                        "dbPatch","dbAuthPatch","dbAuthDelete","single","representation",
                        "minimal","ignoreDups","setRange","appendHeader","retry","singleOrNone","auth"]){
            expect(da[m], m+" should not be exposed").to.equal(undefined);
        }
    });

    it("exposes domain methods both flat and namespaced", function(){
        expect(da.getUser).to.be.a('function');
        expect(da.users.getUser).to.be.a('function');
        expect(da.getPages).to.be.a('function');
        expect(da.pages.getPages).to.be.a('function');
        expect(da.workerDocs.listDocumentsForProfile).to.be.a('function');
    });

    it("keeps the lifecycle methods on the facade", function(){
        expect(da.setToken).to.be.a('function');
        expect(da.isAuthenticated).to.be.a('function');
        expect(da.dbReady).to.be.a('function');
        expect(da.isAuthenticated()).to.equal(false);
    });

    it("re-exports the FilterAppender family through the shim", function(){
        expect(new FTSFilterAppender()).to.be.instanceof(FilterAppender);
    });
});
