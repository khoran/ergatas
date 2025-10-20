
import Stripe from 'stripe';
import fs from 'fs';
import { AppError } from './app-error.js';
import * as utils from './utils.js';

var stripe;

function getStripe(){
    if(stripe == null){
        const private_key = process.env.STRIPE_SECRET_KEY;
        stripe = Stripe(private_key);
    }
    return stripe;
}

export async function makeDonation(data){
    const domain = process.env.DOMAIN;
    const email= data.email;
    const worker_name = data.worker_name;
    const donor_name = data.donor_name;
    const amount = data.amount;
    const address= data.address;
    const phone = data.phone;
    const donation_type=data.donation_type;
    const missionary_profile_key= data.missionary_profile_key;
    const return_url = data.return_url || `https://${domain}` ;
  
    console.local("creating stripe session for worker ",missionary_profile_key);
    try{

        const accountHeader = await getConnectedAccountHeader(missionary_profile_key);
        console.log("found stripe account "+JSON.stringify(accountHeader)+" for MPK "+missionary_profile_key);

        const customer = await getStripeCustomer(donor_name,email,address,phone,accountHeader);
        const product = await getOrCreateProduct(worker_name,missionary_profile_key,accountHeader);
        const accountInfo = await connectedAccountInfo(accountHeader);

        console.log("account info:", accountInfo);

        var  sessionData = {
            ui_mode: "embedded",
            return_url: `${return_url}?session_id={CHECKOUT_SESSION_ID}`,
            redirect_on_completion: "if_required",
            customer: customer.id,
  
           metadata:{
                missionary_profile_key:missionary_profile_key,
                worker_name: worker_name,
                donation_type: donation_type,
                product: product.id,
                unit_amount:amount,
                currency: accountInfo.currency,
            },
        }


        if(donation_type=="one-time"){
            console.local("one time donation")
            sessionData.mode = "payment";
            sessionData.submit_type="donate";
            sessionData.payment_method_types = accountInfo.payment_method_types;
            sessionData.payment_method_options= {
                acss_debit: {
                    mandate_options: {
                        payment_schedule:  'sporadic',
                        transaction_type: 'personal',  // Optional: 'personal' or 'business'
                    },
                },
            };
 
            sessionData.line_items= [
                {
                    price_data:{
                        currency: accountInfo.currency,
                        product: product.id,
                        unit_amount:amount,
                    },
                    quantity: 1
                },
            ];
        }else if(donation_type==="recurring"){
            console.local("recurring donation")

            sessionData.mode = "setup";
            sessionData.payment_method_types = accountInfo.subscription_payment_types;

            if(sessionData.payment_method_types && sessionData.payment_method_types.includes("acss_debit"))
                sessionData.payment_method_options= {
                    acss_debit:{
                        currency: accountInfo.currency,
                        mandate_options:{
                            default_for:["invoice","subscription"],
                            transaction_type:"personal",
                        }
                    }
                };
            sessionData.currency = accountInfo.currency;
        }
        console.debug("session data: ",JSON.stringify(sessionData,null,"  "));

        const session = await getStripe().checkout.sessions.create(sessionData,accountHeader);

        //console.local("session created, url: "+session.url);
        console.local("session : ",JSON.stringify(session,null," "));
        return {
            client_secret:session.client_secret,
            stripeAccount:accountHeader && accountHeader.stripeAccount,
        };

    }catch(error){
        console.local("Stripe Error: ",error);
        throw error;
    }


}
async function getConnectedAccountHeader(missionary_profile_key){
    const profile = await utils.getDB().getDisplayProfileByKey(missionary_profile_key);
    if(!profile)
        return undefined;
    const organization_key = profile.data.organization_key;
    const org = await utils.getDB().getOrganization(organization_key);
    if(org && org.stripe_account )
        return {stripeAccount: org.stripe_account};

    return undefined;
}
async function connectedAccountInfo(accountHeader){
    if(!accountHeader) // no connected account in use
        return {
            currency: "usd",
        };
    
    const accountId = accountHeader.stripeAccount;
    const blacklist = ["us_bank_transfer","sepa_bank_transfer" ];

    const account = await getStripe().accounts.retrieve(accountId, {
        stripeAccount: accountId
    });
    const name_replacements={
        us_bank_account_ach:  "us_bank_account"
    }
    console.log("account: ",account);

    const activePaymentMethods = Object.entries(account.capabilities).
                filter(cap=>cap[0].includes("_payments") && cap[1]==="active"). //keep only active payment methods
                map(cap =>cap[0].replace("_payments","") ).  //get name by removing '_payments'
                filter(payment_name => ! blacklist.includes(payment_name)).  //exclude certain names
                map(payment_name => name_replacements[payment_name] || payment_name );  //change some names

    const validForSubscriptions=["card","acss_debit","us_bank_account"];

    return {
        country: account.country,
        currency: account.default_currency,
        payment_method_types: activePaymentMethods,
        subscription_payment_types: activePaymentMethods.filter(method => validForSubscriptions.includes(method)),
     }
}
export async function handleStripeEvent(body,sig,isConnect = false){
    const endpointSecret = isConnect ? process.env.STRIPE_CONNECT_WEBHOOK_SECRET_KEY : process.env.STRIPE_WEBHOOK_SECRET_KEY;
    let event;

    //console.log(" webook secret: ",endpointSecret);
    //console.log("sig: ",sig);
    //console.log("body: ",body);

    try {
        if(body.account != null && body.type != null)
            event = body;  //connect account events dom't see to be encrypted for some reason
        else
            event = Stripe.webhooks.constructEvent(body, sig, endpointSecret);
    } catch (err) {
        console.error("Stripe event error: ",err.message);
        throw new AppError(`Webhook Error: ${err.message}`);
    }

    console.local("handling a stripe "+(isConnect? "connect ":"")+"event "+event.type+", acct: "+event.account);

    //console.log("got stripe event ",event);
    const obj=event.data.object;

    switch (event.type) {
        case 'checkout.session.completed': //maybe where we send the receipt. check that payment_status = paid
        case 'checkout.session.async_payment_succeeded':
            //console.log("got stripe completion event ",event);
            if(obj.payment_status==="paid"){
                //console.log(JSON.stringify(event,null," "));
                if(obj.mode==="payment")
                    await sendReceipt(obj,event.account);
                else if(obj.mode==="subscription")
                    await sendSubscriptionNotice(obj,event.account);
            }else{
                console.log("checkout.session.completed, but not paid");
                await sendDonationAck(obj,event.account);

                if(obj.mode==="setup"){
                    console.log("got finished checkout in SETUP mode")
                    await finishSubscriptionSetup(obj);
                }
            }
            break;
        case 'invoice.payment_succeeded':
            await sendSubscriptionNotice(obj,event.account);
            break;
        case 'invoice.payment_failed':
        case 'checkout.session.async_payment_failed':
            console.info("async payment failed: ",obj);
            await sendFailureNotice(obj,event.account);
            break;

        default:
            console.log(`Unhandled event type ${event.type}`);
            //await utils.sendEmail({
            //    from: "information@ergatas.org",
            //    to: "information@ergatas.org",
            //    subject: "Unhandled stripe event",
            //    text: JSON.stringify(event),
            //})
    }

}
export async function markTxPaid(possible_transaction_key){
    console.debug("marking tx "+possible_transaction_key+" as paid");
    await utils.getDB().updatePossibleTransaction(possible_transaction_key,{ paid: true });
}
//'StripeId' is what we store in the database. It can be either a payment intent, or a subscription.
export async function getCustomerFromStripeId(stripeId){
    console.log("getting customer from stripe id "+stripeId);
    var customerId;
    if(stripeId.startsWith("pi_")){
        const paymentIntent = await getStripe().paymentIntents.retrieve(stripeId);
        customerId = paymentIntent.customer;
    }else if(stripeId.startsWith("sub_")){
        const subscription = await getStripe().subscriptions.retrieve(stripeId);
        customerId = subscription.customer;
    }else{
        console.error("unknown stripeId type: "+stripeId);
        return null;
    }

    if(customerId == null){
        console.error("failed to find customer from PI "+paymentIntentId,paymentIntent);
        return null;
    }
   
    const customer = await getStripe().customers.retrieve(customerId);
    return customer;
}




