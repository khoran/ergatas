// Records screencast segments of the Ergatas site with Playwright.
// Usage: node screencast/record-demo.cjs [search] [messaging] [prayer] [donation]
// (no args = all segments). Raw .webm clips land in /tmp/ergatas-screencast/.
//
// Search segment runs against the LIVE site (read-only; staging map view is broken).
// Messaging/prayer/donation run against STAGING (they mutate data).
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/khoran/development/ergatas2/node_modules/playwright');

const LIVE = 'https://ergatas.org';
const STAGING = 'https://staging.ergatas.org';
const WORKER = '/worker/josh-manda-pidgeon';
const OUT = '/tmp/ergatas-screencast';
const SIZE = { width: 1280, height: 720 };

// Injected on every page: an orange cursor dot that follows the mouse (Playwright's
// mouse is invisible) and a bottom caption bar driven via window.__caption(text).
const INIT_SCRIPT = `(() => {
  function ensure() {
    if (!document.body) return;
    if (!document.getElementById('pw-cursor')) {
      const c = document.createElement('div');
      c.id = 'pw-cursor';
      c.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;' +
        'border-radius:50%;background:rgba(255,120,0,.6);border:2px solid rgba(255,255,255,.95);' +
        'pointer-events:none;left:-60px;top:-60px;box-shadow:0 0 10px rgba(0,0,0,.45);' +
        'transition:transform .1s';
      document.body.appendChild(c);
    }
    if (!document.getElementById('pw-caption')) {
      const b = document.createElement('div');
      b.id = 'pw-caption';
      b.style.cssText = 'position:fixed;z-index:2147483646;left:50%;bottom:30px;' +
        'transform:translateX(-50%);max-width:82%;background:rgba(18,22,34,.88);color:#fff;' +
        'font:600 24px/1.35 system-ui,-apple-system,sans-serif;padding:12px 26px;' +
        'border-radius:12px;text-align:center;display:none;pointer-events:none';
      document.body.appendChild(b);
    }
  }
  document.addEventListener('mousemove', e => {
    ensure();
    const c = document.getElementById('pw-cursor');
    if (c) { c.style.left = (e.clientX - 11) + 'px'; c.style.top = (e.clientY - 11) + 'px'; }
  }, true);
  document.addEventListener('mousedown', () => {
    const c = document.getElementById('pw-cursor');
    if (c) c.style.transform = 'scale(0.6)';
  }, true);
  document.addEventListener('mouseup', () => {
    const c = document.getElementById('pw-cursor');
    if (c) c.style.transform = 'scale(1)';
  }, true);
  window.__caption = t => {
    ensure();
    const b = document.getElementById('pw-caption');
    if (!b) return;
    if (t) { b.textContent = t; b.style.display = 'block'; } else { b.style.display = 'none'; }
  };
  if (document.readyState !== 'loading') ensure();
  else document.addEventListener('DOMContentLoaded', ensure);
})();`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function caption(page, text) {
  await page.evaluate(t => window.__caption(t), text || '');
}

// Move the mouse smoothly to the element, then click — so the cursor dot travels visibly.
async function moveClick(page, locator, { pause = 400 } = {}) {
  await locator.first().scrollIntoViewIfNeeded();
  await sleep(300);
  const box = await locator.first().boundingBox();
  if (!box) throw new Error('no bounding box for locator');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
  await sleep(pause);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}

async function typeInto(page, locator, text) {
  await moveClick(page, locator, { pause: 200 });
  await locator.first().pressSequentially(text, { delay: 35 });
}

async function smoothScroll(page, totalPx, stepPx = 60, delay = 90) {
  const steps = Math.round(Math.abs(totalPx) / stepPx);
  const dir = totalPx > 0 ? stepPx : -stepPx;
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dir); await sleep(delay); }
}

async function openSegment(browser, name) {
  const ctx = await browser.newContext({
    viewport: SIZE,
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    recordVideo: { dir: path.join(OUT, name), size: SIZE },
  });
  await ctx.addInitScript(INIT_SCRIPT);
  const page = await ctx.newPage();
  return { ctx, page };
}

async function closeSegment(ctx, page, name) {
  await sleep(1000);
  const vid = page.video();
  await ctx.close();
  const raw = await vid.path();
  const dest = path.join(OUT, name + '.webm');
  fs.renameSync(raw, dest);
  fs.rmSync(path.join(OUT, name), { recursive: true, force: true });
  console.log(`[${name}] saved ${dest}`);
}

