import assert from 'assert';
import chai from 'chai';
const expect = chai.expect;

import * as utils from '../lib/utils.js';

describe("util tests",function(){
   describe("nonProfitSearch",async function(){
       var result;
       before(async function(){
            result = await utils.nonProfitSearch("gospel recordings");

       });
       //console.log("result: ",result);
       it("should have at least one result",() =>{
            expect(result.organizations).to.have.lengthOf.at.least(1);
       });

       it("should find 'gospel recordings'",() =>{
           expect(result.organizations[0].name).to.equal("GOSPEL RECORDINGS");
       });
   });
});