import chai from 'chai';
const expect = chai.expect;

import { emailFromSession, metadataFromSession, subscriptionIdFromSession } from '../lib/server/checkout-session-fields.js';

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
        it("reads parent.subscription_details.metadata on newer-API invoices", function(){
            const sub = {missionary_profile_key: "mpk", worker_name: "Jane Doe"};
            expect(metadataFromSession({ parent: {subscription_details: {metadata: sub}}, metadata: {} })).to.equal(sub);
        });
        it("falls back to the first line item's metadata when the invoice metadata is empty", function(){
            const line = {missionary_profile_key: "mpk", worker_name: "Jane Doe"};
            expect(metadataFromSession({ metadata: {}, lines: {data: [{metadata: line}]} })).to.equal(line);
        });
        it("skips an empty subscription_details.metadata in favour of one identifying the profile", function(){
            const line = {missionary_profile_key: "mpk"};
            expect(metadataFromSession({ subscription_details: {metadata: {}}, metadata: {}, lines: {data: [{metadata: line}]} })).to.equal(line);
        });
    });

    describe("subscriptionIdFromSession", function(){
        it("reads a top-level subscription id", function(){
            expect(subscriptionIdFromSession({ subscription: "sub_1" })).to.equal("sub_1");
        });
        it("reads an expanded subscription object", function(){
            expect(subscriptionIdFromSession({ subscription: {id: "sub_1"} })).to.equal("sub_1");
        });
        it("reads parent.subscription_details.subscription on newer-API invoices", function(){
            expect(subscriptionIdFromSession({ parent: {subscription_details: {subscription: "sub_2"}} })).to.equal("sub_2");
        });
        it("returns null when there is no subscription", function(){
            expect(subscriptionIdFromSession({})).to.equal(null);
            expect(subscriptionIdFromSession(null)).to.equal(null);
        });
    });
});
