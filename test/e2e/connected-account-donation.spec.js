import { test, expect } from '@playwright/test';
import { startStripeListener, stopStripeListener } from './helpers/stripe-listener.js';
import { pickConnectedAccountWorker } from './helpers/orgs.js';

const BASE = process.env.TEST_BASE_URL; // e.g. https://home.ergatas.org

// Random future expiry (MMYY format) and 3-digit CVV generated once per run
const now = new Date();
const randMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
const randYear  = String(now.getFullYear() + 2).slice(-2);
const testExpiry = `${randMonth}${randYear}`;          // e.g. "0728"
const testCvv    = String(Math.floor(Math.random() * 900) + 100); // e.g. "347"

// Valid postal codes per billing country. The connected account's country
// drives the checkout's default country, so the required postal-code format
// varies by which connected-account worker we land on.
const POSTAL_BY_COUNTRY = { US: '94103', CA: 'K1A0A6', GB: 'SW1A1AA', AU: '2000' };

// This test specifically covers the Stripe Connect path: donating to a worker
// whose organization has a connected account (non_profits.stripe_account set).
// That makes the server pass the Stripe-Account header on the checkout session
// (getConnectedAccountHeader / makeDonation), unlike the platform-account
// donation exercised by donation-flow.spec.js.
test.describe('Connected-account worker donation flow', () => {
  let stripeListener;
  let worker;

  test.beforeAll(async () => {
    // Discover a published worker under an org with a connected Stripe account.
    worker = await pickConnectedAccountWorker();
    console.log(
      `[connected-donation] worker=${worker.profile_slug} org="${worker.organization_display_name}" ` +
      `stripe_account=${worker.stripe_account}`,
    );

    // Start the Stripe CLI webhook listener so the server receives payment events.
    stripeListener = await startStripeListener();
  });

  test.afterAll(() => {
    stopStripeListener(stripeListener);
    stripeListener = null;
  });

  test('complete a donation to a connected-account worker with test card 4242', async ({ page }) => {
    test.setTimeout(90000); // generous budget for full checkout round-trip

    // ── 1. Load the worker profile page ──────────────────────────────────────
    await page.goto(`${BASE}/worker/${worker.profile_slug}`, { waitUntil: 'networkidle' });

    // ── 2. Open the donation modal ────────────────────────────────────────────
    await page.locator('button.btn-ergatas-donate', { hasText: 'Donate' }).first().click();

    // Wait for the KO-rendered donation form to be visible inside the modal
    const donationForm = page.locator('form.donation-form');
    await expect(donationForm).toBeVisible({ timeout: 15000 });

    // ── 3. Fill the donation form ─────────────────────────────────────────────
    // Radio inputs are visually hidden behind their <label> (Bootstrap btn-group).
    // Click the label that wraps the $25 option instead of the hidden input.
    await page.locator('label:has(input[name="donation-level"][value="25"])').click();

    // Donor name field has no id or name attr — use aria-label
    await donationForm.locator('input[aria-label="name"]').fill('Test Donor');
    await donationForm.locator('#email-address').fill('testdonor@example.com');

    // ── 4. Submit the form → triggers POST /api/makeDonation ─────────────────
    // For a connected-account worker the response carries a stripeAccount, and
    // the client mounts the embedded checkout against that connected account.
    await donationForm.locator('button[type="submit"]').click();

    // ── 5. Wait for Stripe Embedded Checkout to mount in #ergatas ─────────────
    await expect(page.locator('#ergatas iframe')).toBeVisible({ timeout: 30000 });

    const checkoutFrame = page.frameLocator('#ergatas iframe');

    // Wait for the card number input to appear so we know the checkout has loaded.
    await expect(checkoutFrame.locator('input#cardNumber')).toBeVisible({ timeout: 30000 });

    await page.screenshot({ path: 'test-results/connected-checkout-loaded.png', fullPage: true });

    // ── 6. Fill card details ───────────────────────────────────────────────────
    // Regular <input> elements served directly in the checkout iframe. Use
    // pressSequentially (real keystrokes) for masked/formatted fields so Stripe's
    // per-character validation fires.
    await checkoutFrame.locator('input[name="cardNumber"]').pressSequentially('4242424242424242', { delay: 50 });
    await checkoutFrame.locator('input[name="cardExpiry"]').pressSequentially(testExpiry, { delay: 50 });
    await checkoutFrame.locator('input[name="cardCvc"]').pressSequentially(testCvv, { delay: 50 });
    await checkoutFrame.locator('input[name="billingName"]').fill('Test Donor');

    // Postal code is country-dependent: the connected account's country sets the
    // checkout's default billing country. Read it (when present) and use a valid
    // postal code for that country; fall back to a US ZIP.
    const postalInput = checkoutFrame.locator('input[name="billingPostalCode"]');
    if (await postalInput.count()) {
      let postal = POSTAL_BY_COUNTRY.US;
      const countrySelect = checkoutFrame.locator('select[name="billingCountry"]');
      if (await countrySelect.count()) {
        const country = await countrySelect.inputValue();
        postal = POSTAL_BY_COUNTRY[country] || postal;
      }
      await postalInput.pressSequentially(postal, { delay: 50 });
    }

    await page.screenshot({ path: 'test-results/connected-card-filled.png', fullPage: true });

    // ── 7. Submit the Stripe checkout ─────────────────────────────────────────
    await checkoutFrame.locator('button[type="submit"]').click();

    // ── 8. Confirm success ────────────────────────────────────────────────────
    // Stripe's onComplete callback hides the modal and shows an alertify toast:
    //   alertify.success("Thank you for your contribution!")
    await expect(
      page.locator('.ajs-message.ajs-success, .alertify-log.success'),
    ).toBeVisible({ timeout: 30000 });
  });
});
