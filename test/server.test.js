/**
 * Server endpoint tests
 *
 * These are integration-style tests that hit a running server instance.
 * Start the server before running: `node server.js`
 *
 * Configure the target URL with the TEST_BASE_URL env var:
 *   TEST_BASE_URL=http://localhost:8080 npm test
 *
 * Tests are structured in three tiers:
 *   1. Public/read-only endpoints — verified for status and response shape.
 *   2. Validation tests — endpoints called with missing required fields; expected to return 4xx/5xx.
 *   3. Auth-protected endpoints — called without a token; expected to return 4xx/5xx.
 *
 * Endpoints skipped (see list at the bottom of this file) are those that would
 * send real emails, mutate DB records, require signed payloads, or need valid
 * external credentials (OAuth codes, Stripe sessions, reCAPTCHA tokens, etc.).
 */

import dotenv from 'dotenv';
dotenv.config();

import chai from 'chai';
const expect = chai.expect;
import axios from 'axios';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8080';

// Never throw on non-2xx — we want to assert the status ourselves
const http = axios.create({ baseURL: BASE_URL, validateStatus: null, timeout: 20000 });

// ── Helpers ────────────────────────────────────────────────────────────────────

const post = (url, data = {}) => http.post(url, data);
const get  = (url)            => http.get(url);

