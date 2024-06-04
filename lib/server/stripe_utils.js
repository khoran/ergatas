
import Stripe from 'stripe';
import fs from 'fs';
import cheerio from "cheerio";
import { AppError } from './app-error.js';
import * as utils from './utils.js';

var stripe;

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});



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
  
    console.local("createing stripe session for wokrer ",missionary_profile_key);
    try{
        const customer = await getStripeCustomer(donor_name,email,address,phone);
        const product = await getOrCreateProduct(worker_name,missionary_profile_key);

        var  sessionData = {
            line_items: [
            {
                price_data:{
                    currency: "usd",
                    product: product.id,
                    unit_amount:amount,
                },
                quantity: 1
            },
            ],
            customer: customer.id,
            success_url: return_url+"?donationResult=success",
            cancel_url: return_url+"?donationResult=cancel",
            metadata:{
                missionary_profile_key:missionary_profile_key,
                worker_name: worker_name,
                donation_type: donation_type,
            }
        }

        if(donation_type=="one-time"){
            console.local("one time donation")
            sessionData.mode = "payment";
            sessionData.submit_type="donate";
        }else if(donation_type==="recurring"){
            console.local("recurring donation")
            sessionData.mode = "subscription";
            for(var i in sessionData.line_items){
                var lineItem = sessionData.line_items[i];
                console.debug("line item: ",lineItem);
                lineItem.price_data.recurring={
                    interval: "month",
                };
            }
        }
        console.debug("session data: ",sessionData);

        const session = await getStripe().checkout.sessions.create(sessionData);

        //console.local("session created, url: "+session.url);
        //console.local("session : ",session);
        return session.url;

    }catch(error){
        console.local("Stripe Error: ",error);
        return return_url+"?donationResult=failed";
    }


}
export async function handleStripeEvent(body,sig){
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET_KEY;
    let event;

    try {
        event = Stripe.webhooks.constructEvent(body, sig, endpointSecret);
    } catch (err) {
        console.error("Stripe event error: ",err.message);
        throw new AppError(`Webhook Error: ${err.message}`);
    }

    console.local("handling a stripe event "+event.type);

    //console.log("got stripe event ",event);

    switch (event.type) {
        case 'checkout.session.completed': //maybe where we send the receipt. check that payment_status = paid
        case 'checkout.session.async_payment_succeeded':
            //console.log("got stripe completion event ",event);
            if(event.data.object.payment_status==="paid"){
                if(event.data.object.mode==="payment")
                    await sendReceipt(event.data.object);
                else if(event.data.object.mode==="subscription")
                    await sendSubscriptionNotice(event.data.object);
            }else{
                console.log("checkout.session.completed, but not paid");
                await sendDonationAck(event.data.object);
            }
            break;
        case 'checkout.session.async_payment_failed':
            console.info("async payment failed: ",event.data.object);
            await sendFailureNotice(event.data.object);
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
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





async function getStripeCustomer(donor_name,email, address,phone){
    var results = await getStripe().customers.list({
        email:email,
        limit: 1,
    });
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
        const customer = await getStripe().customers.create(options);
        console.log("new customer: ",customer);
        return customer;
    }
    //console.local("no stripe customer found with email "+email);
    //return null;
}

function buildReceipt(data){
    /*
        fields:
        - title_data
        - receipt_number
        - preheader_data
            -eg: Receipt from Ergatas [#1184-0979] Amount paid $10.00 Date paid Aug 30, 2022, 12:43:12 PM
        - amount_paid
        - date_paid
             -eg Aug 30, 2022, 12:43:12 PM
        - payment_method - look on payment_intent object, charge object, payment_method_details.type
        - item_description - eg: Ministry of Ted Smith
    **/

    console.local("reciept data: ",data);

    const emailHtml= fs.readFileSync(process.cwd()+"/lib/snippet-templates/receipt.html","utf8");
    const $ = cheerio.load(emailHtml);


    $(".title_data").html(data.title);
    $(".receipt_number").html(data.receipt_number);
    $(".preheader_data").html(data.preview);
    $(".amount_paid").html(data.amount_paid);
    $(".date_paid").html(data.date_paid);
    $(".payment_method").html(data.payment_method);
    $(".item_description").html(data.item_description);
    $(".receipt_url").attr('href',data.receipt_url);

    const textVersion = `Receipt from Ergatas [#${data.receipt_number}]. \n\n`+
                            `Thank you for your generous donation!\n\n`+
                            `Amount paid: ${data.amount_paid}\nDate paid: ${data.date_paid}.\n`+
                            `Payment method: ${data.payment_method}\n`+
                            `Item: ${data.item_description}\n\n`+
                            `No goods or services were provided to you by Ergatas in return for your contribution. Ergatas is a 501c(3) tax-exempt
organization. Contributions to Ergatas may be tax deductible. Please consult your tax advisor to determine deductibility of this
contribution. This letter is your receipt for income tax purposes.\n\n`+
                            `View this receipt in your browser at \n${data.receipt_url}`;


    return {html: $.html(), text:textVersion};
}
function buildSubscriptionNotice(data){
    console.local("subscription data: ",data);

    const emailHtml= fs.readFileSync(process.cwd()+"/lib/snippet-templates/subscription_notice.html","utf8");
    const $ = cheerio.load(emailHtml);


    $(".title_data").html(data.title);
    $(".receipt_number").html(data.receipt_number);
    $(".preheader_data").html(data.preview);
    $(".amount_paid").html(data.amount_paid);
    $(".date_paid").html(data.date_paid);
    $(".payment_method").html(data.payment_method);
    $(".item_description").html(data.item_description);
    $(".portal_url").attr('href',data.portal_url);

    const textVersion = `Support Commitment from Ergatas [#${data.receipt_number}]. \n\n`+
                            `Thank you for your generous donation!\n\n`+
                            `Amount committed monthly: ${data.amount_paid}\nDate started: ${data.date_paid}.\n`+
                            `Payment method: ${data.payment_method}\n`+
                            `Item: ${data.item_description}\n\n`+
                            `Manage your commitment online. From the link below you can pause or cancel your montly commitment anytime. \n`+
                            `You can also update your payment method and personal information, as well as view past payments.\n\n`+
                            `${data.portal}`;


    return {html: $.html(), text:textVersion};
}
function buildFailureNotice(data){
    console.local("failure notice data: ",data);

    const emailHtml= fs.readFileSync(process.cwd()+"/lib/snippet-templates/donation-failure-notice.html","utf8");
    const $ = cheerio.load(emailHtml);


    $(".title_data").html(data.title);
    $(".preheader_data").html(data.preview);
    $(".amount_paid").html(data.amount_paid);
    $(".date_paid").html(data.date_paid);
    $(".payment_method").html(data.payment_method);
    $(".item_description").html(data.item_description);
    $(".message").html(data.message);

    var textVersion = `We were unable to process your Ergatas donation. \n\n`+
                            `Amount : ${data.amount_paid}\nDate : ${data.date_paid}.\n`+
                            `Payment method: ${data.payment_method}\n`+
                            `Item: ${data.item_description}\n\n`+
                            `${data.message}\n\n`+
                            `We'd love to help you resolve this, please contact us at information@ergatas.org. Thank you.`;
    if(data.portal_url != null){
        $(".subscription").html(`
            <br/>
            <a href='${data.portal_url}'>Manage your subscription here</a>
         `);
        textVersion = textVersion+"\nManage your subscription online here: \n"+data.portal_url;
    }




    return {html: $.html(), text:textVersion};
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
async function sendSubscriptionNotice(checkoutSession){

    try{

        console.local("sending stripe subscription notice. session: ",checkoutSession);
        const missionary_profile_key = checkoutSession.metadata.missionary_profile_key;
        const worker_name= checkoutSession.metadata.worker_name;
        var amount, id,created, receipt_url,portal_url,payment_method;

        const subscription = await stripe.subscriptions.retrieve(checkoutSession.subscription);
        console.debug("subscription: ",subscription);

        id = subscription.id;
        amount = subscription.plan.amount / 100.0;
        created = subscription.created;
        portal_url = await getStripePortalLink(checkoutSession.customer);

        const txNum = await recordDonation(amount, "recurring", id,missionary_profile_key);

        var data = {
            receipt_number: txNum,
            amount_paid: moneyFormatter.format(amount),
            date_paid:  (new Date(created*1000)).toLocaleDateString(),
            item_description: "Ministry of "+worker_name,
            portal_url: portal_url,
            title: `Your Ergatas Support Commitment`,
        };

        data.preview = `Support Commitment from Ergatas [#${data.receipt_number}]. Commitment ${data.amount_paid} Date ${data.date_paid}`;

        //console.local("data:",data);

        const receipt = buildSubscriptionNotice(data);

        await sendCustomerEmail(checkoutSession.email || checkoutSession.customer_details.email, data,receipt);

    }catch(error){
        console.error("failed to send stripe subscription notice for checkout session "+(checkoutSession && checkoutSession.id),error);
        throw error;
    }

}

async function sendDonationAck(checkoutSession){
    try{
        await sendCustomerEmail(checkoutSession.email || checkoutSession.customer_details.email,
                                { title: "Ergatas payment information received"},
                                { text: "\n\nThank you for your donation to an Ergatas worker! Your payment is being processed. "+
                                        "You will receive a receipt as soon processing is done. For bank transfers, this can take up to 4 business days.\n\n"+
                                        " - The Ergatas Team\n"
                                });
    }catch(error){
        console.error("failed to send stripe ack email for unpaid donation "+(checkoutSession && checkoutSession.id),error);
        throw error;
    }
}
async function sendReceipt(checkoutSession){

    try{
        console.local("sending stripe receipt. session: ",checkoutSession);
        const missionary_profile_key = checkoutSession.metadata.missionary_profile_key;
        const worker_name= checkoutSession.metadata.worker_name;
        const mailDomain= process.env.MAIL_DOMAIN;
        var amount, id,created, receipt_url,paymentMethod;


        const paymentIntent = await getStripe().paymentIntents.retrieve(checkoutSession.payment_intent);
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
            amount_paid: moneyFormatter.format(amount),
            date_paid:  (new Date(created*1000)).toLocaleDateString(),
            payment_method: paymentMethod,
            item_description: "Ministry of "+worker_name,
            receipt_url: receipt_url,
            title: `Your Ergatas receipt`,
        };

        data.preview = `Receipt from Ergatas [#${data.receipt_number}]. Amount paid ${data.amount_paid} Date paid ${data.date_paid}`;
        console.local("data:",data);
       
        const receipt = buildReceipt(data);

        await sendCustomerEmail(checkoutSession.email || checkoutSession.customer_details.email, data,receipt);

    }catch(error){
        console.error("failed to send stripe receipt for checkout session "+(checkoutSession && checkoutSession.id),error);
        throw error;
    }
}
async function sendFailureNotice(checkoutSession){

    try{
        console.local("sending stripe failure notice. session: ",checkoutSession);
        const missionary_profile_key = checkoutSession.metadata.missionary_profile_key;
        const worker_name= checkoutSession.metadata.worker_name;
        var amount, created, paymentMethod,message,portal_url;



        if(checkoutSession.payment_intent != null){
            const paymentIntent = await getStripe().paymentIntents.retrieve(checkoutSession.payment_intent);
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
            const subscription = await getStripe().subscriptions.retrieve(checkoutSession.subscription);
            console.debug("subscription: ",subscription);

            try{
                const invoice = await getStripe().invoices.retrieve(subscription.latest_invoice);
                console.debug("invoice: ",invoice);

                const charge = await getStripe().charges.retrieve(invoice.charge);
                console.debug("charge: ",charge);
                message = charge.failure_message;

                const paymentIntent = await getStripe().paymentIntents.retrieve(invoice.payment_intent);
                paymentMethod = getPaymentMethod(paymentIntent);
            }catch(error){
                console.error("failed to get invoice or charge for failed subscription payment",checkoutSession.subscription);
                message= "We were unable to process your payment.";
            }

            amount = subscription.plan.amount / 100.0;
            created = subscription.created;
            portal_url = await getStripePortalLink(checkoutSession.customer);
        }

        var data = {
            amount_paid: moneyFormatter.format(amount),
            date_paid:  (new Date(created*1000)).toLocaleDateString(),
            payment_method: paymentMethod,
            item_description: "Ministry of "+worker_name,
            title: `Payment Failed`,
            message: message,
            portal_url: portal_url,
        };


        data.preview = `Ergatas payment error. Amount ${data.amount_paid}, Date ${data.date_paid}`;
       
        const receipt = buildFailureNotice(data);

        await sendCustomerEmail(checkoutSession.email || checkoutSession.customer_details.email, data,receipt);

    }catch(error){
        console.error("failed to send stripe receipt for checkout session "+(checkoutSession && checkoutSession.id),error);
        throw error;
    }
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
async function getStripePortalLink(customerId){
    const portal = await getStripe().billingPortal.sessions.create(
                            {customer: customerId,
                             expand:["configuration"]});

    console.debug("portal: ",portal);
    try{
        return portal.configuration.login_page.url;
    }catch(error){
        console.error("failed to get portal login url: ",error);
        return "/";
    }
        
}

async function getOrCreateProduct(worker_name, missionary_profile_key){
    try{
        const domain = "https://"+process.env.DOMAIN;
        var product;
        const searchResults = await stripe.products.search({
            query: `active:'true' AND metadata['missionary_profile_key']:'${missionary_profile_key}'`,
        });
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
            return  await stripe.products.create({
                name: `Ministry of ${worker_name}`,
                metadata:{
                    missionary_profile_key: missionary_profile_key,
                    worker_name: worker_name,
                    organization_key: profile.data.organization_key,
                },
                images:images,
                //[ "https://ergatasstorage.blob.core.windows.net/dev-public-content/3da6d672-4cce-4ac7-9f9a-141ed25cfe1b/headshot3.jpg", ],
                url:`https://${domain}/profile-detail/${missionary_profile_key}`,
            });
        }
    }catch(error){
        console.error("failed to get or create stripe product: ",error);
        throw error;
    }
}
async function sendCustomerEmail(email,data,receipt){
    try{
        const mailDomain= process.env.MAIL_DOMAIN;
        const settings={
                    to: email,
                    bcc: utils.messagingAdminEmail,
                    from: "Ergatas <information@"+mailDomain+">",
                    subject: data.title,
                    preview_text: data.preview,
                    text: receipt.text,
                    html: receipt.html
                };

        //console.local("settings: ",settings);

        await utils.sendEmail(settings);
    }catch(error){
        console.error("failed to send email to customer: ",error);
        throw error;
    }

}
