-- ============================================================================
-- Foreign Grant Compliance — OFAC list ingestion + matching (Phase 1)
--
-- grants.ofac_list_entries holds the ingested sanctions list data (OFAC SDN +
-- Non-SDN Consolidated). This is reference data, refreshed on a schedule — it is
-- intentionally NOT write-once. Each ingest stamps a `list_version` so every
-- screening can record exactly which list snapshot it was checked against.
--
-- Matching is name-variant tolerant via pg_trgm: every name variant (primary +
-- each AKA) is stored as its own row with a normalized form, and grants.match_ofac
-- returns trigram-similar candidates for a query name.
-- ============================================================================

-- Normalize a name for fuzzy matching: lowercase, drop punctuation, collapse ws.
CREATE OR REPLACE FUNCTION grants.normalize_name(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT trim(regexp_replace(regexp_replace(lower(coalesce(p,'')), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))
$$;

CREATE TABLE IF NOT EXISTS grants.ofac_list_entries (
    entry_key        bigserial    PRIMARY KEY,
    list_name        text         NOT NULL,                 -- 'SDN' | 'CONSOLIDATED'
    list_version     text         NOT NULL,                 -- publication date/version
    ent_num          text         NOT NULL,                 -- OFAC entity number
    name             text         NOT NULL,                 -- this name variant
    normalized_name  text         NOT NULL,                 -- grants.normalize_name(name)
    name_kind        text         NOT NULL DEFAULT 'primary' CHECK (name_kind IN ('primary','aka')),
    entity_type      text,                                  -- individual | entity | vessel | aircraft
    programs         text[]       NOT NULL DEFAULT '{}',
    country          text,
    raw              jsonb        NOT NULL DEFAULT '{}'::jsonb,
    created_on       timestamptz  NOT NULL DEFAULT now()
);
ALTER TABLE grants.ofac_list_entries OWNER TO ergatas_dev;

-- Trigram index for fuzzy name search.
CREATE INDEX IF NOT EXISTS idx_ofac_entries_norm_trgm
    ON grants.ofac_list_entries USING gin (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ofac_entries_list ON grants.ofac_list_entries(list_name, list_version);

GRANT SELECT, INSERT, DELETE ON grants.ofac_list_entries TO ergatas_server;
GRANT USAGE, SELECT ON SEQUENCE grants.ofac_list_entries_entry_key_seq TO ergatas_server;

-- View (see sql/40-grants.sql): the app reaches this table only through the view.
CREATE OR REPLACE VIEW grants.ofac_list_entries_view WITH (security_invoker = true) AS
    SELECT * FROM grants.ofac_list_entries;
ALTER VIEW grants.ofac_list_entries_view OWNER TO ergatas_dev;
GRANT SELECT, INSERT, DELETE ON grants.ofac_list_entries_view TO ergatas_server;

-- Return candidate sanctions hits for a query name, most-similar first.
-- threshold: minimum trigram similarity (0..1). Caller decides clear vs. potential.
CREATE OR REPLACE FUNCTION grants.match_ofac(p_query text, p_threshold real DEFAULT 0.45)
RETURNS TABLE (
    ent_num     text,
    name        text,
    list_name   text,
    entity_type text,
    programs    text[],
    country     text,
    score       real
)
LANGUAGE sql STABLE
AS $$
    SELECT e.ent_num, e.name, e.list_name, e.entity_type, e.programs, e.country,
           similarity(e.normalized_name, grants.normalize_name(p_query)) AS score
    FROM grants.ofac_list_entries e
    WHERE similarity(e.normalized_name, grants.normalize_name(p_query)) >= p_threshold
    ORDER BY score DESC
    LIMIT 25
$$;

-- Expose the matcher to the server role (called via PostgREST RPC).
GRANT EXECUTE ON FUNCTION grants.match_ofac(text, real) TO ergatas_server;
GRANT EXECUTE ON FUNCTION grants.normalize_name(text) TO ergatas_server;