async function finishSubscriptionSetup(obj){
    console.log("finishing subscription after SETUP",obj);
    //start of recurring donation, should have payment method setup by this point.
    //get setup intent, customer, 
    const customerId = obj.customer;
    const metadata = obj.metadata;
    const setupIntentId = obj.setup_intent;
    const accountHeader = await getConnectedAccountHeader(metadata.missionary_profile_key);

    const setupIntent = await getStripe().setupIntents.retrieve(setupIntentId,accountHeader);
    console.log("fetched setupIntent: ",setupIntent);
    //const mandate = await getStripe().mandates.retrieve(setupIntent.mandate,accountHeader);
    //console.log("mandate: ",mandate);



    const subscription = await getStripe().subscriptions.create({
        customer: customerId,
        default_payment_method:setupIntent.payment_method,
        payment_behavior:"allow_incomplete",

        metadata: metadata,
        items: [
                {
                    price_data:{
                        currency: obj.currency  || metadata.currency,
                        product: metadata.product,
                        unit_amount:metadata.unit_amount,
                        recurring:{
                            interval: "month"
                        }
                    },
                    quantity: 1
                },
            ],
        expand:["latest_invoice"]
        },accountHeader);

    console.log("created subscription: ",subscription);
}

async function getStripeCustomer(donor_name,email, address,phone,accountHeader){
    var results = await getStripe().customers.list({
        email:email,
        limit: 1,
    },accountHeader);
    if(results.data != null && results.data.length != null && results.data.length > 0){
        console.local("found stripe customer for email "+email);
        return results.data[0];
    }else{ //create a new customer
        console.debug("create a new customer with email "+email);
        var options = {email:email};
        if(donor_name != null)
            options.name = donor_name;
        if(phone != null)
            options.phone = phone;
        if(address != null)
            options.address = address;
       
        console.debug("new customer options: ",options);
        const customer = await getStripe().customers.create(options,accountHeader);
        console.log("new customer: ",customer);
        return customer;
    }
    //console.local("no stripe customer found with email "+email);
    //return null;
}