// Verify server is reachable before any test runs
before(async function () {
  this.timeout(12000);
  let res;
  try {
    res = await get('/');
  } catch (err) {
    throw new Error(
      `Server not reachable at ${BASE_URL}.\n` +
      `Start the server with 'node server.js' then re-run tests.\n` +
      `Original error: ${err.message}`,
    );
  }
  // Accept any response — static assets or the app shell are both fine
  expect(res.status).to.be.lessThan(600);
});

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('Server endpoints', function () {
  this.timeout(20000);

  // ════════════════════════════════════════════════════════════════════════════
  // § 1  Public GET endpoints
  // ════════════════════════════════════════════════════════════════════════════

  describe('GET /api/peopleGroupWorkers/:peopleID3', function () {
    it('returns 200 for a valid-looking people-group ID', async function () {
      const res = await get('/api/peopleGroupWorkers/12345');
      expect(res.status).to.equal(200);
    });
    it('response body is a URL string or empty', async function () {
      const res = await get('/api/peopleGroupWorkers/12345');
      expect(res.data).to.be.a('string');
    });
  });

  describe('GET /api/countryWorkers/:countryCode', function () {
    it('returns 200 for country code "US"', async function () {
      const res = await get('/api/countryWorkers/US');
      expect(res.status).to.equal(200);
    });
    it('response body is a URL string or empty', async function () {
      const res = await get('/api/countryWorkers/US');
      expect(res.data).to.be.a('string');
    });
  });

  describe('GET /feeds/missionaryOfTheDay', function () {
    it('returns 200', async function () {
      const res = await get('/feeds/missionaryOfTheDay');
      expect(res.status).to.equal(200);
    });
    it('content-type includes xml', async function () {
      const res = await get('/feeds/missionaryOfTheDay');
      expect(res.headers['content-type']).to.include('xml');
    });
  });

  describe('GET /feeds/newMissionaries', function () {
    it('returns 200', async function () {
      const res = await get('/feeds/newMissionaries');
      expect(res.status).to.equal(200);
    });
    it('content-type includes xml', async function () {
      const res = await get('/feeds/newMissionaries');
      expect(res.headers['content-type']).to.include('xml');
    });
  });

  // very long running
  //describe('GET /api/checkProfileUpdates', function () {
  //  it('returns 200 (no auth required)', async function () {
  //    const res = await get('/api/checkProfileUpdates');
  //    expect(res.status).to.equal(200);
  //  });
  //});

  describe('GET /api/qrcode', function () {
    it('returns 200 SVG for a given slug', async function () {
      const res = await get('/api/qrcode?slug=test');
      expect(res.status).to.equal(200);
      expect(res.headers['content-type']).to.include('svg');
    });
    it('returns 200 even for an empty slug', async function () {
      const res = await get('/api/qrcode?slug=');
      expect(res.status).to.equal(200);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // § 2  Public POST endpoints (read-only, no auth required)
  // ════════════════════════════════════════════════════════════════════════════

  describe('POST /api/nonProfits', function () {
    it('returns 200', async function () {
      const res = await post('/api/nonProfits', { query: 'gospel', state: 'CA' });
      expect(res.status).to.equal(200);
    });
    it('response has an organizations array', async function () {
      const res = await post('/api/nonProfits', { query: 'gospel', state: 'CA' });
      expect(res.data).to.have.property('organizations').that.is.an('array');
    });
    it('also works with no state', async function () {
      const res = await post('/api/nonProfits', { query: 'bible' });
      expect(res.status).to.equal(200);
    });
  });

  describe('POST /api/peopleGroupSearch', function () {
    it('returns 200 and an array', async function () {
      const res = await post('/api/peopleGroupSearch', { query: 'Hindu', limit: 5 });
      expect(res.status).to.equal(200);
      expect(res.data).to.be.an('array');
    });
    it('respects the limit parameter', async function () {
      const res = await post('/api/peopleGroupSearch', { query: 'Hindu', limit: 3 });
      expect(res.status).to.equal(200);
      expect(res.data.length).to.be.at.most(3);
    });
  });

  describe('POST /api/peopleGroupNames', function () {
    it('returns 200 for an empty codes array', async function () {
      const res = await post('/api/peopleGroupNames', { codes: [] });
      expect(res.status).to.equal(200);
    });
  });

  describe('POST /api/languageSearch', function () {
    it('returns 200 and an array', async function () {
      const res = await post('/api/languageSearch', { query: 'Hindi', limit: 5 });
      expect(res.status).to.equal(200);
      expect(res.data).to.be.an('array');
    });
    it('respects the limit parameter', async function () {
      const res = await post('/api/languageSearch', { query: 'Arabic', limit: 2 });
      expect(res.status).to.equal(200);
      expect(res.data.length).to.be.at.most(2);
    });
  });

  describe('POST /api/languageNames', function () {
    it('returns 200 for an empty codes array', async function () {
      const res = await post('/api/languageNames', { codes: [] });
      expect(res.status).to.equal(200);
    });
  });

  describe('POST /api/peopleGroupIds', function () {
    it('returns 200 for the "Frontier" set', async function () {
      const res = await post('/api/peopleGroupIds', { setName: 'Frontier' });
      expect(res.status).to.equal(200);
    });
  });

  describe('POST /api/frontierPeopleGroupIds (deprecated)', function () {
    it('returns 200 with no body', async function () {
      const res = await post('/api/frontierPeopleGroupIds', {});
      expect(res.status).to.equal(200);
    });
  });

  describe('POST /api/profileStats', function () {
    it('returns 200 for missionary_profile_key = 1', async function () {
      const res = await post('/api/profileStats', { missionary_profile_key: 1 });
      expect(res.status).to.equal(200);
    });
  });

  describe('POST /api/slugExists', function () {
    it('returns 200 with an exists boolean for an unknown slug', async function () {
      const res = await post('/api/slugExists', { slug: 'zz-nonexistent-slug-test-xyz' });
      expect(res.status).to.equal(200);
      expect(res.data).to.have.property('exists', false);
    });
    it('returns 5xx when slug field is missing', async function () {
      const res = await post('/api/slugExists', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/signOut', function () {
    it('returns 200 and an empty object', async function () {
      const res = await post('/api/signOut', {});
      expect(res.status).to.equal(200);
      expect(res.data).to.deep.equal({});
    });
    it('response sets the esession cookie to "deleted"', async function () {
      const res = await post('/api/signOut', {});
      const setCookie = res.headers['set-cookie'] || [];
      const hasEsession = setCookie.some(c => c.includes('esession'));
      expect(hasEsession).to.be.true;
    });
  });

  describe('POST /api/listUserFiles', function () {
    it('returns 5xx when prefix field is missing', async function () {
      const res = await post('/api/listUserFiles', {});
      expect(res.status).to.be.within(400, 599);
    });
    it('returns 200 and an array for a valid prefix', async function () {
      const res = await post('/api/listUserFiles', { prefix: 'test/' });
      expect(res.status).to.equal(200);
      expect(res.data).to.be.an('array');
    });
  });

  describe('POST /api/refreshSlugCache', function () {
    it('returns 200', async function () {
      const res = await post('/api/refreshSlugCache', {});
      expect(res.status).to.equal(200);
    });
  });

  describe('POST /api/registerPushSubscriber', function () {
    it('returns 400 when no subscription is provided', async function () {
      const res = await post('/api/registerPushSubscriber', {});
      expect(res.status).to.equal(400);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // § 3  Validation — missing required fields should produce 4xx or 5xx
  // ════════════════════════════════════════════════════════════════════════════

  describe('POST /api/removeUserFile — validation', function () {
    it('returns 4xx/5xx when filename is absent', async function () {
      const res = await post('/api/removeUserFile', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/recaptcha — validation', function () {
    it('returns 4xx/5xx when recaptchaToken and action are absent', async function () {
      const res = await post('/api/recaptcha', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/makeDonation — validation', function () {
    it('returns 4xx/5xx when all required fields are absent', async function () {
      const res = await post('/api/makeDonation', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/orgAppNotify — validation', function () {
    it('returns 4xx/5xx when user_key is absent', async function () {
      const res = await post('/api/orgAppNotify', { organization_key: 'org-1' });
      expect(res.status).to.be.within(400, 599);
    });
    it('returns 4xx/5xx when organization_key is absent', async function () {
      const res = await post('/api/orgAppNotify', { user_key: 'user-1' });
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/log — validation', function () {
    it('returns 4xx/5xx when log_key is wrong', async function () {
      const res = await post('/api/log', { key: 'wrong-key', logs: [] });
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/profilePostPrayer — validation', function () {
    it('returns 4xx/5xx when post_key is absent', async function () {
      const res = await post('/api/profilePostPrayer', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/checkoutSessionStatus — validation', function () {
    it('returns 4xx/5xx when checkoutSessionId is absent', async function () {
      const res = await post('/api/checkoutSessionStatus', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/newProfile — validation', function () {
    it('returns 4xx/5xx when firstName/lastName are absent', async function () {
      const res = await post('/api/newProfile', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/deleteProfile — validation', function () {
    it('returns 4xx/5xx when required fields are absent', async function () {
      const res = await post('/api/deleteProfile', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/addROProfile — validation', function () {
    it('returns 4xx/5xx when missionary_profile_key is absent', async function () {
      const res = await post('/api/addROProfile', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/txDetails — validation', function () {
    it('returns 4xx/5xx when possible_transaction_key is absent', async function () {
      const res = await post('/api/txDetails', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/donorContactInfo — validation', function () {
    it('returns 4xx/5xx when customer_ids is absent', async function () {
      const res = await post('/api/donorContactInfo', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/notifyOrgUpdate — validation', function () {
    it('returns 4xx/5xx when organization_key is absent', async function () {
      const res = await post('/api/notifyOrgUpdate', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/deleteQueuedMessage — validation', function () {
    it('returns 4xx/5xx when message_queue_key is absent', async function () {
      const res = await post('/api/deleteQueuedMessage', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/sendQueuedMessage — validation', function () {
    it('returns 4xx/5xx when message_queue_key is absent', async function () {
      const res = await post('/api/sendQueuedMessage', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/getUserEmails — validation', function () {
    it('returns 4xx/5xx when userIds is absent', async function () {
      const res = await post('/api/getUserEmails', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/contact/bulk — validation', function () {
    it('returns 4xx/5xx when required fields are absent', async function () {
      const res = await post('/api/contact/bulk', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/grantUserOrgPerm — validation', function () {
    it('returns 4xx/5xx when required fields are absent', async function () {
      const res = await post('/api/grantUserOrgPerm', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // § 4  Auth-protected endpoints — no token → 4xx or 5xx
  // ════════════════════════════════════════════════════════════════════════════

  describe('POST /api/verifyUser — auth required', function () {
    it('returns 4xx/5xx without a token', async function () {
      const res = await post('/api/verifyUser', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/resendVerifyEmail — auth required', function () {
    it('returns 4xx/5xx without a token', async function () {
      const res = await post('/api/resendVerifyEmail', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/getManagedProfiles — auth required', function () {
    it('returns 4xx/5xx without a token', async function () {
      const res = await post('/api/getManagedProfiles', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/queuedMessages — org_review role required', function () {
    it('returns 4xx/5xx without a token', async function () {
      const res = await post('/api/queuedMessages', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/markTxPaid — org_review role required', function () {
    it('returns 4xx/5xx without a token', async function () {
      const res = await post('/api/markTxPaid', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/inviteProfileOwner — auth required', function () {
    it('returns 4xx/5xx without a token', async function () {
      const res = await post('/api/inviteProfileOwner', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/claimProfile — auth required', function () {
    it('returns 4xx/5xx without a token', async function () {
      const res = await post('/api/claimProfile', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/firstPublish — auth required', function () {
    it('returns 4xx/5xx without a token', async function () {
      const res = await post('/api/firstPublish', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/getWorkerDonations — auth required', function () {
    it('returns 4xx/5xx without a token', async function () {
      const res = await post('/api/getWorkerDonations', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/deleteUser — auth required', function () {
    it('returns 4xx/5xx without a token', async function () {
      const res = await post('/api/deleteUser', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/newUser — auth required', function () {
    it('returns 4xx/5xx without a token', async function () {
      const res = await post('/api/newUser', {});
      expect(res.status).to.be.within(400, 599);
    });
  });

  describe('POST /api/contact/setup — origin-restricted', function () {
    it('returns 4xx/5xx from a non-whitelisted origin (localhost)', async function () {
      const res = await post('/api/contact/setup', {
        profileUserId: 'u1', fromEmail: 'test@example.com', name: 'Test', message: 'hi',
      });
      expect(res.status).to.be.within(400, 599);
    });
  });
});

/*
 * ════════════════════════════════════════════════════════════════════════════
 * SKIPPED ENDPOINTS — additional setup required before these can be tested
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1.  POST /api/token
 *     Needs: a valid FusionAuth OAuth authorization code (req.body.code).
 *     The code is short-lived and can only be obtained via a real user login flow.
 *
 * 2.  POST /api/refresh
 *     Needs: a signed "esession" HTTP-only cookie containing a valid refresh token.
 *     Obtainable only after a successful /api/token call with correct cookie secret.
 *
 * 3.  POST /api/recaptcha
 *     Needs: a real Google reCAPTCHA v3 token (req.body.recaptchaToken) obtained
 *     from client-side reCAPTCHA. Tokens are single-use and expire in 2 minutes.
 *
 * 4.  POST /api/stripe  (webhook)
 * 5.  POST /api/stripe-connect  (webhook)
 *     Need: raw request body signed with the Stripe webhook signing secret
 *     (whsec_...). Only valid signatures pass stripeUtils.handleStripeEvent().
 *
 * 6.  POST /api/mailgun  (webhook)
 *     Needs: req.body.signature containing a valid Mailgun HMAC webhook signature.
 *
 * 7.  POST /api/makeDonation  (live Stripe call)
 *     Would create a real Stripe Checkout Session on the connected account.
 *     Needs: a missionary_profile_key that has a stripe_account configured.
 *     The e2e test in test/e2e/donation-flow.spec.js covers this end-to-end.
 *
 * 8.  POST /api/checkoutSessionStatus  (live Stripe call)
 *     Needs: a real Stripe checkout session ID (cs_test_...).
 *
 * 9.  POST /api/contact  (sends live email via Mailgun)
 *     Needs: Mailgun API key configured in env, would send a real message.
 *
 * 10. POST /api/contact/forward  (sends live email)
 *     Same as above; also supports multipart/form-data.
 *
 * 11. POST /api/contact/bulk  (sends live bulk email)
 *     Needs: org_review role JWT + Mailgun configured. Would send real emails.
 *
 * 12. POST /api/newsletterSignup  (adds to Mailchimp mailing list)
 *     Would add a real subscriber to the Mailchimp audience.
 *
 * 13. POST /api/newUser  (adds to Mailchimp mailing list)
 *     Same as above; requires a valid auth token.
 *
 * 14. POST /api/newProfile  (creates real DB records)
 *     Would insert a new missionary profile into the database.
 *
 * 15. POST /api/deleteProfile  (deletes real DB records)
 *     Requires a valid auth token for the owning user.
 *
 * 16. POST /api/deleteUser  (deletes real user account)
 *     Requires a valid auth token. Destructive — also triggers FusionAuth deletion.
 *
 * 17. POST /api/claimOrg  (modifies real DB records)
 *     Requires a valid auth token.
 *
 * 18. POST /api/claimProfile  (modifies real DB records)
 *     Requires a valid auth token with the profile claim token in the body.
 *
 * 19. POST /api/grantUserOrgPerm  (modifies real DB records)
 *     Requires a valid JWT with the organization_review role.
 *
 * 20. POST /api/changeToMPKPrefix  (renames real storage blobs)
 *     No auth check — would rename blob storage keys for a given MPK.
 *
 * 21. POST /api/removeUserFile  (deletes real files from cloud storage)
 *     Requires valid auth token and a real filename.
 *
 * 22. POST /api/markTxPaid  (modifies DB + sends donation receipt email)
 *     Requires org_review role. Would send a real email receipt.
 *
 * 23. POST /api/sendQueuedMessage  (sends live email from queue)
 *     Requires org_review role. Would send a real queued message.
 *
 * 24. POST /api/deleteQueuedMessage  (deletes DB records)
 *     Requires org_review role.
 *
 * 25. POST /api/inviteProfileOwner  (sends live invitation email)
 *     Requires auth token. Would email the invited owner.
 *
 * 26. POST /api/firstPublish  (adds worker to RSS feeds)
 *     Requires auth token and a real missionary_profile_key.
 *
 * 27. POST /api/notifyOrgUpdate  (sends push/email notifications)
 *     Requires auth token with appropriate role.
 *
 * 28. POST /api/registerPushSubscriber  (saves subscription + sends test push)
 *     Needs a real Web Push subscription object from a browser.
 *
 * 29. POST /api/unsubscribePushNotifications
 *     Needs a real Web Push subscription object.
 *
 * 30. POST /api/sendNotification
 *     Needs a real push_subscription_key stored in the DB.
 *
 * 31. POST /api/getUserEmails  (reads real user email addresses)
 *     Requires org_review role JWT + real userIds from the DB.
 *
 * 32. POST /api/donorContactInfo  (reads from Stripe + DB)
 *     Requires auth token + real Stripe customer IDs.
 *
 * 33. POST /api/txDetails  (reads sensitive transaction data)
 *     Requires auth token + real possible_transaction_key.
 *
 * 34. POST /api/getWorkerDonations  (reads sensitive transaction data)
 *     Requires auth token for a worker who has donations in the DB.
 *
 * 35. POST /api/testTemplate  (sends a live templated email)
 *     Sends to information@ergatas.org — safe only in dev environments.
 *
 * 36. POST /api/userCleanup512  (modifies user records in DB)
 *     No auth check. dryRun defaults to true when body is empty but still
 *     queries the real DB; potentially slow and intrusive in production.
 *
 * 37. POST /api/log
 *     Needs the LOG_KEY environment variable value to pass authentication.
 *     Also requires the Loki logging endpoint to be reachable.
 */
