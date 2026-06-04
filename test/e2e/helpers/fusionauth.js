// Thin wrapper around the FusionAuth admin API for e2e test setup/teardown.
//
// The shared API key in .env (FUSION_USER_INFO_KEY) is scoped to a handful of
// user endpoints — it can GET/PATCH/DELETE a user but CANNOT create one or run a
// search query. So tests create users through the FusionAuth hosted registration
// page (a real browser flow) and use these helpers only to look up, mark verified,
// and hard-delete the created user.
import axios from 'axios';

const base   = process.env.FUSION_BASE_URL;
const apiKey = process.env.FUSION_USER_INFO_KEY;
const tenant = process.env.AUTH_TENANT_ID;

function request(method, path, data) {
  return axios({
    method,
    url: base + path,
    data,
    headers: {
      Authorization: apiKey,
      'X-FusionAuth-TenantId': tenant,
    },
  });
}

// Returns the FusionAuth user object, or null if no user exists with that email.
// (The scoped key allows GET /api/user?email= but not /api/user/search.)
export async function getUserByEmail(email) {
  try {
    const res = await request('GET', '/api/user?email=' + encodeURIComponent(email));
    return res.data.user;
  } catch (error) {
    if (error.response && error.response.status === 404) return null;
    return null;
  }
}

// Hard-deletes the user with the given email if one exists. Safe to call when no
// such user exists. Used for "delete first if already exists" setup and as an
// afterAll safety net so failed runs don't leave orphaned auth users behind.
export async function deleteUserByEmail(email) {
  const user = await getUserByEmail(email);
  if (!user) return false;
  await request('DELETE', '/api/user/' + user.id + '?hardDelete=true');
  return true;
}

// Marks the user's email as verified in FusionAuth (the "manually set email to
// verified" step).
//
// The user-level `verified` flag is managed by FusionAuth and can't be set via a
// plain PATCH/PUT, so we drive the real verification flow instead:
//   1. PUT /api/user/verify-email (with the API key) — generates a verification
//      and, because the tenant uses the FormField strategy, returns the
//      oneTimeCode + verificationId in the response instead of only emailing it.
//   2. POST /api/user/verify-email — the public completion endpoint the user's
//      email link would hit; needs no API key, just the code + id.
export async function setEmailVerified(email) {
  const user = await getUserByEmail(email);
  if (!user) throw new Error('cannot verify — no FusionAuth user with email ' + email);

  const { data } = await request('PUT', '/api/user/verify-email?email=' + encodeURIComponent(email));
  if (!data || !data.verificationId) {
    throw new Error('verify-email did not return a verificationId — check tenant verification strategy');
  }

  await axios({
    method: 'POST',
    url: base + '/api/user/verify-email',
    headers: { 'X-FusionAuth-TenantId': tenant },
    data: { oneTimeCode: data.oneTimeCode, verificationId: data.verificationId },
  });

  return user.id;
}