function getPaymentMethod(pi){
    if(pi != null && pi.charges != null && pi.charges.data != null && pi.charges.data.length > 0){
        return pi.charges.data.map(charge => {
            var method = "";
            if(charge.payment_method_details.type === "card")
                method = charge.payment_method_details.card.brand;
            else
                method = charge.payment_method_details.type;
            
            if(charge.payment_method_details[charge.payment_method_details.type] &&
                    charge.payment_method_details[charge.payment_method_details.type].last4 )
                method = method+" - "+charge.payment_method_details[charge.payment_method_details.type].last4;

            return method;
        }).join();
    }else
        throw new AppError("Could not find payment method for pi ",pi && pi.id);
}
function getReceiptUrl(pi){
    return pi && pi.charges && pi.charges.data && pi.charges.data[0] && pi.charges.data[0].receipt_url;
}
async function sendSubscriptionNotice(checkoutSession,stripeAccount){

    try{

        console.local("sending stripe subscription notice. session: ",checkoutSession);
        const accountHeader = {stripeAccount};
        const metadata = checkoutSession.subscription_details ? checkoutSession.subscription_details.metadata : checkoutSession.metadata;
        const missionary_profile_key = metadata.missionary_profile_key;
        const worker_name= metadata.worker_name;
        const email = checkoutSession.email || checkoutSession.customer_email || checkoutSession.customer_details.email;
        var amount, id,created, receipt_url,portal_url,payment_method;

        if(! await isReceiptEnabled(missionary_profile_key)){
            console.log("subscription receipt disabled for org of missionary profile "+missionary_profile_key);
            return;
        }

        const subscription = await getStripe().subscriptions.retrieve(checkoutSession.subscription,accountHeader);
        console.debug("subscription: ",subscription);

        id = subscription.id;
        amount = subscription.plan.amount / 100.0;
        created = subscription.created;
        portal_url = await getStripePortalLink(checkoutSession.customer,accountHeader);

        const txNum = await recordDonation(amount, "recurring", id,missionary_profile_key);

        var data = {
            receipt_number: txNum,
            amount_paid: formatMoney(amount, checkoutSession.currency),
            date_paid:  (new Date(created*1000)).toLocaleDateString(),
            item_description: "Ministry of "+worker_name,
            portal_url: portal_url,
            title: `Your Ergatas Support Commitment`,
        };

        data.preview = `Support Commitment from Ergatas [#${data.receipt_number}]. Commitment ${data.amount_paid} Date ${data.date_paid}`;

        await utils.mailingList.sendTemplatedEmail("subscription_notice",email,data);

    }catch(error){
        console.error("failed to send stripe subscription notice for checkout session "+(checkoutSession && checkoutSession.id),error);
        throw error;
    }

}

