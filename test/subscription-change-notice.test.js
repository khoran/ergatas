import chai from 'chai';
const expect = chai.expect;

import { isSubscriptionEvent, isNotableSubscriptionChange, subscriptionAmount,
         changedFields, describeSubscriptionChange } from '../lib/server/subscription-change-notice.js';

function subscription(overrides = {}){
    return Object.assign({
        id: "sub_123",
        customer: "cus_123",
        status: "active",
        currency: "usd",
        metadata: {missionary_profile_key: "42", worker_name: "Jane Worker"},
        items: {data:[{quantity:1, price:{unit_amount: 2500, currency:"usd", recurring:{interval:"month"}}}]},
    },overrides);
}
function event(type,object,previous_attributes,extra={}){
    return Object.assign({
        id: "evt_1", type, account: "acct_1",
        data: {object, previous_attributes},
    },extra);
}

describe("subscription-change-notice", function(){
    describe("isSubscriptionEvent", function(){
        it("recognizes the customer.subscription.* events", function(){
            expect(isSubscriptionEvent(event("customer.subscription.created",subscription()))).to.equal(true);
            expect(isSubscriptionEvent(event("customer.subscription.deleted",subscription()))).to.equal(true);
        });
        it("rejects other events and null", function(){
            expect(isSubscriptionEvent(event("invoice.payment_succeeded",{}))).to.equal(false);
            expect(isSubscriptionEvent(null)).to.equal(false);
        });
    });

    describe("isNotableSubscriptionChange", function(){
        it("always notifies for created / deleted / paused / resumed", function(){
            ["created","deleted","paused","resumed"].forEach( kind =>
                expect(isNotableSubscriptionChange(event("customer.subscription."+kind,subscription())),kind).to.equal(true));
        });
        it("notifies when an update changes the amount", function(){
            const ev = event("customer.subscription.updated",subscription(),
                             {items:{data:[{price:{unit_amount:1000,currency:"usd",recurring:{interval:"month"}}}]}});
            expect(isNotableSubscriptionChange(ev)).to.equal(true);
        });
        it("notifies when an update cancels at period end", function(){
            const ev = event("customer.subscription.updated",subscription({cancel_at_period_end:true}),
                             {cancel_at_period_end:false});
            expect(isNotableSubscriptionChange(ev)).to.equal(true);
        });
        it("ignores routine billing bookkeeping updates", function(){
            const ev = event("customer.subscription.updated",subscription(),
                             {latest_invoice:"in_old", current_period_end: 1700000000});
            expect(isNotableSubscriptionChange(ev)).to.equal(false);
        });
        it("ignores an update with no previous_attributes", function(){
            expect(isNotableSubscriptionChange(event("customer.subscription.updated",subscription()))).to.equal(false);
        });
        it("ignores non-subscription events", function(){
            expect(isNotableSubscriptionChange(event("invoice.payment_failed",{}))).to.equal(false);
        });
    });

    describe("subscriptionAmount", function(){
        it("reads the first item's price and interval", function(){
            expect(subscriptionAmount(subscription())).to.deep.equal({amount:25, currency:"usd", interval:"month"});
        });
        it("multiplies by quantity", function(){
            const sub = subscription({items:{data:[{quantity:3, price:{unit_amount:1000,currency:"usd",recurring:{interval:"month"}}}]}});
            expect(subscriptionAmount(sub).amount).to.equal(30);
        });
        it("falls back to the legacy plan object", function(){
            const sub = subscription({items: undefined, plan:{amount:5000, currency:"cad", interval:"month"}});
            expect(subscriptionAmount(sub)).to.deep.equal({amount:50, currency:"cad", interval:"month"});
        });
        it("returns null when there is no price", function(){
            expect(subscriptionAmount(subscription({items:{data:[]}, plan:undefined}))).to.equal(null);
            expect(subscriptionAmount(null)).to.equal(null);
        });
    });

    describe("changedFields", function(){
        it("renders old -> new for notable fields only", function(){
            const ev = event("customer.subscription.updated",subscription({status:"past_due"}),
                             {status:"active", latest_invoice:"in_old"});
            expect(changedFields(ev)).to.deep.equal(["status: active -> past_due"]);
        });
        it("renders amount changes as money", function(){
            const ev = event("customer.subscription.updated",subscription(),
                             {items:{data:[{price:{unit_amount:1000,currency:"usd",recurring:{interval:"month"}}}]}});
            expect(changedFields(ev)[0]).to.equal("items: $10.00/month -> $25.00/month");
        });
        it("is empty for a create", function(){
            expect(changedFields(event("customer.subscription.created",subscription()))).to.deep.equal([]);
        });
    });

    describe("describeSubscriptionChange", function(){
        it("summarizes a new subscription", function(){
            const notice = describeSubscriptionChange(event("customer.subscription.created",subscription()),
                                                      {donorEmail:"donor@x.com", donorName:"Donor Dan",
                                                       profileUrl:"https://ergatas.org/profile-detail/42"});
            expect(notice.subject).to.equal("New recurring donation - Jane Worker");
            expect(notice.text).to.contain("Donor Dan <donor@x.com>");
            expect(notice.text).to.contain("$25.00/month");
            expect(notice.text).to.contain("https://ergatas.org/profile-detail/42");
            expect(notice.text).to.contain("sub_123");
            expect(notice.text).to.contain("acct_1");
        });
        it("includes the cancellation reason on a delete", function(){
            const sub = subscription({status:"canceled",
                                      cancellation_details:{reason:"cancellation_requested", comment:"too expensive"}});
            const notice = describeSubscriptionChange(event("customer.subscription.deleted",sub));
            expect(notice.subject).to.equal("Recurring donation canceled - Jane Worker");
            expect(notice.text).to.contain("cancellation_requested (too expensive)");
        });
        it("lists what changed on an update", function(){
            const ev = event("customer.subscription.updated",subscription({cancel_at_period_end:true}),
                             {cancel_at_period_end:false});
            const notice = describeSubscriptionChange(ev);
            expect(notice.text).to.contain("What changed:");
            expect(notice.text).to.contain("cancel_at_period_end: false -> true");
            expect(notice.text).to.contain("Cancels at period end: yes");
        });
        it("does not blow up on a subscription with no metadata", function(){
            const notice = describeSubscriptionChange(event("customer.subscription.updated",{id:"sub_9"},{status:"active"}));
            expect(notice.subject).to.equal("Recurring donation changed - unknown worker");
            expect(notice.text).to.contain("Amount:          unknown");
        });
    });
});
