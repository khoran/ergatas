// Lazily load Stripe.js v3 on demand instead of on every page.
//
// Previously index.html loaded https://js.stripe.com/v3/ (~1 MB) globally with a
// `defer` tag, so every page — home, worker, search — paid for it even though
// Stripe is only needed when a visitor actually starts a checkout. This loader
// injects the script the first time it's needed and caches the promise, so
// subsequent calls resolve immediately.
//
// Returns a promise resolving to the global `Stripe` constructor.
let stripePromise = null;

export function loadStripe() {
  if (stripePromise) return stripePromise;

  stripePromise = new Promise((resolve, reject) => {
    if (window.Stripe) { resolve(window.Stripe); return; }

    const finish = () => window.Stripe
      ? resolve(window.Stripe)
      : reject(new Error('Stripe.js loaded but window.Stripe is undefined'));
    const fail = () => { stripePromise = null; reject(new Error('Failed to load Stripe.js')); };

    // Reuse an in-flight tag if one already exists (e.g. another component).
    const existing = document.querySelector('script[src^="https://js.stripe.com/v3"]');
    if (existing) {
      existing.addEventListener('load', finish);
      existing.addEventListener('error', fail);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = finish;
    script.onerror = fail;
    document.head.appendChild(script);
  });

  return stripePromise;
}
