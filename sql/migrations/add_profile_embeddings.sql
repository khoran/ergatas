-- Profile embeddings for semantic "Similar Workers" search.
--
-- Stores one pgvector embedding per missionary profile (generated server-side
-- from web.profile_embedding_text via Voyage AI) and exposes a versioned
-- nearest-neighbour RPC. Idempotent: safe to run on an existing database.
--
-- Roles follow the existing conventions in 20-views.sql:
--   * read RPCs are SECURITY DEFINER owned by ergatas_web (callable by the
--     PostgREST anon/web role, like web.primary_search_v4)
--   * write happens only through the server (ergatas_server role)

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS web.profile_embeddings(
    missionary_profile_key int PRIMARY KEY
        REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    embedding vector(1024) NOT NULL,
    updated_on timestamp NOT NULL DEFAULT now()
);
ALTER TABLE web.profile_embeddings OWNER TO ergatas_dev;
GRANT SELECT ON web.profile_embeddings TO ergatas_web, ergatas_server, stats;
GRANT INSERT, UPDATE, DELETE ON web.profile_embeddings TO ergatas_server;

-- cosine-distance ANN index (matches the <=> operator used below)
CREATE INDEX IF NOT EXISTS profile_embeddings_hnsw
    ON web.profile_embeddings USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- profile_embedding_text is owned by ergatas_dev (see below) so it can read
-- the RLS-protected missionary_profiles; it also needs to read the org view,
-- which is owned by ergatas_view_owner.
GRANT SELECT ON web.non_profit_and_organizations_view TO ergatas_dev;

-- profile_embedding_text: the plain-text representation of a profile that gets
-- embedded. Mirrors the field set aggregated by web.profile_fts_trigger
-- (sql/25-full_text_search.sql): name/location/country, marital status,
-- description, search_terms, resolved job-category / cause / tag labels, and
-- the organization name/dba/description. Kept as one reusable function so the
-- server and the backfill script embed identical text.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION web.profile_embedding_text(p_key int)
RETURNS text AS $func$
    SELECT concat_ws(' ',
        mp.data->>'first_name',
        mp.data->>'last_name',
        mp.data->>'location',
        mp.data->>'country',
        mp.data->>'marital_status',
        mp.data->>'description',
        mp.data->>'search_terms',
        (SELECT string_agg(jc.catagory, ' ')
           FROM web.job_catagories jc
           JOIN jsonb_array_elements(mp.data->'job_catagory_keys') AS t
             ON ((t.value->>0)::int = jc.job_catagory_key)),
        (SELECT string_agg(c.cause, ' ')
           FROM web.causes c
           JOIN jsonb_array_elements(mp.data->'cause_keys') AS t
             ON ((t.value->>0)::int = c.cause_key)),
        (SELECT string_agg(tg.name, ' ')
           FROM web.tags tg
           JOIN jsonb_array_elements(mp.data->'tag_keys') AS t
             ON ((t.value->>0)::int = tg.tag_key)),
        o.name, o.dba_name, o.description
    )
    FROM web.missionary_profiles mp
    LEFT JOIN web.non_profit_and_organizations_view o
        ON (o.organization_key = (mp.data->>'organization_key')::int)
    WHERE mp.missionary_profile_key = p_key;
$func$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = web, public;
-- Owned by ergatas_dev so it can read web.missionary_profiles, which has RLS
-- enabled (ergatas_view_owner sees zero rows there). ergatas_dev is the table
-- owner and bypasses RLS, the same way web.base_profile_search does.
ALTER FUNCTION web.profile_embedding_text(int) OWNER TO ergatas_dev;
REVOKE EXECUTE ON FUNCTION web.profile_embedding_text(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION web.profile_embedding_text(int) TO ergatas_server;

-- ---------------------------------------------------------------------------
-- upsert_profile_embedding: server-only write path. The embedding is passed as
-- a pgvector text literal (e.g. '[0.12,-0.34,...]') to avoid JSON<->vector
-- serialization ambiguity through PostgREST.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION web.upsert_profile_embedding(p_key int, p_embedding text)
RETURNS void AS $func$
    INSERT INTO web.profile_embeddings(missionary_profile_key, embedding, updated_on)
    VALUES (p_key, p_embedding::vector, now())
    ON CONFLICT (missionary_profile_key)
    DO UPDATE SET embedding = EXCLUDED.embedding, updated_on = now();
$func$ LANGUAGE SQL SECURITY DEFINER SET search_path = web, public;
ALTER FUNCTION web.upsert_profile_embedding(int, text) OWNER TO ergatas_dev;
REVOKE EXECUTE ON FUNCTION web.upsert_profile_embedding(int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION web.upsert_profile_embedding(int, text) TO ergatas_server;

-- ---------------------------------------------------------------------------
-- similar_profiles_v1: nearest published/current profiles to a target profile
-- by cosine distance. Versioned by name (see the primary_search_vN note in
-- 20-views.sql) — never change this signature in place; copy to _v2 instead.
-- Filters through web.profile_search so unpublished/disabled profiles never
-- leak. Returns empty when the target has no embedding yet (CROSS JOIN target).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION web.similar_profiles_v1(target_key int, max_results int DEFAULT 6)
RETURNS TABLE(profile_key int, distance real) AS $func$
    WITH target AS (
        SELECT embedding FROM web.profile_embeddings
        WHERE missionary_profile_key = target_key
    )
    SELECT ps.missionary_profile_key AS profile_key,
           (pe.embedding <=> t.embedding)::real AS distance
    FROM web.profile_embeddings pe
    JOIN web.profile_search ps ON (ps.missionary_profile_key = pe.missionary_profile_key)
    CROSS JOIN target t
    WHERE pe.missionary_profile_key <> target_key
    ORDER BY pe.embedding <=> t.embedding
    LIMIT max_results;
$func$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = web, public;
ALTER FUNCTION web.similar_profiles_v1(int, int) OWNER TO ergatas_web;
