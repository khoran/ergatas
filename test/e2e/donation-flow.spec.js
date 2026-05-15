import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';

const WORKER_PAGE_URL = 'https://home.ergatas.org/worker/test-user-5a';

// Random future expiry (MMYY format) and 3-digit CVV generated once per run
const now = new Date();
const randMonth = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
const randYear  = String(now.getFullYear() + 2).slice(-2);
const testExpiry = `${randMonth}${randYear}`;          // e.g. "0728"
const testCvv    = String(Math.floor(Math.random() * 900) + 100); // e.g. "347"

test.describe('Worker donation flow', () => {
  let stripeListener;

  test.beforeAll(async () => {
    // Start the Stripe CLI webhook listener so the server receives payment events.
    // Requires `stripe` CLI to be installed and authenticated.
    stripeListener = spawn('stripe', [
      'listen',
      '--forward-to',         'https://home.ergatas.org/api/stripe',
      '--forward-connect-to', 'https://home.ergatas.org/api/stripe-connect',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('stripe listener timed out waiting for ready signal (20s)')),
        20000,
      );

      stripeListener.on('error', (err) => {
        clearTimeout(timer);
        reject(
          err.code === 'ENOENT'
            ? new Error('stripe CLI not found — install it from https://stripe.com/docs/stripe-cli')
            : err,
        );
      });

      const onData = (chunk) => {
        const line = chunk.toString();
        process.stdout.write('[stripe] ' + line);
        if (line.includes('Ready!') || /ready/i.test(line)) {
          clearTimeout(timer);
          resolve();
        }
      };
      stripeListener.stdout.on('data', onData);
      stripeListener.stderr.on('data', onData);

      stripeListener.on('exit', (code) => {
        clearTimeout(timer);
        if (code) reject(new Error(`stripe listener exited early with code ${code}`));
      });
    });
  });

  test.afterAll(() => {
    if (stripeListener) {
      stripeListener.kill('SIGTERM');
      stripeListener = null;
    }
  });

  test('complete a donation with test credit card 4242', async ({ page }) => {
    test.setTimeout(90000); // generous budget for full checkout round-trip

    // ── 1. Load the worker profile page ──────────────────────────────────────
    await page.goto(WORKER_PAGE_URL, { waitUntil: 'networkidle' });

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
    await donationForm.locator('button[type="submit"]').click();

    // ── 5. Wait for Stripe Embedded Checkout to mount in #ergatas ─────────────
    //
    // After the API call succeeds, the JS clears #ergatas and calls
    //   checkoutSession.mount('#ergatas')
    // which inserts a cross-origin <iframe src="https://checkout.stripe.com/...">
    //
    // Stripe Embedded Checkout serves the entire checkout page from Stripe's own
    // domain, so it renders card inputs as regular <input> elements directly in
    // the checkout iframe — no nested sub-iframes for PCI isolation.
    await expect(page.locator('#ergatas iframe')).toBeVisible({ timeout: 30000 });

    const checkoutFrame = page.frameLocator('#ergatas iframe');

    // Wait for the card number input to appear so we know the checkout has loaded.
    await expect(checkoutFrame.locator('input#cardNumber')).toBeVisible({ timeout: 30000 });

    // Capture the loaded checkout form for debugging.
    await page.screenshot({ path: 'test-results/stripe-checkout-loaded.png', fullPage: true });

    // ── 6. Fill card details ───────────────────────────────────────────────────
    //
    // Input names discovered from Stripe Embedded Checkout's actual field names.
    // These are regular <input> elements served directly in the checkout iframe.
    //
    // The connected Stripe account is Canadian (CAD), so the checkout defaults
    // country to "Canada". Use a valid Canadian postal code ("K1A 0A6").
    //
    // Use pressSequentially (real keystroke simulation) for masked/formatted fields
    // so that Stripe's input validation receives the per-character events it expects.
    //
    await checkoutFrame.locator('input[name="cardNumber"]').pressSequentially('4242424242424242', { delay: 50 });
    await checkoutFrame.locator('input[name="cardExpiry"]').pressSequentially(testExpiry, { delay: 50 });
    await checkoutFrame.locator('input[name="cardCvc"]').pressSequentially(testCvv, { delay: 50 });
    await checkoutFrame.locator('input[name="billingName"]').fill('Test Donor');
    // Valid Canadian postal code (Parliament Hill, Ottawa) — Stripe auto-formats "K1A0A6" → "K1A 0A6"
    await checkoutFrame.locator('input[name="billingPostalCode"]').pressSequentially('K1A0A6', { delay: 50 });

    // Capture the filled card details for debugging.
    await page.screenshot({ path: 'test-results/stripe-card-filled.png', fullPage: true });

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
