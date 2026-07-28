// Headless probe of staging selectors before recording.
const { chromium } = require('/home/khoran/development/ergatas2/node_modules/playwright');
const BASE = 'https://staging.ergatas.org';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const report = {};

  await page.goto(BASE + '/search/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  report.searchUrl = page.url();
  for (const title of ['Grid view', 'Map view', 'Worker prayer requests', 'Areas of impact'])
    report['btn:' + title] = await page.locator(`button[title="${title}"]`).count();
  report.filtersBtn = await page.locator('.search-toolbar button:has-text("Filters")').count();
  report.resultCards = await page.locator('.search-results, [class*=search]').first().isVisible().catch(() => false);

  // open filters panel
  if (report.filtersBtn) {
    await page.locator('.search-toolbar button:has-text("Filters")').first().click();
    await page.waitForTimeout(1000);
    report.panelVisible = await page.locator('.cd-panel.js-cd-panel-main').isVisible();
    report.filterTitles = await page.locator('.cd-panel .filter a.title').allInnerTexts();
    report.viewWorkersBtn = await page.locator('.cd-panel button:has-text("View")').first().innerText().catch(() => null);
    // drill into causes
    const causes = page.locator('.cd-panel .filter a.title', { hasText: 'Causes' }).first();
    if (await causes.count()) {
      await causes.click();
      await page.waitForTimeout(1500);
      report.causeChips = (await page.locator('.cd-panel .tag-heat-chip').allInnerTexts()).slice(0, 12);
      report.backLink = await page.locator('.cd-panel a:has-text("Back"), .cd-panel .back').count();
      report.panelHtmlSnip = (await page.locator('.cd-panel').innerHTML()).slice(0, 600);
    }
  }

  // worker page
  await page.goto(BASE + '/worker/josh-manda-pidgeon', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  report.workerUrl = page.url();
  report.connectBtn = await page.locator('button:has-text("Connect")').count();
  report.iPrayedBtn = await page.locator('button:has-text("I Prayed")').count();
  report.donateBtn = await page.locator('button.btn-ergatas-donate').count();
  report.prayerPosts = await page.locator('text=Prayers and Updates').count();
  report.postPrayBtns = await page.locator('button:has(i.fa-praying-hands)').count();
  report.workerName = await page.locator('h1, h2').first().innerText().catch(() => null);

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
