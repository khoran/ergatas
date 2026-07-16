import { test, expect } from '@playwright/test';

// Exercises the 'Areas of Impact' search view: the world map renders, clicking
// a country filters the results to workers impacting it, and their physical
// locations are drawn as bubbles with arcs back to the selected country.
const BASE = (process.env.TEST_BASE_URL || 'https://home.ergatas.org').replace(/\/$/, '');

test.use({ serviceWorkers: 'block', ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } });

// Dispatches pointerdown+pointerup at a selector's center, matching the
// component's own pointer-based hit-testing (see impact-search-map.js).
async function clickCountry(page, selector){
  const box = await page.locator(selector).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(({ x, y }) => {
    const opts = { bubbles: true, clientX: x, clientY: y };
    document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerdown', opts));
    document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerup', opts));
  }, { x, y });
}

test('impact view filters search by clicked country', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto(BASE + '/search', { waitUntil: 'domcontentloaded' });

  // wait for the initial unfiltered search so we have a baseline count
  const workerCount = page.locator('text=/[\\d,]+ Workers?/').first();
  await expect(workerCount).toBeVisible({ timeout: 25000 });
  const baseline = parseInt((await workerCount.innerText()).replace(/[^\d]/g, ''));

  await page.locator('button[title="Areas of impact"]').click();
  await expect(page.locator('impact-search-map svg .datamaps-subunit.IND')).toBeAttached({ timeout: 25000 });

  // Selection is driven off pointerdown/pointerup (not click — see
  // impact-search-map.js for why), hit-tested at the release coordinates, so
  // the events need real screen coordinates over the country path.
  await clickCountry(page, '.datamaps-subunit.IND');

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
  await clickCountry(page, '.datamaps-subunit.IND');
  await expect(page.locator('text=Impact Countries:').first()).not.toBeVisible({ timeout: 25000 });
  await expect(page.locator('circle.datamaps-bubble')).toHaveCount(0, { timeout: 25000 });
});
