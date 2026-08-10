// Debug the Stripe embedded checkout layout on staging (no recording, no payment).
const { chromium } = require('/home/khoran/development/ergatas2/node_modules/playwright');
const STAGING = 'https://staging.ergatas.org';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(STAGING + '/worker/josh-manda-pidgeon', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.locator('button.btn-ergatas-donate').first().click();
  await page.waitForSelector('.modal.show', { timeout: 10000 });
  await page.waitForTimeout(1000);
  const modal = page.locator('.modal.show');
  console.log('tabs:', await modal.locator('.nav-link, [role=tab]').allInnerTexts());
  await modal.locator('label:has(input[name="donation-level"][value="25"])').click();
  await modal.locator('input[aria-label="name"]').fill('Sarah Example');
  await modal.locator('#email-address').fill('sarah.demo.donor.2026@gmail.com');
  // report all visible required fields before submit
  const reqs = await modal.locator('input:visible').evaluateAll(els =>
    els.map(e => ({ label: e.getAttribute('aria-label'), id: e.id, name: e.name, type: e.type, required: e.required })));
  console.log('visible inputs:', JSON.stringify(reqs, null, 1));
  await modal.locator('form.donation-form button[type="submit"]').click();
  await page.waitForSelector('#ergatas iframe', { timeout: 30000 });
  await page.waitForTimeout(6000);
  const frame = page.frameLocator('#ergatas iframe');
  const noLink = frame.locator('text=Pay without Link');
  if (await noLink.count()) { await noLink.first().click(); await page.waitForTimeout(4000); }
  await page.screenshot({ path: '/tmp/ergatas-screencast/donation-debug.png' });
  const inputs = await frame.locator('input').evaluateAll(els =>
    els.map(e => ({ name: e.name, id: e.id, type: e.type, ph: e.placeholder, visible: !!e.offsetParent }))).catch(e => 'ERR ' + e.message);
  console.log('iframe inputs:', JSON.stringify(inputs, null, 1));
  const text = await frame.locator('body').innerText().catch(e => 'ERR ' + e.message);
  console.log('iframe text (first 600):', String(text).slice(0, 600));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
