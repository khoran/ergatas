// ============================================================================
// Grantee organization lookup for the grant forms.
//
// The grant forms populate their "organization" field from the existing
// web.non_profits table (exposed via web.non_profits_view, which ergatas_server
// may read). Server-mediated so the client never queries the table directly.
// ============================================================================
import { getServerDB, jwtPayload } from '../utils.js';

/** List non-profits for the org dropdown (id, name, location). */
export async function listNonProfits(token) {
    await jwtPayload(token); // require an authenticated caller
    const db = await getServerDB(); // default 'web' schema (no grants profile header)
    return db.grants.listGrantNonProfits();
}

/**
 * The organization(s) a signed-in grantee may accept an agreement for, as
 * non_profits rows (same shape as listNonProfits). Resolution order:
 *   1. organizations the user manages (their permission row's filter names
 *      organization_keys, and their access is not read-only);
 *   2. otherwise, the organizations set on the worker profiles they can WRITE:
 *      profiles they own, plus profiles shared with them via the filter's
 *      missionary_profile_keys list (ro_profile_keys are read-only — excluded).
 * One org → the UI auto-selects it; several → the UI offers just that list;
 * empty → the caller decides the fallback.
 */
export async function granteeOrgOptions(token) {
    const payload = await jwtPayload(token);
    const db = await getServerDB();

    const perm = await db.getUserOrgSearchFilter(payload.sub);   // singleOrNone
    const filter = (perm && !perm.read_only && perm.search_filter) || {};

    // 1) full organization manager
    let orgKeys = [...new Set((filter.organization_keys || []).map(Number))];

    // 2) orgs from writable worker profiles (owned + write-shared)
    if (orgKeys.length === 0) {
        const owned = await db.grants.listProfileOrgKeysByUser(payload.sub) || [];
        const sharedKeys = filter.missionary_profile_keys || [];
        const shared = sharedKeys.length
            ? (await db.grants.listProfileOrgKeysByProfileKeys(sharedKeys) || []) : [];
        orgKeys = [...new Set([...owned, ...shared].map(p => Number(p.organization_key)).filter(k => k > 0))];
    }
    if (orgKeys.length === 0) return [];

    const orgs = await db.grants.listOrganizationNonProfitKeys(orgKeys) || [];
    const npKeys = new Set(orgs.map(o => o.non_profit_key));
    const nonProfits = await db.grants.listGrantNonProfits();
    return nonProfits.filter(np => npKeys.has(np.non_profit_key));
}
