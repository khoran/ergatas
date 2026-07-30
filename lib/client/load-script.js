// Shared lazy <script> injector for on-demand third-party libraries. Caches the
// promise per src, short-circuits when the lib is already ready, reuses an
// in-flight tag if one exists, else appends a new one. `ready()` returns the
// resolved value (truthy) once the lib is usable, or falsy while not; after the
// load event we re-check it up to `maxTries` times (`intervalMs` apart) to cover
// libraries whose global appears slightly after 'load' (e.g. ShareThis).
const cache = new Map();

export function loadScript(src, { ready, srcPrefix = src, maxTries = 0, intervalMs = 100 } = {}) {
  if (cache.has(src)) return cache.get(src);

  const p = new Promise((resolve, reject) => {
    const done = () => {
      const v = ready ? ready() : true;
      if (v) { resolve(v === true ? undefined : v); return true; }
      return false;
    };
    if (done()) return;

    let tries = 0;
    const onLoad = () => {
      const poll = () => {
        if (done()) return;
        if (++tries > maxTries) { cache.delete(src); reject(new Error('script loaded but not ready: ' + src)); return; }
        setTimeout(poll, intervalMs);
      };
      poll();
    };
    const onError = () => { cache.delete(src); reject(new Error('failed to load ' + src)); };

    const existing = document.querySelector(`script[src^="${srcPrefix}"]`);
    if (existing) {
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', onError);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = onLoad;
    s.onerror = onError;
    document.head.appendChild(s);
  });

  cache.set(src, p);
  return p;
}
