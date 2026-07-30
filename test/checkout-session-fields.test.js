import chai from 'chai';
const expect = chai.expect;

import { emailFromSession, metadataFromSession } from '../lib/server/checkout-session-fields.js';

describe("checkout-session-fields", function(){
    describe("emailFromSession", function(){
        it("prefers the top-level email", function(){
            expect(emailFromSession({
                email: "a@x.com", customer_email: "b@x.com", customer_details: {email: "c@x.com"}
            })).to.equal("a@x.com");
        });
        it("falls back to customer_email", function(){
            expect(emailFromSession({
                customer_email: "b@x.com", customer_details: {email: "c@x.com"}
            })).to.equal("b@x.com");
        });
        it("falls back to customer_details.email", function(){
            expect(emailFromSession({ customer_details: {email: "c@x.com"} })).to.equal("c@x.com");
        });
        it("returns null when no email is present", function(){
            expect(emailFromSession({ customer_details: {} })).to.equal(null);
        });
        it("does not throw when customer_details is absent", function(){
            expect(emailFromSession({})).to.equal(null);
        });
        it("returns null for null / undefined input", function(){
            expect(emailFromSession(null)).to.equal(null);
            expect(emailFromSession(undefined)).to.equal(null);
        });
    });

    describe("metadataFromSession", function(){
        it("returns subscription_details.metadata when present, even if top-level metadata exists", function(){
            const sub = {k: "sub"};
            const top = {k: "top"};
            expect(metadataFromSession({ subscription_details: {metadata: sub}, metadata: top })).to.equal(sub);
        });
        it("returns top-level metadata when there is no subscription_details", function(){
            const top = {k: "top"};
            expect(metadataFromSession({ metadata: top })).to.equal(top);
        });
        it("returns undefined for undefined input", function(){
            expect(metadataFromSession(undefined)).to.equal(undefined);
        });
    });
});
