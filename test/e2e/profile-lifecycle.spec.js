import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { deleteUserByEmail, setEmailVerified, getUserByEmail } from './helpers/fusionauth.js';
import { pickRandomOrg } from './helpers/orgs.js';

// ── End-to-end worker lifecycle ──────────────────────────────────────────────
// Exercises the full happy path for a brand-new Kingdom Worker:
//   1. create a fresh FusionAuth user (deleting any leftover first)
//   2. log in to the app as that user
//   3. mark the email verified in FusionAuth
//   4. create a profile against a random organization
//   5. confirm a bad donation URL is rejected, a good one accepted
//   6. publish the profile and view the public worker page
//   7. delete the account through the app
//
// User creation goes through FusionAuth's hosted registration page because the
// app's shared API key cannot create users. Verification and cleanup use the
// FusionAuth admin API (see helpers/fusionauth.js).

const BASE        = process.env.TEST_BASE_URL;            // https://home.ergatas.org
const AUTH_BASE   = process.env.AUTH_URL_BASE;            // https://auth-home.ergatas.org/oauth2
const CLIENT_ID   = process.env.AUTH_CLIENT_ID;
const REDIRECT    = process.env.REDIRECT_URL;

const TEST_EMAIL    = 'testusr10@ergatas.org';
const TEST_PASSWORD = 'Ergatas-E2E-Test-9c4!';
const TEST_NAME     = 'Test Usr10';
const FIRST_NAME    = 'Testten';
const LAST_NAME     = 'Worker';
// Unique slug per run so reruns don't collide with a not-yet-deleted profile.
const PROFILE_SLUG  = 'testusr10-e2e-' + Date.now();

const loginURL =
  `${AUTH_BASE}/authorize?client_id=${CLIENT_ID}` +
  `&response_type=code&scope=offline_access&redirect_uri=${encodeURIComponent(REDIRECT)}&state=profile`;

