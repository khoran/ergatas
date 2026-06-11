// Picks a random approved organization suitable for the profile-creation test.
//
// The org list is served from the same public PostgREST view the app's org
// selectize reads (non_profit_and_organizations_view). A "viable" org is one
// where the worker's donation URL will actually be required and validated:
//
//   - no stripe_account  → the donation-URL field is shown and required
//                          (donationURLRequired() is false when stripe is set)
//   - a real http(s) website
//   - the website's root domain matches one of the org's approved donation
//     domains, so the org's website itself is a valid ("correct") donation URL
//     — matching the task's "correct URL is the organization's website".
import axios from 'axios';

const PG_BASE = process.env.POSTGREST_URL_BASE; // e.g. https://home.ergatas.org/db

// Mirrors urlRootDomain() in lib/client/ko-common.js — the last two dotted labels.
function rootDomain(urlStr) {
  try {
    return new URL(urlStr).hostname.replace(/^.*?([a-zA-Z0-9-]+\.[a-zA-Z0-9-]+)$/, '$1');
  } catch {
    return null;
  }
}

export async function pickRandomOrg() {
  const res = await axios.get(
    PG_BASE + '/non_profit_and_organizations_view?status=eq.approved',
  );
  const all = res.data;

  const viable = all.filter((org) => {
    if (org.stripe_account) return false;
    if (!org.website || !/^https?:\/\//i.test(org.website)) return false;
    const websiteRoot = rootDomain(org.website);
    if (!websiteRoot) return false;
    // If the org defines no donation_urls the app defaults to [{website, domain}],
    // so the website is always an approved domain. Otherwise require an explicit
    // domain-match entry that shares the website's root.
    const urls =
      org.donation_urls && org.donation_urls.length
        ? org.donation_urls
        : [{ url: org.website, match_type: 'domain' }];
    return urls.some((u) => u.match_type === 'domain' && rootDomain(u.url) === websiteRoot);
  });

  if (viable.length === 0) throw new Error('no viable approved organization found for test');

  const org = viable[Math.floor(Math.random() * viable.length)];
  const websiteRoot = rootDomain(org.website);

  return {
    organization_key: org.organization_key,
    name: org.name,
    display_name: (org.display_name || org.name).trim(),
    website: org.website,
    websiteRoot,
    // A donation URL on the org's own domain → passes validation.
    correctDonationUrl: org.website.replace(/\/+$/, '') + '/donate',
    // A donation URL on an unrelated domain → fails the hostname-match check.
    wrongDonationUrl: 'https://not-the-org-domain-' + websiteRoot.replace(/\./g, '-') + '.example.com/donate',
  };
}

// Picks a currently-published worker whose organization has a Stripe Connect
// connected account (non_profits.stripe_account is set). Donations to such a
// worker run against the connected account, so this is what exercises the
// Stripe-Account header path (getConnectedAccountHeader / makeDonation).
//
// Prefers a profile whose slug looks like a test/load-test account so the test
// never donates to a real person's page.
export async function pickConnectedAccountWorker() {
  // 1. Approved orgs that have a connected Stripe account.
  const orgsRes = await axios.get(
    PG_BASE +
      '/non_profit_and_organizations_view?status=eq.approved&stripe_account=neq.' +
      '&select=organization_key,name,display_name,stripe_account',
  );
  const orgs = orgsRes.data;
  if (orgs.length === 0)
    throw new Error('no approved organization with a stripe_account found');

  const orgKeys = orgs.map((o) => o.organization_key);

  // 2. A currently-published worker under one of those orgs. profile_search
  //    already restricts to published, non-disabled/blocked profiles.
  const profRes = await axios.get(
    PG_BASE +
      `/profile_search?data->>organization_key=in.(${orgKeys.join(',')})&state=eq.current` +
      '&select=profile_slug,missionary_name,organization_display_name,organization_key:data->>organization_key',
  );
  const profiles = profRes.data;
  if (profiles.length === 0)
    throw new Error('no published worker found under a stripe_account organization');

  const worker = profiles.find((p) => /test/i.test(p.profile_slug)) || profiles[0];
  const org = orgs.find((o) => o.organization_key === Number(worker.organization_key));

  return {
    profile_slug: worker.profile_slug,
    missionary_name: worker.missionary_name,
    organization_display_name: (worker.organization_display_name || '').trim(),
    organization_key: Number(worker.organization_key),
    stripe_account: org && org.stripe_account,
  };
}