// ---------------- Segment 1: search (~30s) — LIVE site ----------------
// (read-only; live was updated 2026-07-18 to match staging's UI)
async function segSearch(browser) {
  const { ctx, page } = await openSegment(browser, 'search');
  await page.goto(LIVE + '/search/', { waitUntil: 'networkidle' });
  await sleep(2500);
  await page.mouse.move(640, 400, { steps: 10 });

  await caption(page, 'Search for missionaries across many agencies — all in one place');
  await smoothScroll(page, 350);
  await sleep(1200);
  await smoothScroll(page, -350);
  await sleep(600);

  await caption(page, 'Map view — see where workers are serving');
  await moveClick(page, page.locator('button[title="Map view"]'));
  await page.waitForSelector('#search-results-map', { timeout: 15000 });
  await sleep(3500); // let tiles load
  // pan the map
  const map = await page.locator('#search-results-map').boundingBox();
  if (map) {
    const cx = map.x + map.width / 2, cy = map.y + map.height / 2;
    await page.mouse.move(cx, cy, { steps: 20 });
    await page.mouse.down();
    await page.mouse.move(cx - 220, cy - 60, { steps: 35 });
    await page.mouse.up();
  }
  await sleep(2500);

  await caption(page, 'Search by areas of impact — where the ministry reaches');
  await moveClick(page, page.locator('button[title="Areas of impact"]'));
  await page.waitForSelector('.datamaps-subunit', { timeout: 15000 });
  await sleep(1500);
  // click a country on the d3 map (try a few ISO classes, else click map center-east)
  let clicked = false;
  for (const iso of ['IND', 'BRA', 'KEN']) {
    const c = page.locator(`.datamaps-subunit.${iso}`);
    if (await c.count()) { await moveClick(page, c); clicked = true; break; }
  }
  if (!clicked) {
    const mc = await page.locator('.impact-map-container').boundingBox();
    if (mc) {
      await page.mouse.move(mc.x + mc.width * 0.68, mc.y + mc.height * 0.45, { steps: 25 });
      await page.mouse.down(); await page.mouse.up();
    }
  }
  await sleep(2500);

  // Filters panel
  await caption(page, 'Filter by causes and passions…');
  await moveClick(page, page.locator('.search-toolbar button:has-text("Filters")'));
  await sleep(1200);
  await moveClick(page, page.locator('.cd-panel .filter a.title', { hasText: 'Causes / Passions' }));
  await sleep(1500);
  for (const chip of ['Bible Translation', 'Church Planting']) {
    const c = page.locator('.cd-panel .tag-heat-chip', { hasText: chip });
    if (await c.count()) { await moveClick(page, c); await sleep(800); }
  }
  const back = page.locator('.cd-panel__header a:has(i.fa-long-arrow-alt-left)');
  await moveClick(page, back);
  await sleep(800);

  await caption(page, '…by job skills and vocations…');
  await moveClick(page, page.locator('.cd-panel .filter a.title', { hasText: 'Vocations' }));
  await sleep(1500);
  const skill = page.locator('.cd-panel .tag-heat-chip', { hasText: 'Teaching' });
  await moveClick(page, (await skill.count()) ? skill : page.locator('.cd-panel .tag-heat-chip').first());
  await sleep(800);
  await moveClick(page, back);
  await sleep(800);

  await caption(page, '…by people groups…');
  await moveClick(page, page.locator('.cd-panel .filter a.title', { hasText: 'People Groups' }));
  await sleep(1500);
  const unreached = page.locator('.cd-panel button', { hasText: 'Unreached People Groups' });
  if (await unreached.count()) { await moveClick(page, unreached); await sleep(1200); }
  await moveClick(page, back);
  await sleep(800);

  await caption(page, '…and many more filters');
  const panel = await page.locator('.cd-panel__content').boundingBox();
  if (panel) await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2, { steps: 15 });
  await smoothScroll(page, 500, 50, 110);
  await sleep(1000);

  const view = page.locator('.cd-panel button:has-text("View")').last();
  await moveClick(page, view);
  await sleep(1200);
  // end on the filtered results grid, scrolled to the top
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await sleep(400);
  await moveClick(page, page.locator('button[title="Grid view"]'));
  await caption(page, '');
  await sleep(2500);
  await closeSegment(ctx, page, 'search');
}

// ---------------- Segment 2: messaging (~10s) — STAGING ----------------
async function segMessaging(browser) {
  const { ctx, page } = await openSegment(browser, 'messaging');
  await page.goto(STAGING + WORKER, { waitUntil: 'networkidle' });
  await sleep(2500);
  await page.mouse.move(640, 360, { steps: 10 });

  await caption(page, 'Connect with a worker directly');
  await moveClick(page, page.locator('button:has-text("Connect")').first());
  await page.waitForSelector('.modal.show form', { timeout: 10000 });
  await sleep(800);

  const modal = page.locator('.modal.show');
  await typeInto(page, modal.locator('input[required]').first(), 'Sarah');
  await typeInto(page, modal.locator('input[type="email"]'), 'sarah@example.com');
  await typeInto(page, modal.locator('textarea'), 'So encouraged by your ministry! Praying for you.');
  await sleep(500);
  await moveClick(page, modal.locator('button[type="submit"]:has-text("Send")'));
  await sleep(2500); // "Message away!" toast
  await caption(page, '');
  await sleep(800);
  await closeSegment(ctx, page, 'messaging');
}

