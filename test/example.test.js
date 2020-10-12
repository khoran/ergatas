import assert from 'assert';
import chai from 'chai';
const expect = chai.expect;

describe("Simple math test",() =>{
    it("should return 2",()=>{
        expect(1+1).to.equal(2);
    });
    it("should return 9",()=>{
        expect(3*3).to.equal(9);
    });
});