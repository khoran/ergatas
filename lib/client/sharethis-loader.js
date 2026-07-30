// Lazily load ShareThis on demand instead of on every page.
//
// Previously index.html loaded platform-api.sharethis.com/js/sharethis.js (~210 KB
// + a follow-up out.js) globally on every page, but share buttons only appear on
// worker profile and profile-saved pages. This loader injects the script the first
// time a share-buttons binding is initialized and caches the promise (via the
// shared loadScript helper).
//
// Resolves to window.__sharethis__ (once its .load is ready).
import { loadScript } from './load-script';

const SRC = 'https://platform-api.sharethis.com/js/sharethis.js#property=66b27277595beb00197dfd07&product=inline-share-buttons&source=platform';

export function loadShareThis() {
  return loadScript(SRC, {
    // __sharethis__ may appear shortly after the script's load event, so poll
    // briefly (up to 50 × 100ms) for its .load to become ready.
    ready: () => (window.__sharethis__ && window.__sharethis__.load) ? window.__sharethis__ : null,
    srcPrefix: 'https://platform-api.sharethis.com/js/sharethis.js',
    maxTries: 50,
    intervalMs: 100,
  });
}
