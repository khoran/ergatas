// Lazily load ShareThis on demand instead of on every page.
//
// Previously index.html loaded platform-api.sharethis.com/js/sharethis.js (~210 KB
// + a follow-up out.js) globally on every page, but share buttons only appear on
// worker profile and profile-saved pages. This loader injects the script the first
// time a share-buttons binding is initialized and caches the promise.
//
// Resolves to window.__sharethis__ (once its .load is ready).
const SRC = 'https://platform-api.sharethis.com/js/sharethis.js#property=66b27277595beb00197dfd07&product=inline-share-buttons&source=platform';
let promise = null;

export function loadShareThis() {
  if (promise) return promise;

  promise = new Promise((resolve, reject) => {
    const ready = () => window.__sharethis__ && window.__sharethis__.load;
    if (ready()) { resolve(window.__sharethis__); return; }

    // __sharethis__ may appear shortly after the script's load event, so poll briefly.
    const waitReady = (tries = 0) => {
      if (ready()) return resolve(window.__sharethis__);
      if (tries > 50) { promise = null; return reject(new Error('ShareThis loaded but __sharethis__ not ready')); }
      setTimeout(() => waitReady(tries + 1), 100);
    };
    const fail = () => { promise = null; reject(new Error('Failed to load ShareThis')); };

    const existing = document.querySelector('script[src^="https://platform-api.sharethis.com/js/sharethis.js"]');
    if (existing) {
      existing.addEventListener('load', () => waitReady());
      existing.addEventListener('error', fail);
      return;
    }

    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.onload = () => waitReady();
    script.onerror = fail;
    document.head.appendChild(script);
  });

  return promise;
}
