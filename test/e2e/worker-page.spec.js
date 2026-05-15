import { test, expect } from '@playwright/test';

const WORKER_PAGE_URL = 'https://home.ergatas.org/worker/test-user-5a';

test.describe('Worker profile page', () => {

  test('loads and shows the Donate button', async ({ page }) => {
    await page.goto(WORKER_PAGE_URL, { waitUntil: 'networkidle' });

    // The Donate button is rendered by Knockout; wait for it to appear in the DOM
    const donateBtn = page.locator('.btn-ergatas-donate', { hasText: 'Donate' });
    await expect(donateBtn).toBeVisible({ timeout: 15000 });
  });

});
