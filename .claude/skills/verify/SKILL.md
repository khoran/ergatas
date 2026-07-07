---
name: verify
description: Build, run, and drive the ergatas2 app locally to verify changes end-to-end.
---

# Verifying changes in ergatas2

## Build + run

```bash
npx webpack --config webpack.config.cjs   # dev bundle -> dist/ (stable names, ~1-2 min)
node server.js > /tmp/ergatas-server.log 2>&1 &   # listens on :8080, "listening on 8080" in log
```

Full production build is `npm run build` (subset-fa → webpack prod → purge-bootstrap → compress) — only needed when testing the purge/subset steps themselves.

## Reaching the app

`http://localhost:8080/` 302-redirects to `https://home.ergatas.org/...`, which /etc/hosts maps to 127.0.0.1 (a local proxy terminates TLS on 443 and forwards to 8080). Drive **https://home.ergatas.org** with `ignoreHTTPSErrors: true`.

## Driving with Playwright

Playwright is a repo dependency — require it directly in a throwaway script:

```js
const { chromium } = require('/home/khoran/development/ergatas2/node_modules/playwright');
const ctx = await browser.newContext({ viewport: {width: 390, height: 844},
  ignoreHTTPSErrors: true, isMobile: true, hasTouch: true });
```

Gotchas:
- SPA navigation via vanilla-router; after clicking a nav link wait ~800ms then check `page.url()`.
- Mobile breakpoint is `lg` (992px): below it the hamburger/drawer are active, at ≥992px the inline navbar shows.
- Quick SCSS syntax check without webpack: `npx sass --no-source-map lib/scss/styles.scss /tmp/out.css` (deprecation warnings about @import are pre-existing noise).
- Kill the server with `kill <pid>` (pkill by name can hit a permission error).
- `test/e2e/visual-audit.cjs` screenshots all pages at 3 viewports if a broad visual regression pass is wanted.
