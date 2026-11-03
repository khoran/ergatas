// Stripe checkout.session shape helpers. A completed session may carry the payer
// email in any of three places, and subscription sessions nest metadata under
// subscription_details. Guarded against a missing customer_details object.
export function emailFromSession(s){
    return (s && (s.email || s.customer_email || (s.customer_details && s.customer_details.email))) || null;
}
// Invoices carry the subscription's metadata under subscription_details (API versions before
// 2025-03-31) or parent.subscription_details (later versions), and each subscription line item
// has a copy too. Prefer whichever candidate actually identifies the profile.
export function metadataFromSession(s){
    if(!s) return undefined;
    const candidates = [
        s.subscription_details && s.subscription_details.metadata,
        s.parent && s.parent.subscription_details && s.parent.subscription_details.metadata,
        s.metadata,
        s.lines && s.lines.data && s.lines.data[0] && s.lines.data[0].metadata,
    ];
    const identifying = candidates.find(m => m && m.missionary_profile_key);
    if(identifying) return identifying;
    if(s.subscription_details) return s.subscription_details.metadata;
    return s.metadata;
}
// The subscription id of a checkout session or invoice, under either API shape.
export function subscriptionIdFromSession(s){
    if(!s) return null;
    const sub = s.subscription ||
        (s.parent && s.parent.subscription_details && s.parent.subscription_details.subscription);
    if(!sub) return null;
    return typeof sub === "string" ? sub : sub.id;
}