test.describe('Worker profile lifecycle', () => {
  // Block the PWA service worker: on a cold visit its activation reload fires
  // during the OAuth return and re-runs the now-consumed login code (login then
  // fails). Blocking it also lets page.route intercept /api requests, which the
  // SW would otherwise serve and hide from the test.
  test.use({ serviceWorkers: 'block' });

  let org;

  test.beforeAll(async () => {
    // "delete first if already exists"
    await deleteUserByEmail(TEST_EMAIL);
    org = await pickRandomOrg();
    console.log(`[e2e] using org "${org.display_name}" (key ${org.organization_key}), website ${org.website}`);
    console.log(`[e2e]   correct donation URL: ${org.correctDonationUrl}`);
    console.log(`[e2e]   wrong   donation URL: ${org.wrongDonationUrl}`);
  });

  test.afterAll(async () => {
    // Safety net: remove the auth user if the test failed before the delete step.
    try { await deleteUserByEmail(TEST_EMAIL); } catch { /* best effort */ }
  });

  test('create user, build & publish a profile, then delete the account', async ({ page }) => {
    test.setTimeout(300000); // long cross-domain flow; generous budget

    // Fallback for servers predating the getManagedProfiles fix: a brand-new user
    // with no managed-org permissions used to get a 200 with an empty body, which
    // the app's jQuery JSON parser rejects (parsererror), crashing the profile
    // route before the form renders. lib/server/utils.js now returns [] instead of
    // undefined; this shim normalizes the empty body so the test still passes
    // against a deployment that hasn't picked up that fix yet.
    await page.route('**/api/getManagedProfiles', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      await route.fulfill({
        response,
        contentType: 'application/json',
        body: body && body.trim() ? body : '[]',
      });
    });

    // ── 1. Create the user via FusionAuth's hosted registration page ──────────
    await test.step('register new user', async () => {
      await page.goto(loginURL, { waitUntil: 'domcontentloaded' });

      // Hosted login page → "Create an account"
      await page.getByRole('link', { name: /create an account/i }).click();

      // Registration form (field names from FusionAuth's register theme)
      await page.locator('input[name="user.email"]').fill(TEST_EMAIL);
      await page.locator('input[name="user.password"]').fill(TEST_PASSWORD);
      await page.locator('input[name="passwordConfirm"]').fill(TEST_PASSWORD);
      await page.locator('input[name="user.fullName"]').fill(TEST_NAME);
      await page.getByRole('button', { name: /^register$/i }).click();

      // Registration logs the user in and bounces back to the app. As a brand-new
      // *unverified* user the app routes them to the "Verify Email" page.
      await expect(page).toHaveURL(new RegExp(BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 60000 });
      await expect(
        page.getByRole('link', { name: /create your worker profile/i }),
      ).toBeVisible({ timeout: 30000 });
      await page.screenshot({ path: 'test-results/lifecycle-1-registered.png', fullPage: true });
    });

    // ── 2. Confirm the user really was created in FusionAuth ──────────────────
    await test.step('verify user exists in FusionAuth', async () => {
      const user = await getUserByEmail(TEST_EMAIL);
      expect(user, 'FusionAuth user should exist after registration').toBeTruthy();
      expect(user.verified).toBeFalsy(); // still unverified at this point
    });

    // ── 3. Manually mark the email verified in FusionAuth ─────────────────────
    await test.step('set email verified in FusionAuth', async () => {
      await setEmailVerified(TEST_EMAIL);
      const user = await getUserByEmail(TEST_EMAIL);
      expect(user.verified).toBe(true);
    });

    // ── 4. Start a new profile (now that the email is verified) ───────────────
    await test.step('agree to SOF and open the new-profile form', async () => {
      // In-app navigation to /profile; verification now passes, so we land on the
      // Statement-of-Faith agreement page first.
      await page.getByRole('link', { name: /create your worker profile/i }).click();

      const agree = page.locator('#agree');
      await expect(agree).toBeVisible({ timeout: 30000 });
      await agree.check();
      await page.getByRole('button', { name: /^i agree$/i }).click();

      // New-profile form: the organization selectize must render.
      await expect(page.locator('#organization + .selectize-control, .selectize-control')).toBeVisible({ timeout: 30000 });
    });

    // ── 5. Select a random organization ───────────────────────────────────────
    await test.step('select a random organization', async () => {
      const control = page.locator('.selectize-control').first();
      await control.click();
      // Type part of the org name to filter, then click the option by its value
      // (selectize sets data-value to organization_key).
      await page.locator('.selectize-control input').first().fill(org.name.slice(0, 20));
      const option = page.locator(`.selectize-dropdown [data-value="${org.organization_key}"]`);
      await expect(option).toBeVisible({ timeout: 15000 });
      await option.click();

      // The donation-URL field appears only once an org (with no Stripe account)
      // is selected and donations are enabled.
      await expect(page.locator('#donation_url')).toBeVisible({ timeout: 15000 });
    });

    // ── 6a. A wrong donation URL must be rejected ─────────────────────────────
    await test.step('reject an invalid donation URL', async () => {
      const input = page.locator('#donation_url');
      const errorMsg = page.locator('.contains-validation-message:has(#donation_url) .validation-error-message');

      await input.fill(org.wrongDonationUrl);
      await input.blur();

      await expect(input).toHaveClass(/error/, { timeout: 10000 });
      await expect(errorMsg).toBeVisible();
      await expect(errorMsg).toContainText(/hostname does not match/i);
      await page.screenshot({ path: 'test-results/lifecycle-2-bad-url.png', fullPage: true });
    });

    // ── 6b. The org's own website is accepted ─────────────────────────────────
    await test.step('accept the organization website as donation URL', async () => {
      const input = page.locator('#donation_url');
      const errorMsg = page.locator('.contains-validation-message:has(#donation_url) .validation-error-message');

      await input.fill('');
      await input.fill(org.correctDonationUrl);
      await input.blur();

      await expect(input).not.toHaveClass(/error/, { timeout: 10000 });
      await expect(errorMsg).toBeHidden();
    });

    // ── 7. Fill required name fields & create the profile ─────────────────────
    await test.step('create the profile', async () => {
      await page.locator('#first_name').fill(FIRST_NAME);
      await page.locator('#last_name').fill(LAST_NAME);
      await page.locator('#profile_slug').fill(PROFILE_SLUG);

      await page.getByRole('button', { name: /^create$/i }).click();

      // After create, the tabbed editor appears (no longer the new-profile screen).
      await expect(page.getByRole('button', { name: /publish/i })).toBeVisible({ timeout: 30000 });
    });

    // ── 8. Add a ministry description (required to publish) and publish ────────
    await test.step('publish the profile', async () => {
      // Jump to the Ministry tab where the description editor lives.
      await page.getByRole('link', { name: /^ministry$/i }).click();

      // The Trumbowyg editor only syncs into profile.description on real input
      // events, so type with the keyboard (fill() wouldn't fire its change hook)
      // and blur to flush. The "required to publish" error clearing confirms the
      // observable was updated.
      const editor = page.locator('.trumbowyg-editor');
      await expect(editor).toBeVisible({ timeout: 30000 });
      await editor.click();
      await page.keyboard.type('This is an automated end-to-end test profile describing the ministry of a test worker.');
      await page.locator('#video_url').click(); // blur the editor
      const descError = page.locator('.contains-validation-message:has(#description) .validation-error-message');
      await expect(descError).toBeHidden({ timeout: 10000 });

      await page.getByRole('button', { name: /publish/i }).click();

      // A successful publish saves the profile and routes away from the editor
      // (to the dashboard or the profile-saved confirmation page).
      await page.waitForURL(/\/(dashboard|profile-saved)/, { timeout: 30000 });
      await page.screenshot({ path: 'test-results/lifecycle-3-published.png', fullPage: true });
    });

    // ── 9. View the published profile on the public worker page ───────────────
    await test.step('view the published worker page', async () => {
      await page.goto(`${BASE}/worker/${PROFILE_SLUG}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toContainText(new RegExp(FIRST_NAME, 'i'), { timeout: 30000 });
      await page.screenshot({ path: 'test-results/lifecycle-4-worker-page.png', fullPage: true });
    });

    // ── 10. Delete the account through the app ────────────────────────────────
    await test.step('delete the account', async () => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });

      await page.getByRole('button', { name: /delete account/i }).click();

      // alertify prompt: type DELETE to confirm, then OK.
      const prompt = page.locator('.alertify .ajs-input');
      await expect(prompt).toBeVisible({ timeout: 15000 });
      await prompt.fill('DELETE');
      await page.locator('.alertify .ajs-ok').click();

      // The account (and its FusionAuth user) should be gone.
      await expect.poll(
        async () => await getUserByEmail(TEST_EMAIL),
        { timeout: 30000, message: 'FusionAuth user should be deleted' },
      ).toBeNull();
    });
  });
});
