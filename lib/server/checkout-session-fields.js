// Stripe checkout.session shape helpers. A completed session may carry the payer
// email in any of three places, and subscription sessions nest metadata under
// subscription_details. Guarded against a missing customer_details object.
export function emailFromSession(s){
    return (s && (s.email || s.customer_email || (s.customer_details && s.customer_details.email))) || null;
}
export function metadataFromSession(s){
    if(s && s.subscription_details) return s.subscription_details.metadata;
    return s ? s.metadata : undefined;
}
