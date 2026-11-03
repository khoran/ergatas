import 'dotenv/config';
import crypto from 'crypto';
import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';
import { deleteUserByEmail, setEmailVerified, getUserByEmail } from './helpers/fusionauth.js';

// ── Changing a user's email ──────────────────────────────────────────────────
//   1. register a fresh FusionAuth user and mark it verified
//   2. request an email change from dashboard > Account Settings
//   3. open the confirmation link and confirm
//   4. FusionAuth has the new address (still verified), the session shows it
//      after a reload, and the old address is free
//
// The real link is mailed to the new address, which the test can't read, so it
// signs an equivalent token the same way lib/server/utils.js does. That needs the
// app server's JWT_SECRET, i.e. this runs against a server using this repo's .env.

const BASE        = process.env.TEST_BASE_URL;            // https://home.ergatas.org
const AUTH_BASE   = process.env.AUTH_URL_BASE;
const CLIENT_ID   = process.env.AUTH_CLIENT_ID;
const REDIRECT    = process.env.REDIRECT_URL;

const OLD_EMAIL     = 'testusr11@ergatas.org';
const NEW_EMAIL     = 'testusr11-changed@ergatas.org';
const TEST_PASSWORD = 'Ergatas-E2E-Test-7b2!';
const TEST_NAME     = 'Test Usr11';

const loginURL =
  `${AUTH_BASE}/authorize?client_id=${CLIENT_ID}` +
  `&response_type=code&scope=offline_access&redirect_uri=${encodeURIComponent(REDIRECT)}&state=dashboard`;

function changeToken(userId, oldEmail, newEmail) {
  const key = crypto.createHmac('sha256', process.env.JWT_SECRET).update('email-change').digest();
  return new SignJWT({ purpose: 'email-change', old_email: oldEmail, new_email: newEmail })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setExpirationTime('1h')
    .sign(key);
}

test.describe('Change email', () => {
  // see profile-lifecycle.spec.js: the SW reload re-runs the consumed login code
  test.use({ serviceWorkers: 'block', ignoreHTTPSErrors: true });

  test.beforeAll(async () => {
    await deleteUserByEmail(OLD_EMAIL);
    await deleteUserByEmail(NEW_EMAIL);
  });

  test.afterAll(async () => {
    try { await deleteUserByEmail(OLD_EMAIL); } catch { /* best effort */ }
    try { await deleteUserByEmail(NEW_EMAIL); } catch { /* best effort */ }
  });

  test('request, confirm, and keep the new email', async ({ page }) => {
    test.setTimeout(180000);
    let userId;

    await test.step('register and verify a new user', async () => {
      await page.goto(loginURL, { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: /create an account/i }).click();
      await page.locator('input[name="user.email"]').fill(OLD_EMAIL);
      await page.locator('input[name="user.password"]').fill(TEST_PASSWORD);
      await page.locator('input[name="passwordConfirm"]').fill(TEST_PASSWORD);
      await page.locator('input[name="user.fullName"]').fill(TEST_NAME);
      await page.getByRole('button', { name: /^register$/i }).click();
      await expect(page.getByRole('link', { name: /create your worker profile/i }))
        .toBeVisible({ timeout: 60000 });

      userId = await setEmailVerified(OLD_EMAIL);
    });

    await test.step('request the change from account settings', async () => {
      await page.goto(BASE + '/dashboard/account-settings', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible({ timeout: 30000 });
      await expect(page.locator('account-settings strong').first()).toHaveText(OLD_EMAIL);

      await page.getByLabel('New email address').fill(NEW_EMAIL);
      await page.getByRole('button', { name: /change email/i }).click();
      await expect(page.locator('account-settings .alert-success')).toContainText(NEW_EMAIL, { timeout: 30000 });

      // nothing changes until the link is opened
      expect((await getUserByEmail(OLD_EMAIL)).id).toBe(userId);
    });

    await test.step('confirm from the emailed link', async () => {
      const token = await changeToken(userId, OLD_EMAIL, NEW_EMAIL);
      await page.goto(BASE + '/confirm-email-change?token=' + token, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('confirm-email-change')).toContainText(NEW_EMAIL, { timeout: 30000 });
      await page.getByRole('button', { name: /confirm new email/i }).click();
      await expect(page.locator('confirm-email-change .alert-success')).toContainText(NEW_EMAIL, { timeout: 30000 });
    });

    await test.step('FusionAuth has the new address, still verified', async () => {
      const user = await getUserByEmail(NEW_EMAIL);
      expect(user && user.id).toBe(userId);
      expect(user.verified).toBe(true);
      expect(await getUserByEmail(OLD_EMAIL)).toBeNull();
    });

    await test.step('a reloaded session shows the new address', async () => {
      await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.dashboard-menu-email')).toHaveText(NEW_EMAIL, { timeout: 30000 });
    });

    await test.step('a link for the old address no longer applies', async () => {
      const stale = await changeToken(userId, OLD_EMAIL, 'testusr11-other@ergatas.org');
      const response = await page.request.post(BASE + '/api/confirmEmailChange', { data: { changeToken: stale } });
      expect(response.ok()).toBeFalsy();
      expect((await response.json()).message).toMatch(/no longer valid/);
    });
  });
});
