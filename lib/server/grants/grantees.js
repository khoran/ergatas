// ============================================================================
// Grantee organization lookup for the grant forms.
//
// The grant forms populate their "organization" field from the existing
// web.non_profits table (exposed via web.non_profits_view, which ergatas_server
// may read). Server-mediated so the client never queries the table directly.
// ============================================================================
import { getServerDB, jwtPayload } from '../utils.js';
import { AppError } from '../app-error.js';

/** List non-profits for the org dropdown (id, name, location). */
export async function listNonProfits(token) {
    await jwtPayload(token); // require an authenticated caller
    const db = await getServerDB(); // default 'web' schema (no grants profile header)
    return db.grants.listGrantNonProfits();
}

/**
 * The organization(s) a signed-in user may act for as a grantee — sign the grant
 * agreement and file salary-use reports — as non_profits rows (same shape as
 * listNonProfits). Only non-profits where the user is a profile manager (a
 * non-read-only permission on one of its organization listings) qualify.
 * One org → the UI auto-selects it; several → the UI offers just that list.
 */
export async function granteeOrgOptions(token) {
    const payload = await jwtPayload(token);
    const db = await getServerDB();
    const managed = await db.grants.listManagedGranteeOrgs(payload.sub) || [];
    const names = new Set(managed.map(m => m.grantee_org));
    if (names.size === 0) return [];
    const nonProfits = await db.grants.listGrantNonProfits() || [];
    return nonProfits.filter(np => names.has(np.registered_name));
}

/**
 * Throws unless the caller is a profile manager of `granteeOrg` (see
 * granteeOrgOptions). Guards every write a grantee makes for an organization.
 */
export async function requireGranteeOrg(token, granteeOrg) {
    const orgs = await granteeOrgOptions(token);
    if (!granteeOrg || !orgs.some(np => np.registered_name === granteeOrg))
        throw new AppError('you are not a profile manager of "' + (granteeOrg || '') +
            '", so you cannot act for it on grant agreements or reports');
}
