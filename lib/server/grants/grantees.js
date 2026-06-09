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
    return db.dbAuthGet('/non_profits_view?select=non_profit_key,registered_name,country_code,city,state&order=registered_name');
}
