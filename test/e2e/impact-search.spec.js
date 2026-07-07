import { test, expect } from '@playwright/test';

// Exercises the 'Areas of Impact' search view: the world map renders, clicking
// a country filters the results to workers impacting it, and their physical
// locations are drawn as bubbles with arcs back to the selected country.
const BASE = (process.env.TEST_BASE_URL || 'https://home.ergatas.org').replace(/\/$/, '');

test.use({ serviceWorkers: 'block', ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } });

test('impact view filters search by clicked country', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto(BASE + '/search', { waitUntil: 'domcontentloaded' });

  // wait for the initial unfiltered search so we have a baseline count
  const workerCount = page.locator('text=/[\\d,]+ Workers?/').first();
  await expect(workerCount).toBeVisible({ timeout: 25000 });
  const baseline = parseInt((await workerCount.innerText()).replace(/[^\d]/g, ''));

  await page.locator('i[title="Areas of Impact"]').click();
  await expect(page.locator('impact-search-map svg .datamaps-subunit.IND')).toBeAttached({ timeout: 25000 });

  // datamaps binds click via d3, so dispatch a DOM click on the country path
  await page.evaluate(() =>
    document.querySelector('.datamaps-subunit.IND')
      .dispatchEvent(new MouseEvent('click', { bubbles: true })));

  // filter badge appears and the result set narrows
  await expect(page.locator('text=Impact Countries:').first()).toBeVisible({ timeout: 25000 });
  await expect(async () => {
    const count = parseInt((await workerCount.innerText()).replace(/[^\d]/g, ''));
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(baseline);
  }).toPass({ timeout: 25000 });

  // workers are drawn at their physical locations with arcs to the selection
  await expect(page.locator('circle.datamaps-bubble').first()).toBeAttached({ timeout: 25000 });
  await expect(page.locator('path.datamaps-arc').first()).toBeAttached();

  // the map zooms (bubbles shrink inversely to keep their on-screen size) and resets
  await page.locator('button[data-zoom="in"]').click();
  await expect(page.locator('impact-search-map svg g').first())
    .toHaveAttribute('transform', /scale\(1\.6/, { timeout: 10000 });
  await expect(page.locator('circle.datamaps-bubble').first()).toHaveAttribute('r', /^2\.5/);
  await page.locator('button[data-zoom="reset"]').click();
  await expect(page.locator('impact-search-map svg g').first())
    .toHaveAttribute('transform', /scale\(1\)/, { timeout: 10000 });

  // clicking the country again clears the selection
  await page.evaluate(() =>
    document.querySelector('.datamaps-subunit.IND')
      .dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect(page.locator('text=Impact Countries:').first()).not.toBeVisible({ timeout: 25000 });
  await expect(page.locator('circle.datamaps-bubble')).toHaveCount(0, { timeout: 25000 });
});

test('google map impact mode filters search by clicked country circle', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto(BASE + '/search', { waitUntil: 'domcontentloaded' });

  const workerCount = page.locator('text=/[\\d,]+ Workers?/').first();
  await expect(workerCount).toBeVisible({ timeout: 25000 });
  const baseline = parseInt((await workerCount.innerText()).replace(/[^\d]/g, ''));

  await page.locator('img[title="Map View"]').click();
  await expect(page.locator('span[data-mode="impact"]')).toBeVisible({ timeout: 25000 });

  // switch the map to "where work impacts" mode: per-country count circles appear
  await page.locator('span[data-mode="impact"]').click();
  const indiaCircle = page.locator('#search-results-map [title*="India"]').first();
  await expect(indiaCircle).toBeVisible({ timeout: 25000 });

  // clicking a country circle filters the search to workers impacting it
  await indiaCircle.click();
  await expect(page.locator('text=Impact Countries:').first()).toBeVisible({ timeout: 25000 });
  await expect(async () => {
    const count = parseInt((await workerCount.innerText()).replace(/[^\d]/g, ''));
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(baseline);
  }).toPass({ timeout: 25000 });

  // clicking again clears the selection
  await indiaCircle.click();
  await expect(page.locator('text=Impact Countries:').first()).not.toBeVisible({ timeout: 25000 });

  // returning to live mode removes the country circles
  await page.locator('span[data-mode="live"]').click();
  await expect(indiaCircle).not.toBeVisible({ timeout: 25000 });
});
