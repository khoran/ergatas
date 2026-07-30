// Lazily load Stripe.js v3 on demand instead of on every page.
//
// Previously index.html loaded https://js.stripe.com/v3/ (~1 MB) globally with a
// `defer` tag, so every page — home, worker, search — paid for it even though
// Stripe is only needed when a visitor actually starts a checkout. This loader
// injects the script the first time it's needed and caches the promise (via the
// shared loadScript helper), so subsequent calls resolve immediately.
//
// Returns a promise resolving to the global `Stripe` constructor.
import { loadScript } from './load-script';

export function loadStripe() {
  return loadScript('https://js.stripe.com/v3/', {
    ready: () => window.Stripe,
    srcPrefix: 'https://js.stripe.com/v3',
    // maxTries 0: window.Stripe is set synchronously by the script, so reject
    // immediately if it's still absent after the load event (matches prior behavior).
  });
}
