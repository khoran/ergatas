// ============================================================================
// OFAC sanctions-list ingestion + name screening (Phase 1).
//
// Ingests OFAC's downloadable data files (SDN + Non-SDN Consolidated) into
// grants.ofac_list_entries, stamped with a list_version, and screens names with
// trigram fuzzy matching (grants.match_ofac). The public OFAC *web search* tool
// is not for automated use; this uses the downloadable data files.
//
// Screening is name-variant tolerant but conservative: it surfaces candidate
// hits for a human to disposition. The immutable grants.ofac_screening record
// itself is written through lib/server/grants/records.js.
// ============================================================================
import axios from 'axios';
import { getServerDB } from '../utils.js';

const GRANTS_HEADERS = { 'Content-Profile': 'grants', 'Accept-Profile': 'grants' };

// Default OFAC data-file URLs (overridable via env for testing/mirrors).
const SDN_CSV_URL = process.env.OFAC_SDN_CSV_URL || 'https://www.treasury.gov/ofac/downloads/sdn.csv';
const SDN_ALT_URL = process.env.OFAC_SDN_ALT_URL || 'https://www.treasury.gov/ofac/downloads/alt.csv';
const CONS_CSV_URL = process.env.OFAC_CONS_CSV_URL || 'https://www.treasury.gov/ofac/downloads/consolidated/cons_prim.csv';
const CONS_ALT_URL = process.env.OFAC_CONS_ALT_URL || 'https://www.treasury.gov/ofac/downloads/consolidated/cons_alt.csv';

// ---- CSV parsing -------------------------------------------------------------
// Minimal RFC-4180-ish parser: handles quoted fields and embedded commas.
export function parseCsvLine(line) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
            if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (c === '"') inQ = false;
            else cur += c;
        } else if (c === '"') inQ = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
    }
    out.push(cur);
    // OFAC uses "-0-" for empty fields.
    return out.map(f => { const t = f.trim(); return t === '-0-' ? '' : t; });
}

const splitPrograms = p => (p ? p.split(';').map(s => s.trim()).filter(Boolean) : []);

// SDN.CSV / cons_prim.csv: ent_num, name, sdn_type, program, title, ...
export function parseSdnCsv(text) {
    const rows = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const f = parseCsvLine(line);
        if (!f[0] || !f[1]) continue;
        const type = (f[2] || '').toLowerCase();
        rows.push({
            ent_num: f[0], name: f[1], name_kind: 'primary',
            entity_type: type === 'individual' ? 'individual' : (type || 'entity'),
            programs: splitPrograms(f[3]),
        });
    }
    return rows;
}

// ALT.CSV / cons_alt.csv: ent_num, alt_num, alt_type, alt_name, remarks
export function parseAltCsv(text) {
    const rows = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const f = parseCsvLine(line);
        if (!f[0] || !f[3]) continue;
        rows.push({ ent_num: f[0], name: f[3], name_kind: 'aka', entity_type: null, programs: [] });
    }
    return rows;
}

// ---- Ingestion ---------------------------------------------------------------
/**
 * Replace all entries for a list with a freshly parsed set (one row per name
 * variant), stamped with list_version. Reference data — not write-once.
 */
export async function ingestList({ listName, listVersion, primaryCsv, altCsv }) {
    const entries = [
        ...parseSdnCsv(primaryCsv || ''),
        ...parseAltCsv(altCsv || ''),
    ];
    if (entries.length === 0) throw new Error('OFAC ingest: parsed 0 entries for ' + listName);

    const db = await getServerDB();
    // Swap atomically-ish: delete old version rows, insert new.
    await db.dbAuthDelete('/ofac_list_entries_view?list_name=eq.' + encodeURIComponent(listName), null, GRANTS_HEADERS);

    const rows = entries.map(e => ({
        list_name: listName, list_version: listVersion,
        ent_num: e.ent_num, name: e.name, name_kind: e.name_kind,
        entity_type: e.entity_type, programs: e.programs, country: e.country || null,
        // normalized_name is set by the DB? No — set it here to match the column.
        normalized_name: normalizeName(e.name),
        raw: e.raw || {},
    }));
    // Insert in batches to keep request sizes sane.
    for (let i = 0; i < rows.length; i += 1000) {
        await db.dbAuthPost('/ofac_list_entries_view', rows.slice(i, i + 1000), GRANTS_HEADERS);
    }
    return { listName, listVersion, count: rows.length };
}

// Mirror of grants.normalize_name (kept in sync for client-side inserts).
export function normalizeName(p) {
    return (p || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Download + ingest both OFAC lists. Returns per-list ingest summaries. */
export async function refreshOfacLists() {
    const version = new Date().toISOString().slice(0, 10); // publication snapshot date
    const get = async url => (await axios.get(url, { responseType: 'text', timeout: 60000 })).data;
    const results = [];
    const [sdn, sdnAlt] = await Promise.all([get(SDN_CSV_URL), get(SDN_ALT_URL)]);
    results.push(await ingestList({ listName: 'SDN', listVersion: version, primaryCsv: sdn, altCsv: sdnAlt }));
    const [cons, consAlt] = await Promise.all([get(CONS_CSV_URL), get(CONS_ALT_URL)]);
    results.push(await ingestList({ listName: 'CONSOLIDATED', listVersion: version, primaryCsv: cons, altCsv: consAlt }));
    return results;
}

// ---- Screening ---------------------------------------------------------------
/** The list version currently loaded (max across lists), for recording on a screen. */
export async function currentListVersion() {
    const db = await getServerDB();
    const rows = await db.dbAuthGet('/ofac_list_entries_view?select=list_name,list_version&order=list_version.desc&limit=1', GRANTS_HEADERS);
    return (rows && rows[0] && rows[0].list_version) || null;
}

/** Fuzzy-match a single name against the loaded lists. */
export async function matchName(name, threshold = 0.45) {
    const db = await getServerDB();
    return db.dbAuthPost('/rpc/match_ofac', { p_query: name, p_threshold: threshold }, GRANTS_HEADERS);
}

/**
 * Screen a set of targets (preview, no record written). Each target may carry
 * name variants; the strongest hit across its names drives its auto-result.
 * Returns per-target candidates for the UI to disposition.
 */
export async function screenTargets(targets, threshold = 0.45) {
    const out = [];
    for (const t of targets || []) {
        const names = [t.name, ...(t.name_variants || [])].filter(Boolean);
        let matches = [];
        for (const n of names) {
            const hits = await matchName(n, threshold);
            matches = matches.concat((hits || []).map(h => ({ ...h, matched_query: n })));
        }
        matches.sort((a, b) => b.score - a.score);
        out.push({
            name: t.name, role: t.role || null, type: t.type || 'org',
            name_variants: t.name_variants || [],
            // auto-suggested result; staff confirms/dispositions in the UI
            auto_result: matches.length ? 'potential_match' : 'clear',
            matches,
        });
    }
    return out;
}
