// Visual audit crawler: logs in as TEST_USER_NAME, visits every page at
// desktop/tablet/mobile sizes, screenshots each, and records automated layout
// checks (horizontal overflow + offending elements, footer gap, console errors).
// Run: node -r dotenv/config test/e2e/visual-audit.cjs
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = (process.env.TEST_BASE_URL || 'https://home.ergatas.org').replace(/\/$/, '');
const AUTH_BASE = process.env.AUTH_URL_BASE;
const CLIENT_ID = process.env.AUTH_CLIENT_ID;
const REDIRECT = process.env.REDIRECT_URL;
const USER = process.env.TEST_USER_NAME;
const PASS = process.env.TEST_USER_PASSWORD;
const SLUG = process.env.TEST_USER_PROFILE_SLUG;

const OUT = path.join(__dirname, '..', '..', 'test-results', 'visual-audit');

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, dpr: 1, isMobile: false },
  { name: 'tablet',  viewport: { width: 820,  height: 1180 }, dpr: 1, isMobile: true },
  { name: 'mobile',  viewport: { width: 390,  height: 844 }, dpr: 2, isMobile: true },
];

// [slug-for-filename, url path, needsAuth]
const PAGES = [
  ['home', '/', false],
  ['search', '/search', false],
  ['worker-profile', '/worker/' + SLUG, false],
  ['about', '/about', false],
  ['contact', '/contact', false],
  ['get-started', '/get-started', false],
  ['donate', '/donate', false],
  ['learn', '/learn', false],
  ['daily-prayer', '/daily-prayer', false],
  ['guided-search', '/guided-search', false],
  ['privacy', '/privacy', false],
  ['terms-of-service', '/terms-of-service', false],
  ['sof', '/sof', false],
  ['learn-support-work', '/learn/how-does-missionary-support-work', false],
  ['learn-funding-models', '/learn/funding-models', false],
  ['learn-prayer-cards', '/learn/prayer-cards', false],
  ['docs-dashboard-overview', '/docs/dashboard-overview', false],
  ['profile-edit', '/profile', true],
  ['dashboard-home', '/dashboard/dashboard-home', true],
  ['dashboard-favorites', '/dashboard/favorites', true],
  ['dashboard-saved-searches', '/dashboard/saved-searches', true],
  ['dashboard-prayers', '/dashboard/prayers-and-updates', true],
  ['dashboard-donations', '/dashboard/donation-list', true],
];

const loginURL =
  `${AUTH_BASE}/authorize?client_id=${CLIENT_ID}` +
  `&response_type=code&scope=offline_access&redirect_uri=${encodeURIComponent(REDIRECT)}&state=search`;

async function login(page) {
  await page.goto(loginURL, { waitUntil: 'domcontentloaded' });
  // Already logged in? FusionAuth may bounce straight back.
  try {
    await page.locator('input[name="loginId"]').waitFor({ timeout: 8000 });
    await page.locator('input[name="loginId"]').fill(USER);
    await page.locator('input[name="password"]').fill(PASS);
    await page.locator('input[name="password"]').press('Enter');
  } catch (e) {
    // no login form appeared; assume SSO bounce
  }
  await page.waitForURL(new RegExp(BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 30000 });
  await page.locator('#logo').waitFor({ timeout: 30000 });
}

async function auditPage(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const vw = window.innerWidth;
    const result = {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      hOverflow: doc.scrollWidth > doc.clientWidth + 1,
      offenders: [],
      footerGap: null,
      footerShort: null,
      docHeight: doc.scrollHeight,
      viewportHeight: window.innerHeight,
    };
    // elements sticking out horizontally
    const all = document.body.querySelectorAll('*');
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if ((r.right > vw + 4 || r.left < -4) && r.width < doc.scrollWidth * 2) {
        // skip elements whose parent already reported (keep list short)
        result.offenders.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0, 80),
          left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
        });
        if (result.offenders.length >= 15) break;
      }
    }
    const footer = document.querySelector('footer');
    if (footer) {
      const fr = footer.getBoundingClientRect();
      const footerBottomDoc = fr.bottom + window.scrollY;
      result.footerGap = Math.round(doc.scrollHeight - footerBottomDoc);
      // page shorter than viewport and footer not at viewport bottom
      if (doc.scrollHeight <= window.innerHeight + 2) {
        result.footerShort = Math.round(window.innerHeight - fr.bottom);
      }
    }
    return result;
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = {};

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: vp.viewport,
      deviceScaleFactor: vp.dpr,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
      ignoreHTTPSErrors: true,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 300)));

    console.log(`\n=== ${vp.name} : logging in ===`);
    await login(page);

    const dir = path.join(OUT, vp.name);
    fs.mkdirSync(dir, { recursive: true });
    report[vp.name] = {};

    for (const [slug, urlPath, needsAuth] of PAGES) {
      consoleErrors.length = 0;
      try {
        await page.goto(BASE + urlPath, { waitUntil: 'domcontentloaded' });
        // wait for SPA shell
        await page.locator('#logo').waitFor({ timeout: 20000 }).catch(() => {});
        if (slug === 'search') {
          await page.locator('.pcard-name').first().waitFor({ timeout: 20000 }).catch(() => {});
        }
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2500); // settle animations / lazy images
        const audit = await auditPage(page);
        audit.url = page.url();
        audit.consoleErrors = consoleErrors.slice(0, 10);
        // top-of-page viewport shot
        await page.screenshot({ path: path.join(dir, slug + '.top.png') });
        // full page
        await page.screenshot({ path: path.join(dir, slug + '.full.png'), fullPage: true });
        report[vp.name][slug] = audit;
        console.log(`${vp.name}/${slug}: hOverflow=${audit.hOverflow} footerGap=${audit.footerGap} footerShort=${audit.footerShort} errors=${audit.consoleErrors.length}`);
      } catch (e) {
        report[vp.name][slug] = { error: String(e).slice(0, 300) };
        console.log(`${vp.name}/${slug}: ERROR ${String(e).slice(0, 200)}`);
      }
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('\nDone. Report at', path.join(OUT, 'report.json'));
})();
