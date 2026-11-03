// Decides which customer.subscription.* webhook events are worth telling an admin about,
// and renders the notice text. No Stripe calls live here so the rules can be unit tested
// against raw event fixtures.

export const SUBSCRIPTION_EVENT_TYPES = [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
];

// customer.subscription.updated also fires for routine billing bookkeeping (latest_invoice,
// current_period_start/end, ...), which would bury the changes anyone actually cares about.
// An update is only worth a notice when one of these fields is in previous_attributes.
export const NOTABLE_UPDATE_FIELDS = [
    "status",
    "items",
    "plan",
    "quantity",
    "currency",
    "cancel_at_period_end",
    "cancel_at",
    "canceled_at",
    "ended_at",
    "pause_collection",
    "trial_end",
    "collection_method",
    "default_payment_method",
    "billing_cycle_anchor",
    "discounts",
];

const SUBJECTS = {
    "customer.subscription.created": "New recurring donation",
    "customer.subscription.updated": "Recurring donation changed",
    "customer.subscription.deleted": "Recurring donation canceled",
    "customer.subscription.paused": "Recurring donation paused",
    "customer.subscription.resumed": "Recurring donation resumed",
};

const TIMESTAMP_FIELDS = ["cancel_at","canceled_at","ended_at","trial_end","billing_cycle_anchor"];

export function isSubscriptionEvent(event){
    return !!event && SUBSCRIPTION_EVENT_TYPES.includes(event.type);
}

// created/deleted/paused/resumed always matter; updated only when a notable field moved.
export function isNotableSubscriptionChange(event){
    if(!isSubscriptionEvent(event)) return false;
    if(event.type !== "customer.subscription.updated") return true;

    const previous = (event.data && event.data.previous_attributes) || null;
    if(previous == null) return false;
    return NOTABLE_UPDATE_FIELDS.some( field => field in previous);
}

// A subscription's money lives on its first item's price (older objects carry it on `plan`).
export function subscriptionAmount(subscription){
    if(subscription == null) return null;
    const item = subscription.items && subscription.items.data && subscription.items.data[0];
    const price = (item && (item.price || item.plan)) || subscription.plan;
    const unitAmount = price && (price.unit_amount != null ? price.unit_amount : price.amount);
    if(unitAmount == null) return null;

    const quantity = (item && item.quantity) || subscription.quantity || 1;
    const recurring = (price && price.recurring) || price;
    return {
        amount: (unitAmount * quantity) / 100.0,
        currency: (price && price.currency) || subscription.currency || "usd",
        interval: (recurring && recurring.interval) || null,
    };
}

function formatMoney(amount,currency){
    try{
        return new Intl.NumberFormat('en-US',{style:'currency',currency:(currency||"usd").toUpperCase()}).format(amount);
    }catch(error){ //unknown currency code
        return `${amount} ${currency}`;
    }
}
function formatAmount(subscription){
    const money = subscriptionAmount(subscription);
    if(money == null) return "unknown";
    return formatMoney(money.amount,money.currency) + (money.interval ? "/"+money.interval : "");
}
function formatValue(field,value){
    if(value === undefined) return "unset";
    if(value === null) return "none";
    if(TIMESTAMP_FIELDS.includes(field)) return (new Date(value*1000)).toLocaleString();
    if(field === "items" || field === "plan") return formatAmount({[field]: value});
    if(typeof value === "object") return JSON.stringify(value);
    return String(value);
}

// One "field: old -> new" line per notable field that moved. Empty for non-update events.
export function changedFields(event){
    const previous = (event && event.data && event.data.previous_attributes) || {};
    const subscription = (event && event.data && event.data.object) || {};
    return NOTABLE_UPDATE_FIELDS
        .filter( field => field in previous)
        .map( field => `${field}: ${formatValue(field,previous[field])} -> ${formatValue(field,subscription[field])}`);
}

/**
 * Builds the admin notice for a subscription event.
 * `extra` carries what only a Stripe/DB lookup can supply: {donorEmail, donorName, profileUrl}.
 */
export function describeSubscriptionChange(event,extra = {}){
    const subscription = (event && event.data && event.data.object) || {};
    const metadata = subscription.metadata || {};
    const workerName = metadata.worker_name || "unknown worker";
    const subject = `${SUBJECTS[event.type] || "Subscription change"} - ${workerName}`;

    const lines = [
        `${SUBJECTS[event.type] || event.type} on Ergatas.`,
        ``,
        `Worker:          ${workerName}`,
        `Profile key:     ${metadata.missionary_profile_key || "unknown"}`,
    ];
    if(extra.profileUrl) lines.push(`Profile:         ${extra.profileUrl}`);
    lines.push(
        `Donor:           ${extra.donorName || "unknown"} ${extra.donorEmail ? "<"+extra.donorEmail+">" : ""}`.trimEnd(),
        `Amount:          ${formatAmount(subscription)}`,
        `Status:          ${subscription.status || "unknown"}`,
    );
    if(subscription.cancel_at_period_end)
        lines.push(`Cancels at period end: yes`);
    if(subscription.cancellation_details && subscription.cancellation_details.reason)
        lines.push(`Cancellation reason: ${subscription.cancellation_details.reason}`+
                   (subscription.cancellation_details.comment ? ` (${subscription.cancellation_details.comment})` : ""));

    const changes = changedFields(event);
    if(changes.length > 0){
        lines.push(``,`What changed:`);
        changes.forEach( line => lines.push(`  ${line}`));
    }

    lines.push(
        ``,
        `Subscription:    ${subscription.id || "unknown"}`,
        `Customer:        ${subscription.customer || "unknown"}`,
        `Stripe account:  ${event.account || "platform"}`,
        `Event:           ${event.type} (${event.id || "no id"})`,
    );

    return {subject, text: lines.join("\n")};
}