// ---------------- Segment 3: prayer (~10s) — STAGING ----------------
async function segPrayer(browser) {
  const { ctx, page } = await openSegment(browser, 'prayer');
  await page.goto(STAGING + WORKER, { waitUntil: 'networkidle' });
  await sleep(2500);
  await page.mouse.move(640, 360, { steps: 10 });

  await caption(page, 'Let workers know you prayed for them');
  await moveClick(page, page.locator('button:has-text("I Prayed")').first());
  await sleep(2000); // flips to "Thanks!"

  await caption(page, 'Pray for specific requests and updates');
  const postBtn = page.locator('button:has(i.fa-praying-hands)').first();
  await postBtn.scrollIntoViewIfNeeded();
  await sleep(1200);
  await moveClick(page, postBtn);
  await sleep(2200);
  await caption(page, '');
  await sleep(800);
  await closeSegment(ctx, page, 'prayer');
}

// ---------------- Segment 4: donation (~10s) — STAGING ----------------
// Live Stripe keys: fill the checkout but NEVER click the final pay button.
async function segDonation(browser) {
  const { ctx, page } = await openSegment(browser, 'donation');
  await page.goto(STAGING + WORKER, { waitUntil: 'networkidle' });
  await sleep(2500);
  await page.mouse.move(640, 360, { steps: 10 });

  await caption(page, 'Give directly through Ergatas');
  await moveClick(page, page.locator('button.btn-ergatas-donate').first());
  await page.waitForSelector('.modal.show', { timeout: 10000 });
  await sleep(1000);

  const modal = page.locator('.modal.show');
  const level25 = modal.locator('label:has(input[name="donation-level"][value="25"])');
  await moveClick(page, level25);
  await sleep(700);
  await typeInto(page, modal.locator('input[aria-label="name"]'), 'Sarah Example');
  // fresh address — a Link-enrolled email makes Stripe show an OTP login instead of the card form
  await typeInto(page, modal.locator('#email-address'), 'sarah.demo.donor.2026@gmail.com');
  await sleep(500);
  await moveClick(page, modal.locator('form.donation-form button[type="submit"]'));

  await caption(page, 'Secure checkout powered by Stripe');
  await page.waitForSelector('#ergatas iframe', { timeout: 25000 });
  await sleep(3500); // let Stripe checkout render
  const stripe = page.frameLocator('#ergatas iframe');
  // select the "Card" payment method (row intercepts clicks, so check the radio directly)
  const cardRadio = stripe.locator('#payment-method-accordion-item-title-card');
  await cardRadio.waitFor({ timeout: 20000 });
  const rbox = await cardRadio.boundingBox();
  if (rbox) await page.mouse.move(rbox.x + 8, rbox.y + 8, { steps: 25 });
  await cardRadio.check({ force: true });
  await sleep(2500);

  // the card fields live in nested Stripe element iframes — find each across all frames
  const findInFrames = async (sel, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const f of page.frames()) {
        const loc = f.locator(sel);
        if (await loc.count().catch(() => 0)) return loc.first();
      }
      await sleep(400);
    }
    return null;
  };
  const fill = async (sel, text) => {
    const loc = await findInFrames(sel);
    if (!loc) { console.error(`  (field not found: ${sel})`); return; }
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.click();
    await loc.pressSequentially(text, { delay: 45 });
  };
  await fill('input[name="cardnumber"], input[placeholder="1234 1234 1234 1234"]', '4242424242424242');
  await fill('input[name="exp-date"], input[placeholder="MM / YY"]', '1230');
  await fill('input[name="cvc"], input[placeholder="CVC"]', '123');
  await fill('input[placeholder="Full name on card"]', 'Sarah Example');
  await fill('input[placeholder="Postal code"]', 'K1A 0A6');
  // STOP HERE — do not click the pay button (live mode).
  await sleep(2500);
  await caption(page, '');
  await sleep(500);
  await closeSegment(ctx, page, 'donation');
}

const SEGMENTS = { search: segSearch, messaging: segMessaging, prayer: segPrayer, donation: segDonation };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SEGMENTS);
  const browser = await chromium.launch();
  for (const name of wanted) {
    if (!SEGMENTS[name]) { console.error(`unknown segment: ${name}`); continue; }
    console.log(`[${name}] recording…`);
    try {
      await SEGMENTS[name](browser);
    } catch (e) {
      console.error(`[${name}] FAILED: ${e.message}`);
    }
  }
  await browser.close();
})();