function formatMoney(amount,currency="USD"){
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
    }).format(amount);
}

async function sendDonationAck(checkoutSession){
    try{
        const email = checkoutSession.email || checkoutSession.customer_details.email;
        await utils.mailingList.sendTemplatedEmail("donation_setup",email);
    }catch(error){
        console.error("failed to send stripe ack email for unpaid donation "+(checkoutSession && checkoutSession.id),error);
        throw error;
    }
}
async function sendReceipt(checkoutSession,stripeAccount){

    try{
        console.local("sending stripe receipt. session: ",checkoutSession);
        const missionary_profile_key = checkoutSession.metadata.missionary_profile_key;
        const worker_name= checkoutSession.metadata.worker_name;
        const email  = checkoutSession.email || checkoutSession.customer_details.email;
        var amount, id,created, receipt_url,paymentMethod;

        if(! await isReceiptEnabled(missionary_profile_key)){
            console.log("receipt disabled for org of missionary profile "+missionary_profile_key);
            return;
        }


        const paymentIntent = await getStripe().paymentIntents.retrieve(checkoutSession.payment_intent,{stripeAccount: stripeAccount});
        console.local("got payment intent: ",paymentIntent);
        console.local("charges: ",paymentIntent.charges.data);

        id = paymentIntent.id;
        amount = paymentIntent.amount / 100.0;
        created = paymentIntent.created;
        receipt_url = getReceiptUrl(paymentIntent);
        paymentMethod = getPaymentMethod(paymentIntent);


        const txNum = await recordDonation(amount, "one-time", id,missionary_profile_key);

        var data = {
            receipt_number: txNum,
            amount_paid: formatMoney(amount, paymentIntent.currency),
            date_paid:  (new Date(created*1000)).toLocaleDateString(),
            payment_method: paymentMethod,
            item_description: "Ministry of "+worker_name,
            receipt_url: receipt_url,
            title: `Your Ergatas receipt`,
        };

        data.preview = `Receipt from Ergatas [#${data.receipt_number}]. Amount paid ${data.amount_paid} Date paid ${data.date_paid}`;
        console.local("data:",data);
       
        await utils.mailingList.sendTemplatedEmail("receipt",email,data);

    }catch(error){
        console.error("failed to send stripe receipt for checkout session "+(checkoutSession && checkoutSession.id),error);
        throw error;
    }
}
async function sendFailureNotice(checkoutSession,stripeAccount){

    try{
        console.local("sending stripe failure notice. session: ",checkoutSession);
        const accountHeader = {stripeAccount};
        //const missionary_profile_key = checkoutSession.metadata.missionary_profile_key;
        const metadata = checkoutSession.subscription_details ? checkoutSession.subscription_details.metadata : checkoutSession.metadata;
        const worker_name= metadata.worker_name;
        const email = checkoutSession.email || checkoutSession.customer_email || checkoutSession.customer_details.email;
        var amount, created, paymentMethod,message,portal_url;



        if(checkoutSession.payment_intent != null){
            const paymentIntent = await getStripe().paymentIntents.retrieve(checkoutSession.payment_intent,accountHeader);
            console.local("got payment intent: ",paymentIntent);
            console.local("charges: ",paymentIntent.charges.data);

            amount = paymentIntent.amount / 100.0;
            created = paymentIntent.created;
            paymentMethod = getPaymentMethod(paymentIntent);

            if(paymentIntent.last_payment_error && paymentIntent.last_payment_error.message){
                message = paymentIntent.last_payment_error.message;
            }else{
                message= "We were unable to process your payment.";
            }


        }else if(checkoutSession.subscription != null){
            const subscription = await getStripe().subscriptions.retrieve(checkoutSession.subscription,accountHeader);
            console.debug("subscription: ",subscription);

            try{
                const invoice = await getStripe().invoices.retrieve(subscription.latest_invoice,accountHeader);
                console.debug("invoice: ",invoice);

                const charge = await getStripe().charges.retrieve(invoice.charge,accountHeader);
                console.debug("charge: ",charge);
                message = charge.failure_message;

                const paymentIntent = await getStripe().paymentIntents.retrieve(invoice.payment_intent,accountHeader);
                paymentMethod = getPaymentMethod(paymentIntent);
            }catch(error){
                console.error("failed to get invoice or charge for failed subscription payment",checkoutSession.subscription);
                message= "We were unable to process your payment.";
            }

            amount = subscription.plan.amount / 100.0;
            created = subscription.created;
            portal_url = await getStripePortalLink(checkoutSession.customer,accountHeader);
        }

        var data = {
            amount_paid: formatMoney(amount,metadata.currency),
            date_paid:  (new Date(created*1000)).toLocaleDateString(),
            payment_method: paymentMethod,
            item_description: "Ministry of "+worker_name,
            title: `Payment Failed`,
            message: message,
            portal_url: portal_url,
        };


        data.preview = `Ergatas payment error. Amount ${data.amount_paid}, Date ${data.date_paid}`;
       
        await utils.mailingList.sendTemplatedEmail("payment_failure",email,data);

    }catch(error){
        console.error("failed to send stripe receipt for checkout session "+(checkoutSession && checkoutSession.id),error);
        throw error;
    }
}
async function isReceiptEnabled(missionary_profile_key){
    console.local("checking if receipt is enabled for missionary profile "+missionary_profile_key);
    const profile = await utils.getDB().getDisplayProfileByKey(missionary_profile_key);

    if(!profile) return true; //default to sending receipt if something isn't right

    const organization_key = profile.data.organization_key;
    const org = await utils.getDB().getOrganization(organization_key);

    if(!org) return true; //default to sending receipt if something isn't right

    //default to true if not set
    return org.donation_settings== null 
           || org.donation_settings.send_receipt== null 
           || org.donation_settings.send_receipt === true;
}
async function recordDonation(amount,donation_type,stripe_id,missionary_profile_key){

    try{
        const confirmed = true;

        const ptx = (await utils.getDB().insertPossibleTransaction(
                        missionary_profile_key,amount,donation_type,stripe_id,confirmed));

        console.local("possible tx recorded: ",ptx);

        return ptx.possible_transaction_key;
    }catch(error){
        console.error("Failed to record TX for stripe session "+stripe_id+" to DB: ",error); 
        throw error;
    }
}
async function getStripePortalLink(customerId,accountHeader){
    const portal = await getStripe().billingPortal.sessions.create(
                            {customer: customerId,
                             expand:["configuration"]},accountHeader);

    console.debug("portal: ",portal);
    try{
        return portal.configuration.login_page.url;
    }catch(error){
        console.error("failed to get portal login url: ",error);
        return "/";
    }
        
}

