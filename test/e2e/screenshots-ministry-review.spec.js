import 'dotenv/config';
import { test, expect } from '@playwright/test';

// One-off capture spec for the Ministry Review docs page screenshots.
// Logs in as a real org-admin account (SHOT_EMAIL/SHOT_PASSWORD) against the
// local Docker stack and saves PNGs into public/img/docs/ with the exact
// filenames the docs page (lib/page-templates/docs/ministry-review.html)
// references. Modeled on test/e2e/profile-lifecycle.spec.js.
//
// Run:
//   source .test_user_creds
//   NODE_OPTIONS=--no-deprecation npx playwright test \
//     test/e2e/screenshots-ministry-review.spec.js --workers=1
//
// Subjects: org 4 "Global Recordings Network USA" (Ministry Review enabled),
// admin = user_key 53 (owns profile 81 "kevin-horan").

const BASE      = process.env.TEST_BASE_URL;    // https://home.ergatas.org
const AUTH_BASE = process.env.AUTH_URL_BASE;    // https://auth-home.ergatas.org/oauth2
const CLIENT_ID = process.env.AUTH_CLIENT_ID;
const REDIRECT  = process.env.REDIRECT_URL;
const EMAIL     = process.env.SHOT_EMAIL;
const PASSWORD  = process.env.SHOT_PASSWORD;

const PROFILE_KEY = 81;
const OUT = 'public/img/docs';

const loginURL =
  `${AUTH_BASE}/authorize?client_id=${CLIENT_ID}` +
  `&response_type=code&scope=offline_access&redirect_uri=${encodeURIComponent(REDIRECT)}&state=dashboard`;

// Clip a screenshot to the region spanning from `top` to the bottom of `bottom`.
// Falls back to a full-page shot if either box can't be measured.
async function regionShot(page, top, bottom, path, { pad = 16, width = 940 } = {}) {
  await top.scrollIntoViewIfNeeded();
  await top.evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -100));
  await page.waitForTimeout(350);
  const tb = await top.boundingBox();
  const bb = await bottom.boundingBox();
  if (!tb || !bb) {
    await page.screenshot({ path, fullPage: true });
    return;
  }
  const x = Math.max(0, Math.min(tb.x, bb.x) - pad);
  const y = Math.max(0, tb.y - pad);
  const height = (bb.y + bb.height + pad) - y;
  const vw = page.viewportSize().width;
  await page.screenshot({ path, clip: { x, y, width: Math.min(width, vw - x), height } });
}

test.describe('Ministry Review screenshots', () => {
  test.use({ serviceWorkers: 'block', ignoreHTTPSErrors: true, viewport: { width: 1280, height: 1500 } });
  test.skip(!EMAIL || !PASSWORD, 'set SHOT_EMAIL / SHOT_PASSWORD (e.g. `source .test_user_creds`)');

  test('capture manager and worker views', async ({ page }) => {
    test.setTimeout(240000);

    // Normalize the empty-body getManagedProfiles response (see memory note).
    await page.route('**/api/getManagedProfiles', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      await route.fulfill({ response, contentType: 'application/json', body: body && body.trim() ? body : '[]' });
    });

    // ── Log in ────────────────────────────────────────────────────────────────
    await test.step('log in', async () => {
      await page.goto(loginURL, { waitUntil: 'domcontentloaded' });
      await page.locator('input[name="loginId"]').fill(EMAIL);
      await page.locator('input[name="password"]').fill(PASSWORD);
      // The themed submit button has no type="submit" attribute; submit via Enter.
      await page.locator('input[name="password"]').press('Enter');
      await expect(page).toHaveURL(
        new RegExp(BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 60000 });
    });

    // ── Manager side: Manage Organization ──────────────────────────────────────
    await test.step('open Manage Organization', async () => {
      await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /manage organization/i }).click();
      await expect(
        page.getByRole('heading', { name: /Ministry Review Documents Submitted/i }),
      ).toBeVisible({ timeout: 30000 });
    });

    await test.step('compliance table', async () => {
      // Make sure the seeded rows have loaded.
      await expect(page.locator('table.table tbody tr').first()).toBeVisible({ timeout: 30000 });
      const heading = page.getByRole('heading', { name: /Ministry Review Documents Submitted/i });
      const refresh = page.getByRole('button', { name: /refresh/i });
      await regionShot(page, heading, refresh, `${OUT}/manage-org-compliance.png`);
    });

    await test.step('enable settings (edit form)', async () => {
      await page.locator('[title="Edit"]').first().click();
      await expect(page.locator('#wd-enabled')).toBeVisible({ timeout: 15000 });
      // The frequency/deadline fields show because org 4 already has it enabled.
      const heading = page.locator('h5:has-text("Ministry Review Documents")').last();
      const deadline = page.locator('#wd-deadline-day');
      await regionShot(page, heading, deadline, `${OUT}/manage-org-enable.png`);
    });

    // ── Worker side: Files tab ─────────────────────────────────────────────────
    await test.step('worker Files tab — Add Document form', async () => {
      await page.goto(`${BASE}/profile/edit/${PROFILE_KEY}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: /^Files$/ }).click();
      const heading = page.locator('h5:has-text("Ministry Review Documents")');
      await expect(heading.first()).toBeVisible({ timeout: 30000 });
      // Open the Add Document form.
      await page.getByRole('button', { name: /add document/i }).click();
      const uploadBtn = page.getByRole('button', { name: /choose file/i });
      await expect(uploadBtn).toBeVisible({ timeout: 10000 });
      await regionShot(page, heading.first(), uploadBtn, `${OUT}/worker-files-tab.png`);
    });
  });
});
