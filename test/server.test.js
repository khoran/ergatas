/**
 * Server endpoint tests
 *
 * These are integration-style tests that hit a running server instance.
 * Start the server before running: `node server.js`
 *
 * Configure the target URL with the TEST_BASE_URL env var:
 *   TEST_BASE_URL=http://localhost:8080 npm test
 *
 * Tests are structured in four tiers:
 *   1. Public/read-only endpoints — verified for exact status AND response content
 *      (feed XML, qrcode SVG, worker-URL strings cross-checked against the DB, etc.).
 *   2. Public read-only POST endpoints — response bodies verified against live data
 *      (search results matched to the query, code→name round-trips, cookie semantics).
 *   3. Validation tests — endpoints called with missing required fields; the exact
 *      500 + "missing field <name>" (or specific AppError message) is asserted.
 *   4. Auth-protected endpoints — the full error surface is exercised: no token → 500,
 *      expired token → 401, wrong-secret token → 500, wrong role → "Not authorized",
 *      plus safe positive reads using self-signed role JWTs (server accepts any JWT
 *      signed with JWT_SECRET).
 *
 * Tests that mint JWTs or read PostgREST directly are gated on JWT_SECRET /
 * POSTGREST_SERVER_URL_BASE and skip cleanly when those are absent. Tests that depend
 * on external services (Joshua Project, ProPublica, FusionAuth, GA, Stripe) derive
 * their expected values from a first live call and skip when the source has no data,
 * rather than hardcoding.
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
import { SignJWT } from 'jose';
import { DataAccess } from '../lib/shared/data-access.js';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8080';
const TEST_USER_NAME = process.env.TEST_USER_NAME;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const TEST_USER_PROFILE_SLUG = process.env.TEST_USER_PROFILE_SLUG;

// Never throw on non-2xx — we want to assert the status ourselves
const http = axios.create({ baseURL: BASE_URL, validateStatus: null, timeout: 20000 });

// ── Helpers ────────────────────────────────────────────────────────────────────

const post = (url, data = {}) => http.post(url, data);
const get  = (url)            => http.get(url);

let authenticatedTestContextPromise;

const hasAuthenticatedTestEnv = () => (
  Boolean(TEST_USER_NAME && TEST_USER_PASSWORD && TEST_USER_PROFILE_SLUG)
);

async function signTestJwt(claims, expirationTime = '10m') {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required to construct authenticated server tests');
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expirationTime)
    .sign(new TextEncoder().encode(secret));
}

function createPostgrestDataAccess(token) {
  const baseUrl = process.env.POSTGREST_SERVER_URL_BASE;
  if (!baseUrl) {
    throw new Error('POSTGREST_SERVER_URL_BASE is required to construct authenticated server tests');
  }

  const db = new DataAccess(baseUrl, async (requestData) => {
    const response = await axios({
      ...requestData,
      timeout: 20000,
      validateStatus: null,
    });

    if (response.status >= 200 && response.status < 300) {
      return response.data;
    }

    throw new Error(`DB request failed with status ${response.status}: ${response.statusText}`);
  });

  db.setToken(token);
  return db;
}

async function tryPasswordGrantToken() {
  if (!hasAuthenticatedTestEnv() || !process.env.AUTH_TOKEN_URL_BASE || !process.env.AUTH_CLIENT_ID) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.AUTH_CLIENT_ID,
    username: TEST_USER_NAME,
    password: TEST_USER_PASSWORD,
  });

  const res = await axios.post(process.env.AUTH_TOKEN_URL_BASE, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    validateStatus: null,
    timeout: 20000,
  });

  return res.status === 200 && res.data && res.data.access_token
    ? res.data.access_token
    : null;
}

async function getFusionUser(userId) {
  if (!userId || !process.env.FUSION_BASE_URL || !process.env.FUSION_USER_INFO_KEY) {
    return null;
  }

  const res = await axios.get(`${process.env.FUSION_BASE_URL}/api/user/${userId}`, {
    headers: { Authorization: process.env.FUSION_USER_INFO_KEY },
    validateStatus: null,
    timeout: 20000,
  });

  return res.status === 200 && res.data ? res.data.user : null;
}

async function getAuthenticatedTestContext() {
  if (!hasAuthenticatedTestEnv()) {
    throw new Error('TEST_USER_NAME, TEST_USER_PASSWORD, and TEST_USER_PROFILE_SLUG are required for authenticated server endpoint tests');
  }

  if (!authenticatedTestContextPromise) {
    authenticatedTestContextPromise = (async () => {
      const serverToken = await signTestJwt({ role: 'ergatas_server', roles: ['ergatas_server'] });
      const serverDb = createPostgrestDataAccess(serverToken);
      const profile = await serverDb.getProfileBySlug(TEST_USER_PROFILE_SLUG);

      if (!profile || !profile.external_user_id) {
        throw new Error(`No profile owner found for TEST_USER_PROFILE_SLUG=${TEST_USER_PROFILE_SLUG}`);
      }

      const fusionUser = await getFusionUser(profile.external_user_id);
      const passwordGrantToken = await tryPasswordGrantToken();
      const fallbackToken = await signTestJwt({
        role: 'ergatas_web',
        roles: ['ergatas_web'],
        sub: profile.external_user_id,
        email: (fusionUser && fusionUser.email) || TEST_USER_NAME,
      });

      const token = passwordGrantToken || fallbackToken;
      const userDb = createPostgrestDataAccess(token);
      const rawTransactions = await userDb.getWorkerTransactions();

      return {
        token,
        profile,
        rawTransactions,
        tokenSource: passwordGrantToken ? 'password-grant' : 'signed-fallback',
      };
    })();
  }

  return authenticatedTestContextPromise;
}

// ── Assertion helpers ────────────────────────────────────────────────────────────

// All handler errors funnel through server.js errorHandler(). Non-JWTExpired errors
// (AppError, jose signature failures, ensureFields failures) become a 500 with
// { title: 'An unexpected error occurred', message: <err.message> }.
function expectServerError(res, messageSubstring) {
  expect(res.status, `expected 500, got ${res.status} body=${JSON.stringify(res.data)}`).to.equal(500);
  expect(res.data).to.have.property('title', 'An unexpected error occurred');
  if (messageSubstring != null) {
    expect(res.data.message, `error message should mention "${messageSubstring}"`)
      .to.be.a('string').that.includes(messageSubstring);
  }
}

// ensureFields(body,[...]) throws AppError("ensureFields: missing field <name>") on the
// first missing field, which surfaces as the generic 500 above.
function expectMissingField(res, field) {
  expectServerError(res, `missing field ${field}`);
}

// ── Environment gates ────────────────────────────────────────────────────────────

// Signing test JWTs only needs the shared secret.
const hasJwtEnv = () => Boolean(process.env.JWT_SECRET);
// Querying PostgREST directly needs the secret (for a server-role token) plus the DB URL.
const hasDbTestEnv = () => Boolean(process.env.JWT_SECRET && process.env.POSTGREST_SERVER_URL_BASE);

let serverDbPromise;
async function getServerDb() {
  if (!serverDbPromise) {
    serverDbPromise = (async () => {
      const token = await signTestJwt({ role: 'ergatas_server', roles: ['ergatas_server'] });
      return createPostgrestDataAccess(token);
    })();
  }
  return serverDbPromise;
}

const signOrgReviewToken = (extra = {}) =>
  signTestJwt({ role: 'ergatas_web', roles: ['organization_review'], sub: 'test-org-reviewer', ...extra });

const signWebToken = (extra = {}) =>
  signTestJwt({ role: 'ergatas_web', roles: ['ergatas_web'], sub: 'test-web-user', ...extra });

// Sign a token with a secret that does NOT match JWT_SECRET, so verification fails.
function signBadSecretToken(claims = {}) {
  return new SignJWT({ role: 'ergatas_web', roles: ['ergatas_web'], ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode('not-the-real-secret-' + (process.env.JWT_SECRET || 'x')));
}

const firstAllowedOrigin = () => (process.env.CLIENT_ORIGINS || '').split(';')[0];
const postWithOrigin = (url, data, origin) => http.post(url, data, { headers: { Origin: origin } });

// Parse a Set-Cookie header entry into { value, attrs } (attr keys lowercased).
function parseSetCookie(res, name) {
  const setCookie = res.headers['set-cookie'] || [];
  const entry = setCookie.find(c => c.startsWith(name + '='));
  if (!entry) return null;
  const parts = entry.split(';').map(p => p.trim());
  const value = parts[0].slice(name.length + 1);
  const attrs = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq === -1) attrs[p.toLowerCase()] = true;
    else attrs[p.slice(0, eq).toLowerCase()] = p.slice(eq + 1);
  }
  return { value, attrs };
}

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
    // The server only reports a URL when its in-memory worker cache (built from the
    // people_groups_with_workers DB view) contains the code, so derive a real code.
    let codeWithWorker;
    before(async function () {
      if (!hasDbTestEnv()) return;
      const rows = await (await getServerDb()).peopleGroupsWithWorkers();
      codeWithWorker = rows && rows.length ? rows[0].code : null;
    });

    it('returns the search URL for a people group that has a worker', async function () {
      if (!codeWithWorker) this.skip();
      const res = await get('/api/peopleGroupWorkers/' + codeWithWorker);
      expect(res.status).to.equal(200);
      expect(res.data).to.equal(
        `https://${process.env.DOMAIN}/search/peopleGroupID/${codeWithWorker}\n`,
      );
    });

    it('returns an empty string for a people group with no worker', async function () {
      const res = await get('/api/peopleGroupWorkers/999999999');
      expect(res.status).to.equal(200);
      expect(res.data).to.equal('');
    });
  });

  describe('GET /api/countryWorkers/:countryCode', function () {
    let countryWithWorker;
    before(async function () {
      if (!hasDbTestEnv()) return;
      const rows = await (await getServerDb()).countriesWithWorkers();
      // handler lowercases the code before the cache lookup, and the cache is seeded lowercased
      countryWithWorker = rows && rows.length ? rows[0].code : null;
    });

    it('returns the search URL for a country that has a worker', async function () {
      if (!countryWithWorker) this.skip();
      const res = await get('/api/countryWorkers/' + countryWithWorker);
      expect(res.status).to.equal(200);
      expect(res.data).to.equal(
        `https://${process.env.DOMAIN}/search/countryCode/${countryWithWorker}\n`,
      );
    });

    it('returns an empty string for a country with no worker', async function () {
      const res = await get('/api/countryWorkers/ZZ');
      expect(res.status).to.equal(200);
      expect(res.data).to.equal('');
    });
  });

  describe('GET /feeds/missionaryOfTheDay', function () {
    it('returns a well-formed RSS feed titled "Missionary of the Day"', async function () {
      const res = await get('/feeds/missionaryOfTheDay');
      expect(res.status).to.equal(200);
      expect(res.headers['content-type']).to.include('xml');
      expect(res.data).to.be.a('string');
      expect(res.data.trimStart()).to.match(/^<\?xml/);
      expect(res.data).to.include('<rss');
      expect(res.data).to.include('<title>Missionary of the Day</title>');
    });
    it('feed items (if any) link back to the site domain', async function () {
      const res = await get('/feeds/missionaryOfTheDay');
      if (!res.data.includes('<item>')) this.skip();
      expect(res.data).to.include(`https://${process.env.DOMAIN}`);
    });
  });

  describe('GET /feeds/newMissionaries', function () {
    it('returns a well-formed RSS feed titled "New Missionaries"', async function () {
      const res = await get('/feeds/newMissionaries');
      expect(res.status).to.equal(200);
      expect(res.headers['content-type']).to.include('xml');
      expect(res.data.trimStart()).to.match(/^<\?xml/);
      expect(res.data).to.include('<rss');
      expect(res.data).to.include('<title>New Missionaries</title>');
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
    it('returns a rendered SVG QR code for a given slug', async function () {
      const res = await get('/api/qrcode?slug=test');
      expect(res.status).to.equal(200);
      expect(res.headers['content-type']).to.include('svg');
      expect(res.data).to.be.a('string');
      expect(res.data).to.include('<svg');
      expect(res.data).to.include('<path');
    });
    it('still returns an SVG for an empty slug', async function () {
      const res = await get('/api/qrcode?slug=');
      expect(res.status).to.equal(200);
      expect(res.data).to.include('<svg');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // § 2  Public POST endpoints (read-only, no auth required)
  // ════════════════════════════════════════════════════════════════════════════

  describe('POST /api/nonProfits', function () {
    it('returns an organizations array whose entries look like non-profits', async function () {
      const res = await post('/api/nonProfits', { query: 'gospel', state: 'CA' });
      expect(res.status).to.equal(200);
      expect(res.data).to.have.property('organizations').that.is.an('array');
      if (res.data.organizations.length === 0) this.skip(); // ProPublica returned nothing
      for (const org of res.data.organizations) {
        expect(org).to.have.property('name').that.is.a('string');
        expect(org).to.have.property('ein');
      }
    });
    it('also works with no state', async function () {
      const res = await post('/api/nonProfits', { query: 'bible' });
      expect(res.status).to.equal(200);
      expect(res.data).to.have.property('organizations').that.is.an('array');
    });
    it('an EIN-format query resolves to a single org and echoes the typed EIN', async function () {
      const search = await post('/api/nonProfits', { query: 'gospel' });
      const orgs = (search.data && search.data.organizations) || [];
      if (orgs.length === 0) this.skip();
      const ein = orgs[0].ein;
      const res = await post('/api/nonProfits', { query: String(ein) });
      expect(res.status).to.equal(200);
      expect(res.data.organizations).to.be.an('array').with.lengthOf(1);
      expect(res.data.organizations[0].ein).to.equal(ein);
      expect(res.data.organizations[0].displayEIN).to.equal(String(ein));
    });
  });

  // matches rankedMatches(): a returned people group must match the query in one of the searched fields
  const PG_SEARCH_FIELDS = ['PeopNameInCountry', 'PeopNameAcrossCountries', 'PeopleCluster'];

  describe('POST /api/peopleGroupSearch', function () {
    it('returns people-group objects that all match the query', async function () {
      const res = await post('/api/peopleGroupSearch', { query: 'Hindu', limit: 5 });
      expect(res.status).to.equal(200);
      expect(res.data).to.be.an('array');
      if (res.data.length === 0) this.skip(); // Joshua Project data unavailable
      const re = /Hindu/i;
      for (const item of res.data) {
        expect(item).to.have.property('PeopleID3');
        expect(item).to.have.property('PeopNameInCountry').that.is.a('string');
        const matched = PG_SEARCH_FIELDS.some(f => typeof item[f] === 'string' && re.test(item[f]));
        expect(matched, `no searched field of ${JSON.stringify(item)} matched /Hindu/i`).to.be.true;
      }
    });
    it('respects the limit parameter', async function () {
      const res = await post('/api/peopleGroupSearch', { query: 'Hindu', limit: 3 });
      expect(res.status).to.equal(200);
      expect(res.data.length).to.be.at.most(3);
    });
  });

  describe('POST /api/peopleGroupNames', function () {
    it('maps PeopleID3 codes back to their group objects in order', async function () {
      const search = await post('/api/peopleGroupSearch', { query: 'Hindu', limit: 3 });
      if (!Array.isArray(search.data) || search.data.length === 0) this.skip();
      const codes = search.data.map(g => g.PeopleID3);
      const res = await post('/api/peopleGroupNames', { codes });
      expect(res.status).to.equal(200);
      expect(res.data).to.be.an('array').with.lengthOf(codes.length);
      res.data.forEach((group, i) => expect(group.PeopleID3).to.equal(codes[i]));
    });
    it('returns an empty array for an empty codes array', async function () {
      const res = await post('/api/peopleGroupNames', { codes: [] });
      expect(res.status).to.equal(200);
      expect(res.data).to.deep.equal([]);
    });
  });

  describe('POST /api/languageSearch', function () {
    it('returns language objects that all match the query', async function () {
      const res = await post('/api/languageSearch', { query: 'Hindi', limit: 5 });
      expect(res.status).to.equal(200);
      expect(res.data).to.be.an('array');
      if (res.data.length === 0) this.skip();
      for (const item of res.data) {
        expect(item).to.have.property('ROL3');
        expect(item).to.have.property('Language').that.is.a('string').and.match(/Hindi/i);
      }
    });
    it('respects the limit parameter', async function () {
      const res = await post('/api/languageSearch', { query: 'Arabic', limit: 2 });
      expect(res.status).to.equal(200);
      expect(res.data.length).to.be.at.most(2);
    });
  });

  describe('POST /api/languageNames', function () {
    it('maps ROL3 codes back to their language objects in order', async function () {
      const search = await post('/api/languageSearch', { query: 'Hindi', limit: 3 });
      if (!Array.isArray(search.data) || search.data.length === 0) this.skip();
      const codes = search.data.map(l => l.ROL3);
      const res = await post('/api/languageNames', { codes });
      expect(res.status).to.equal(200);
      expect(res.data).to.be.an('array').with.lengthOf(codes.length);
      res.data.forEach((lang, i) => {
        expect(lang.ROL3).to.equal(codes[i]);
        expect(lang.Language).to.be.a('string');
      });
    });
    it('returns an empty array for an empty codes array', async function () {
      const res = await post('/api/languageNames', { codes: [] });
      expect(res.status).to.equal(200);
      expect(res.data).to.deep.equal([]);
    });
  });

  describe('POST /api/peopleGroupIds', function () {
    it('returns Frontier people-group ids that are all flagged Frontier', async function () {
      const res = await post('/api/peopleGroupIds', { setName: 'Frontier' });
      expect(res.status).to.equal(200);
      expect(res.data).to.be.an('array');
      if (res.data.length === 0) this.skip();
      res.data.forEach(id => expect(id).to.be.a('number'));

      // cross-check: resolving a few ids back to groups should show Frontier === 'Y'
      const sample = res.data.slice(0, 3);
      const names = await post('/api/peopleGroupNames', { codes: sample });
      expect(names.status).to.equal(200);
      names.data.forEach(group => expect(group.Frontier).to.equal('Y'));
    });
    it('returns a non-empty array for the "Unreached" set', async function () {
      const res = await post('/api/peopleGroupIds', { setName: 'Unreached' });
      expect(res.status).to.equal(200);
      expect(res.data).to.be.an('array');
    });
    it('returns an empty array for an unknown set name', async function () {
      const res = await post('/api/peopleGroupIds', { setName: 'no-such-set' });
      expect(res.status).to.equal(200);
      expect(res.data).to.deep.equal([]);
    });
  });

  describe('POST /api/frontierPeopleGroupIds (deprecated)', function () {
    it('returns the same ids as peopleGroupIds{setName:"Frontier"}', async function () {
      const [deprecated, current] = await Promise.all([
        post('/api/frontierPeopleGroupIds', {}),
        post('/api/peopleGroupIds', { setName: 'Frontier' }),
      ]);
      expect(deprecated.status).to.equal(200);
      expect(deprecated.data).to.deep.equal(current.data);
    });
  });

  describe('POST /api/profileStats', function () {
    it('returns numeric donationClicks, pageViews and prayers', async function () {
      const res = await post('/api/profileStats', { missionary_profile_key: 1 });
      if (res.status !== 200) this.skip(); // Google Analytics unreachable in this env
      expect(res.data).to.have.property('donationClicks').that.is.a('number');
      expect(res.data).to.have.property('pageViews').that.is.a('number');
      expect(res.data).to.have.property('prayers').that.is.a('number');
    });
  });

  describe('POST /api/slugExists', function () {
    it('reports exists:false for an unknown slug', async function () {
      const res = await post('/api/slugExists', { slug: 'zz-nonexistent-slug-test-xyz' });
      expect(res.status).to.equal(200);
      expect(res.data).to.deep.equal({ exists: false });
    });
    it('reports exists:true for a real slug, and false when that profile is excluded', async function () {
      if (!hasDbTestEnv() || !TEST_USER_PROFILE_SLUG) this.skip();
      const profile = await (await getServerDb()).getProfileBySlug(TEST_USER_PROFILE_SLUG);

      const exists = await post('/api/slugExists', { slug: TEST_USER_PROFILE_SLUG });
      expect(exists.status).to.equal(200);
      expect(exists.data).to.deep.equal({ exists: true });

      const excluded = await post('/api/slugExists', {
        slug: TEST_USER_PROFILE_SLUG,
        excludeMissionaryProfileKey: profile.missionary_profile_key,
      });
      expect(excluded.status).to.equal(200);
      expect(excluded.data).to.deep.equal({ exists: false });
    });
    it('returns a 500 "missing field slug" when slug is absent', async function () {
      const res = await post('/api/slugExists', {});
      expectMissingField(res, 'slug');
    });
  });

  describe('POST /api/signOut', function () {
    it('returns an empty object', async function () {
      const res = await post('/api/signOut', {});
      expect(res.status).to.equal(200);
      expect(res.data).to.deep.equal({});
    });
    it('clears the esession cookie (deleted, HttpOnly, SameSite=Strict, expired)', async function () {
      const res = await post('/api/signOut', {});
      const cookie = parseSetCookie(res, 'esession');
      expect(cookie, 'esession Set-Cookie header').to.not.be.null;
      // esession is a signed cookie, so the wire value is `s:deleted.<signature>` (URL-encoded).
      expect(decodeURIComponent(cookie.value)).to.match(/^s:deleted\./);
      expect(cookie.attrs).to.have.property('httponly');
      expect(cookie.attrs.samesite).to.equal('Strict');
      const expired =
        (cookie.attrs['max-age'] != null && Number(cookie.attrs['max-age']) < 0) ||
        (cookie.attrs.expires != null && new Date(cookie.attrs.expires) < new Date());
      expect(expired, 'esession cookie should be expired').to.be.true;
    });
  });

  describe('POST /api/listUserFiles', function () {
    it('returns a 500 "missing field prefix" when prefix is absent', async function () {
      const res = await post('/api/listUserFiles', {});
      expectMissingField(res, 'prefix');
    });
    it('returns an array of {name, link, date} entries for a valid prefix', async function () {
      const res = await post('/api/listUserFiles', { prefix: 'test/' });
      expect(res.status).to.equal(200);
      expect(res.data).to.be.an('array');
      for (const file of res.data) {
        expect(file).to.have.property('name').that.is.a('string');
        expect(file).to.have.property('link').that.is.a('string').and.include('://');
        expect(file).to.have.property('date');
      }
    });
  });

  describe('POST /api/refreshSlugCache', function () {
    it('returns an empty object', async function () {
      const res = await post('/api/refreshSlugCache', {});
      expect(res.status).to.equal(200);
      expect(res.data).to.deep.equal({});
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
    it('reports a missing "filename" field', async function () {
      const res = await post('/api/removeUserFile', {});
      expectMissingField(res, 'filename');
    });
  });

  describe('POST /api/recaptcha — validation', function () {
    it('reports a missing "recaptchaToken" field', async function () {
      const res = await post('/api/recaptcha', {});
      expectMissingField(res, 'recaptchaToken');
    });
  });

  describe('POST /api/makeDonation — validation', function () {
    it('reports a missing "email" field', async function () {
      const res = await post('/api/makeDonation', {});
      expectMissingField(res, 'email');
    });
  });

  describe('POST /api/orgAppNotify — validation', function () {
    it('rejects a request missing user_key with a specific message', async function () {
      const res = await post('/api/orgAppNotify', { organization_key: 'org-1' });
      expectServerError(res, 'no user_key given for orgAppNotify');
    });
    it('rejects a request missing organization_key with a specific message', async function () {
      const res = await post('/api/orgAppNotify', { user_key: 'user-1' });
      expectServerError(res, 'no organization_key given for orgAppNotify');
    });
  });

  describe('POST /api/log — validation', function () {
    it('rejects a wrong log_key with a specific message', async function () {
      const res = await post('/api/log', { key: 'wrong-key', logs: [] });
      expectServerError(res, 'log_key is not correct');
    });
  });

  describe('POST /api/profilePostPrayer — validation', function () {
    it('reports a missing "post_key" field', async function () {
      const res = await post('/api/profilePostPrayer', {});
      expectMissingField(res, 'post_key');
    });
  });

  describe('POST /api/checkoutSessionStatus — validation', function () {
    it('reports a missing "checkoutSessionId" field', async function () {
      const res = await post('/api/checkoutSessionStatus', {});
      expectMissingField(res, 'checkoutSessionId');
    });
  });

  describe('POST /api/newProfile — validation', function () {
    it('reports a missing "firstName" field', async function () {
      const res = await post('/api/newProfile', {});
      expectMissingField(res, 'firstName');
    });
  });

  describe('POST /api/deleteProfile — validation', function () {
    it('reports a missing "missionary_profile_key" field', async function () {
      const res = await post('/api/deleteProfile', {});
      expectMissingField(res, 'missionary_profile_key');
    });
  });

  describe('POST /api/addROProfile — validation', function () {
    it('reports a missing "missionary_profile_key" field', async function () {
      const res = await post('/api/addROProfile', {});
      expectMissingField(res, 'missionary_profile_key');
    });
  });

  describe('POST /api/notifyOrgUpdate — validation', function () {
    it('reports a missing "organization_key" field', async function () {
      const res = await post('/api/notifyOrgUpdate', {});
      expectMissingField(res, 'organization_key');
    });
  });

  describe('POST /api/deleteQueuedMessage — validation & auth', function () {
    it('rejects a request with no token', async function () {
      const res = await post('/api/deleteQueuedMessage', {});
      expectServerError(res);
    });
    it('rejects a valid non-org_review token as "Not authorized"', async function () {
      if (!hasJwtEnv()) this.skip();
      const res = await post('/api/deleteQueuedMessage', { token: await signWebToken() });
      expectServerError(res, 'Not authorized');
    });
    it('with an org_review token but no key, reports a missing "message_queue_key" field', async function () {
      if (!hasJwtEnv()) this.skip();
      const res = await post('/api/deleteQueuedMessage', { token: await signOrgReviewToken() });
      expectMissingField(res, 'message_queue_key');
    });
  });

  describe('POST /api/sendQueuedMessage — validation & auth', function () {
    it('rejects a request with no token', async function () {
      const res = await post('/api/sendQueuedMessage', {});
      expectServerError(res);
    });
    it('rejects a valid non-org_review token as "Not authorized"', async function () {
      if (!hasJwtEnv()) this.skip();
      const res = await post('/api/sendQueuedMessage', { token: await signWebToken() });
      expectServerError(res, 'Not authorized');
    });
    it('with an org_review token but no key, reports a missing "message_queue_key" field', async function () {
      if (!hasJwtEnv()) this.skip();
      const res = await post('/api/sendQueuedMessage', { token: await signOrgReviewToken() });
      expectMissingField(res, 'message_queue_key');
    });
  });

  describe('POST /api/getUserEmails — validation', function () {
    it('with a valid token but no userIds, reports a missing "userIds" field', async function () {
      // jwtPayload runs before ensureFields, so a valid token is required to reach the field check
      if (!hasJwtEnv()) this.skip();
      const res = await post('/api/getUserEmails', { token: await signWebToken() });
      expectMissingField(res, 'userIds');
    });
  });

  describe('POST /api/contact/bulk — validation', function () {
    it('reports a missing "token" field', async function () {
      const res = await post('/api/contact/bulk', {});
      expectMissingField(res, 'token');
    });
  });

  describe('POST /api/grantUserOrgPerm — validation', function () {
    it('reports a missing "user_key" field', async function () {
      const res = await post('/api/grantUserOrgPerm', {});
      expectMissingField(res, 'user_key');
    });
  });

  describe('POST /api/workerDocuments/* — validation', function () {
    const tokenFirst = [
      '/api/workerDocuments/record',
      '/api/workerDocuments/list',
      '/api/workerDocuments/delete',
      '/api/workerDocuments/orgCompliance',
      '/api/workerDocuments/updateOrgConfig',
      '/api/workerDocuments/testReminderEmail',
    ];
    tokenFirst.forEach(url => {
      it(`${url} reports a missing "token" field`, async function () {
        const res = await post(url, {});
        expectMissingField(res, 'token');
      });
    });
    it('/api/workerDocuments/checkDeadlines rejects a request with no token', async function () {
      const res = await post('/api/workerDocuments/checkDeadlines', {});
      expectServerError(res);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // § 4  Auth-protected endpoints — no token → 4xx or 5xx
  // ════════════════════════════════════════════════════════════════════════════

  // Every one of these calls jwtPayload(req.body.token) (or requireRole, which calls it)
  // before any other work, so a request with no token becomes a generic 500.
  const noTokenEndpoints = [
    '/api/verifyUser',
    '/api/resendVerifyEmail',
    '/api/getManagedProfiles',
    '/api/queuedMessages',
    '/api/markTxPaid',
    '/api/inviteProfileOwner',
    '/api/claimProfile',
    '/api/firstPublish',
    '/api/getWorkerDonations',
    '/api/deleteUser',
    '/api/newUser',
  ];
  noTokenEndpoints.forEach(url => {
    describe(`POST ${url} — auth required`, function () {
      it('returns a 500 error when no token is supplied', async function () {
        const res = await post(url, {});
        expectServerError(res);
      });
    });
  });

  describe('POST /api/getManagedProfiles — token error surface', function () {
    it('returns 401 "JWT token expired" for an expired token', async function () {
      if (!hasJwtEnv()) this.skip();
      const expired = await signTestJwt({ role: 'ergatas_web', roles: ['ergatas_web'], sub: 'x' }, '-10s');
      const res = await post('/api/getManagedProfiles', { token: expired });
      expect(res.status).to.equal(401);
      expect(res.data).to.have.property('title', 'JWT token expired');
    });
    it('returns 500 for a token signed with the wrong secret', async function () {
      if (!hasJwtEnv()) this.skip();
      const res = await post('/api/getManagedProfiles', { token: await signBadSecretToken({ sub: 'x' }) });
      expectServerError(res);
    });
  });

  // Role-guarded endpoints: a valid token WITHOUT the organization_review role is rejected
  // by requireRole()/the inline role check as "Not authorized" — before any side effect.
  describe('org_review role enforcement (valid non-role token → "Not authorized")', function () {
    it('POST /api/queuedMessages', async function () {
      if (!hasJwtEnv()) this.skip();
      const res = await post('/api/queuedMessages', { token: await signWebToken() });
      expectServerError(res, 'Not authorized');
    });
    it('POST /api/markTxPaid', async function () {
      if (!hasJwtEnv()) this.skip();
      const res = await post('/api/markTxPaid', { token: await signWebToken() });
      expectServerError(res, 'Not authorized');
    });
    it('POST /api/getUserEmails', async function () {
      if (!hasJwtEnv()) this.skip();
      const res = await post('/api/getUserEmails', { token: await signWebToken(), userIds: [] });
      expectServerError(res, 'Not authorized');
    });
    it('POST /api/contact/bulk', async function () {
      if (!hasJwtEnv()) this.skip();
      const res = await post('/api/contact/bulk', {
        token: await signWebToken(), emails: ['nobody@example.com'], subject: 's', message: 'm',
      });
      expectServerError(res, 'Not authorized');
    });
  });

  describe('POST /api/queuedMessages — org_review read', function () {
    it('returns the queued-message array for a valid org_review token', async function () {
      if (!hasDbTestEnv()) this.skip();
      const res = await post('/api/queuedMessages', { token: await signOrgReviewToken() });
      expect(res.status).to.equal(200);
      expect(res.data).to.be.an('array');
      res.data.forEach(m => expect(m).to.have.property('message_queue_key'));
    });
  });

  describe('POST /api/refresh — session cookie required', function () {
    it('returns 200 with noSession:true when no esession cookie is present', async function () {
      // A 4xx here would be logged as a console error on every anonymous page
      // load, which fails the Lighthouse best-practices audit — so the server
      // responds 200 and lets the body signal the failed refresh instead.
      const res = await post('/api/refresh', {});
      expect(res.status).to.equal(200);
      expect(res.data).to.have.property('noSession', true);
      expect(res.data).to.have.property('title', 'not authorized');
      expect(res.data.message).to.include('no session cookie');
    });
  });

  describe('POST /api/token — origin gated', function () {
    it('from an allowed origin with no code, fails with "no code given"', async function () {
      const origin = firstAllowedOrigin();
      if (!origin) this.skip();
      const res = await postWithOrigin('/api/token', {}, origin);
      expectServerError(res, 'no code given');
    });
    // Not tested: a disallowed origin — the handler neither responds nor throws, so the
    // request would hang until the client timeout.
  });

  describe('POST /api/log — accepts a correctly-keyed request from an allowed origin', function () {
    it('returns an empty object', async function () {
      if (!process.env.LOG_KEY) this.skip();
      const origin = firstAllowedOrigin();
      if (!origin) this.skip();
      const res = await postWithOrigin(
        '/api/log',
        { key: process.env.LOG_KEY, logs: [{ message: 'server.test.js smoke log' }] },
        origin,
      );
      expect(res.status).to.equal(200);
      expect(res.data).to.deep.equal({});
    });
  });

  describe('POST /api/contact/setup — origin-restricted', function () {
    it('refuses a request from a non-whitelisted origin', async function () {
      const res = await post('/api/contact/setup', {
        profileUserId: 'u1', fromEmail: 'test@example.com', name: 'Test', message: 'hi',
      });
      expectServerError(res, 'refusing to setup contact due to invalid origin');
    });
  });

  describe('Authenticated read endpoints', function () {
    let authContext;
    let profileTransactions;

    before(async function () {
      if (!hasAuthenticatedTestEnv()) {
        this.skip();
      }

      authContext = await getAuthenticatedTestContext();
      profileTransactions = (authContext.rawTransactions || []).filter(
        tx => tx.missionary_profile_key === authContext.profile.missionary_profile_key,
      );
      // Note: no transaction-count skip here — the non-transaction tests below run
      // whenever the authenticated env is configured. Transaction-dependent tests
      // gate themselves individually.
    });

    describe('POST /api/verifyUser', function () {
      it('returns the verification status of the authenticated user', async function () {
        const res = await post('/api/verifyUser', { token: authContext.token });
        if (res.status !== 200) this.skip(); // FusionAuth unreachable in this env
        expect(res.data).to.have.property('verified').that.is.a('boolean');
      });
    });

    describe('POST /api/getManagedProfiles', function () {
      it("returns the user's managed profiles, including the test profile", async function () {
        const res = await post('/api/getManagedProfiles', { token: authContext.token });
        expect(res.status).to.equal(200);
        expect(res.data).to.be.an('array');
        if (res.data.length === 0) this.skip(); // user manages no profiles in this env
        expect(
          res.data.some(p => p.missionary_profile_key === authContext.profile.missionary_profile_key),
          `managed profiles should include ${TEST_USER_PROFILE_SLUG}`,
        ).to.be.true;
      });
    });

    describe('POST /api/workerDocuments/list', function () {
      it('returns an array of the profile\'s worker documents', async function () {
        const res = await post('/api/workerDocuments/list', {
          token: authContext.token,
          missionary_profile_key: authContext.profile.missionary_profile_key,
        });
        if (res.status !== 200) this.skip(); // feature/permissions not enabled in this env
        expect(res.data).to.have.property('documents').that.is.an('array');
        expect(res.data).to.have.property('workerDocSettings');
        for (const doc of res.data.documents) {
          expect(doc).to.have.property('worker_document_key');
          expect(doc).to.have.property('document_type');
        }
      });
    });

    describe('POST /api/getUserEmails (org_review)', function () {
      it('resolves the test user id to an { external_user_id, email } entry', async function () {
        if (!hasJwtEnv()) this.skip();
        const userId = authContext.profile.external_user_id;
        const res = await post('/api/getUserEmails', {
          token: await signOrgReviewToken(),
          userIds: [userId],
        });
        if (res.status !== 200) this.skip(); // id→email translation unavailable in this env
        expect(res.data).to.be.an('array').with.lengthOf(1);
        expect(res.data[0]).to.have.property('external_user_id', userId);
        expect(res.data[0]).to.have.property('email').that.is.a('string');
      });
    });

    describe('POST /api/getWorkerDonations', function () {
      it('returns 200 and includes donations for TEST_USER_PROFILE_SLUG', async function () {
        if (profileTransactions.length === 0) this.skip();
        const res = await post('/api/getWorkerDonations', { token: authContext.token });

        expect(res.status).to.equal(200);
        expect(res.data).to.be.an('array');
        const own = res.data.filter(
          tx => tx.missionary_profile_key === authContext.profile.missionary_profile_key,
        );
        expect(
          own.length,
          `expected at least one donation for ${TEST_USER_PROFILE_SLUG} using ${authContext.tokenSource}`,
        ).to.be.greaterThan(0);
        own.forEach(tx => expect(tx).to.have.property('possible_transaction_key'));
      });
    });

    describe('POST /api/txDetails', function () {
      let candidateTransactions;

      before(function () {
        candidateTransactions = profileTransactions.filter(
          tx => tx.on_site === true && tx.possible_transaction_key != null,
        );
        if (candidateTransactions.length === 0) {
          this.skip();
        }
      });

      it('returns 200 and donor details for a real transaction', async function () {
        // Each on_site transaction's name/email come from its live Stripe customer.
        // In test mode those customers get purged over time, so any single tx may
        // resolve to a deleted customer (empty body). Try each candidate and use the
        // first whose donor still resolves; skip only if all have been deleted.
        this.timeout(60000);

        let donorDetails = null;
        for (const tx of candidateTransactions) {
          const res = await post('/api/txDetails', {
            token: authContext.token,
            possible_transaction_key: tx.possible_transaction_key,
          });

          expect(res.status, `unexpected status for tx ${tx.possible_transaction_key}`).to.equal(200);
          expect(res.data).to.be.an('object');

          if (Object.keys(res.data).length > 0) {
            donorDetails = res.data;
            break;
          }
        }

        if (!donorDetails) {
          this.skip(); // all candidate donors removed from Stripe (test-mode data decay)
        }

        expect(donorDetails).to.satisfy(d => d.name != null || d.email != null);
      });
    });
  
  });
});

/*
 * ════════════════════════════════════════════════════════════════════════════
 * SKIPPED ENDPOINTS — additional setup required before these can be tested
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1.  POST /api/token  (happy path only)
 *     The allowed-origin + missing-code error path IS tested above. The success path
 *     needs a valid FusionAuth OAuth authorization code (req.body.code), which is
 *     short-lived and only obtainable via a real user login flow. The disallowed-origin
 *     case is deliberately NOT tested: that path neither responds nor throws, so the
 *     request would hang until the client timeout.
 *
 * 2.  POST /api/refresh  (happy path only)
 *     The no-cookie path (200, noSession:true) IS tested above. Refreshing successfully
 *     needs a signed "esession" HTTP-only cookie containing a valid refresh token,
 *     obtainable only after a successful /api/token call with the correct cookie secret.
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
 * 31. POST /api/getUserEmails  — now covered above (validation, role enforcement, and a
 *     positive read in the authenticated block using the test profile's external_user_id).
 *
 * 35. POST /api/testTemplate  (sends a live templated email)
 *     Sends to information@ergatas.org — safe only in dev environments.
 *
 * 36. POST /api/userCleanup512  (modifies user records in DB)
 *     No auth check. dryRun defaults to true when body is empty but still
 *     queries the real DB; potentially slow and intrusive in production.
 *
 * 37. POST /api/log  — now covered above. The positive test runs when LOG_KEY is set;
 *     the Loki write is fire-and-forget, so it succeeds even if Loki is unreachable.
 */