async function getOrCreateProduct(worker_name, missionary_profile_key,accountHeader){
    try{
        const domain = "https://"+process.env.DOMAIN;
        var product;
        const searchResults = await getStripe().products.search({
            query: `active:'true' AND metadata['missionary_profile_key']:'${missionary_profile_key}'`,
        },accountHeader);
        console.debug("product search resuls: ",searchResults);
        if(searchResults.data.length > 0){
            console.debug("found existing product");
            return searchResults.data[0]; //just grab first one
        }else{ //create a new product
            console.debug("creating a new product");

            var profile = (await utils.getDB().getDisplayProfileByKey(missionary_profile_key));
            var images = [];
            if(profile.data.picture_url != null && profile.data.picture_url !== "")
                images.push(`${process.env.BUCKET_BASE_URL}/${process.env.UPLOAD_BUCKET}/${profile.data.picture_url}`);

            console.debug("got picture_url: ",images);
            return  await getStripe().products.create({
                name: `Ministry of ${worker_name}`,
                metadata:{
                    missionary_profile_key: missionary_profile_key,
                    worker_name: worker_name,
                    organization_key: profile.data.organization_key,
                },
                images:images,
                //[ "https://ergatasstorage.blob.core.windows.net/dev-public-content/3da6d672-4cce-4ac7-9f9a-141ed25cfe1b/headshot3.jpg", ],
                url:`https://${domain}/profile-detail/${missionary_profile_key}`,
            },accountHeader);
        }
    }catch(error){
        console.error("failed to get or create stripe product: ",error);
        throw error;
    }
}

export async function checkoutSessionStatus(checkoutSessionId){
    const session = await getStripe().checkout.sessions.retrieve(checkoutSessionId);
    console.log("session status: ",session && session.status);
    return { status: session.status};
}
