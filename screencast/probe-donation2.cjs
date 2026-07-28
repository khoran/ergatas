// Deeper probe of the Stripe embedded checkout structure (no payment made).
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
  const modal = page.locator('.modal.show');
  await modal.locator('label:has(input[name="donation-level"][value="25"])').click();
  await modal.locator('input[aria-label="name"]').fill('Sarah Example');
  await modal.locator('#email-address').fill('sarah.demo.donor.2026@gmail.com');
  await modal.locator('form.donation-form button[type="submit"]').click();
  await page.waitForSelector('#ergatas iframe', { timeout: 30000 });
  await page.waitForTimeout(8000);

  for (const f of page.frames()) {
    const inputs = await f.locator('input').evaluateAll(els => els.map(e => ({
      name: e.name, id: e.id, type: e.type, ph: e.placeholder,
      aria: e.getAttribute('aria-label'), auto: e.getAttribute('autocomplete'),
      visible: !!(e.offsetWidth || e.offsetHeight),
    }))).catch(() => null);
    if (inputs && inputs.length)
      console.log('FRAME', f.url().slice(0, 90), JSON.stringify(inputs));
  }
  // select the Card payment method, then re-enumerate
  const cf = page.frameLocator('#ergatas iframe');
  await cf.locator('#payment-method-accordion-item-title-card').check({ force: true });
  await page.waitForTimeout(5000);
  console.log('--- after selecting Card ---');
  for (const f of page.frames()) {
    const inputs = await f.locator('input').evaluateAll(els => els.map(e => ({
      name: e.name, id: e.id, type: e.type, ph: e.placeholder,
      aria: e.getAttribute('aria-label'),
      visible: !!(e.offsetWidth || e.offsetHeight),
    }))).catch(() => null);
    if (inputs && inputs.length && !f.url().includes('staging.ergatas.org') && !f.url().includes('recaptcha'))
      console.log('FRAME', f.url().slice(0, 100), JSON.stringify(inputs.filter(i => i.visible)));
  }
  console.log('frame count:', page.frames().length);
  await page.screenshot({ path: '/tmp/ergatas-screencast/donation-debug3.png' });
  await page.screenshot({ path: '/tmp/ergatas-screencast/donation-debug2.png', fullPage: false });
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
