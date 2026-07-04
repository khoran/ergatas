const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = process.env.TEST_BASE_URL;
const SLUG = process.env.TEST_USER_PROFILE_SLUG;
const loginURL = `${process.env.AUTH_URL_BASE}/authorize?client_id=${process.env.AUTH_CLIENT_ID}&response_type=code&scope=offline_access&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URL)}&state=search`;
const OUT = 'test-results/visual-audit/verify';
const JOBS = [
  ['desktop', {width:1440,height:900}, 1, false, ['/', '/get-started', '/guided-search', '/contact', '/sof', '/search'], false],
  ['tablet', {width:820,height:1180}, 1, true, ['/worker/'+SLUG, '/dashboard/donation-list', '/get-started'], true],
  ['mobile', {width:390,height:844}, 2, true, ['/', '/about', '/worker/'+SLUG, '/get-started', '/guided-search'], false],
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [name, viewport, dpr, isMobile, pages, needLogin] of JOBS) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor:dpr, isMobile, hasTouch:isMobile, ignoreHTTPSErrors:true, serviceWorkers:'block' });
    const page = await ctx.newPage();
    if (needLogin) {
      await page.goto(loginURL, { waitUntil: 'domcontentloaded' });
      try {
        await page.locator('input[name="loginId"]').waitFor({ timeout: 8000 });
        await page.fill('input[name="loginId"]', process.env.TEST_USER_NAME);
        await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD);
        await page.locator('input[name="password"]').press('Enter');
      } catch(e) {}
      await page.waitForURL(u => u.toString().startsWith(BASE), { timeout: 30000 });
    }
    for (const p of pages) {
      const slug = p === '/' ? 'home' : p.replace(/\//g,'_').replace(/^_/,'');
      await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
      await page.locator('#logo').waitFor({ timeout: 20000 }).catch(()=>{});
      await page.waitForLoadState('networkidle', {timeout:15000}).catch(()=>{});
      await page.waitForTimeout(2500);
      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const footer = document.querySelector('footer');
        return { hOverflow: doc.scrollWidth > doc.clientWidth + 1, scrollW: doc.scrollWidth, clientW: doc.clientWidth,
          footerGap: footer ? Math.round(doc.scrollHeight - (footer.getBoundingClientRect().bottom + scrollY)) : null };
      });
      console.log(`${name} ${p}: hOverflow=${m.hOverflow} (${m.scrollW}/${m.clientW}) footerGap=${m.footerGap}`);
      await page.screenshot({ path: `${OUT}/${name}-${slug}.top.png` });
      await page.screenshot({ path: `${OUT}/${name}-${slug}.full.png`, fullPage: true });
    }
    await ctx.close();
  }
  await browser.close();
})();
