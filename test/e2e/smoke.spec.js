import { test, expect } from '@playwright/test';

// Basic no-auth smoke test for cross-platform (BrowserStack) verification.
// Targets the live site; all pages are public and read-only.
//
// Implemented as a SINGLE test with steps on purpose: BrowserStack real mobile
// devices (iOS) allow only one browser context per session, and Playwright
// creates a fresh context per test(). One test = one context = works everywhere.
const BASE = (process.env.TEST_BASE_URL || 'https://home.ergatas.org').replace(/\/$/, '');

test('Ergatas basic website operation', async ({ page }) => {
  // Generous budget: all four steps run in one test, and when routed through the
  // BrowserStack Local tunnel to the dev server each page load is noticeably slower.
  test.setTimeout(120_000);

  await test.step('homepage loads and renders the nav/logo', async () => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    // Logo is rendered inside the Knockout-driven navbar
    await expect(page.locator('#logo')).toBeVisible({ timeout: 20000 });
  });

  await test.step('search runs and shows missionary results', async () => {
    await page.goto(BASE + '/search', { waitUntil: 'domcontentloaded' });
    // Each result card renders a .pcard-name (see lib/components/profile-collection.html)
    await expect(page.locator('.pcard-name a[href^="/worker/"]').first())
      .toBeVisible({ timeout: 25000 });
  });

  await test.step('worker profile loads and shows the Donate button', async () => {
    // Click a real result to navigate via the SPA router (a second same-origin
    // page.goto is aborted by the PWA service worker). Works against any environment.
    await page.locator('.pcard-name a[href^="/worker/"]').first().click();
    await expect(page).toHaveURL(/\/worker\//, { timeout: 20000 });
    const donateBtn = page.locator('.btn-ergatas-donate', { hasText: 'Donate' });
    await expect(donateBtn).toBeVisible({ timeout: 20000 });
  });

  await test.step('about page loads', async () => {
    await page.goto(BASE + '/about', { waitUntil: 'domcontentloaded' });
    // Static content page should render the shared navbar/logo
    await expect(page.locator('#logo')).toBeVisible({ timeout: 20000 });
  });

});
