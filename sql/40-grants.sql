-- ============================================================================
-- Foreign Grant Compliance System — schema foundation (Phase 0)
--
-- A separate, isolated `grants` schema holds the immutable, hash-stamped
-- evidence chain (one chain per grantee) described in
-- /home/khoran/Documents/Ergatas/foreign orgs/*.md. All access is server-
-- mediated through /api/grants/* endpoints (role `ergatas_server`); the tables
-- are write-once (see grants.enforce_write_once) so even a compromised app
-- path cannot edit or delete a finalized record.
--
-- Conventions for every record table (the "integrity columns"):
--   record_id      uuid  PK, server-assigned (gen_random_uuid)
--   content_hash   text        SHA-256 over the canonical record content
--   timestamp_utc  timestamptz server clock at finalization
--   ip_address     text        captured from the request
--   user_agent     text        captured from the request
--   submitter_*                identity from the authenticated session (JWT)
--   status         text        '<initial>' | 'superseded' (write-once)
--   created_on/by              standard audit defaults
-- Corrections never edit in place: write a new record and flip the prior to
-- 'superseded' (the only mutation the trigger permits).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;          -- name-variant matching (Phase 1)

-- ---- Roles --------------------------------------------------------------------
-- App roles that appear in the JWT and that PostgREST can SET ROLE to.
DO $$
BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ergatas_grant_staff') THEN
      CREATE ROLE ergatas_grant_staff;          -- internal staff: screening, disbursement records
   END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ergatas_board_member') THEN
      CREATE ROLE ergatas_board_member;         -- board/grants committee: voting, approvals
   END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ergatas_grantee') THEN
      CREATE ROLE ergatas_grantee;              -- external grantee submitters: acceptance, reports
   END IF;
END
$$;

-- Let PostgREST switch into these roles (mirrors 05-users.sql).
GRANT ergatas_grant_staff, ergatas_board_member, ergatas_grantee TO postgrest_auth;
-- A board member is also grant staff for read purposes.
GRANT ergatas_grant_staff TO ergatas_board_member;

-- A grants actor is also a normal web user: make the grants roles members of
-- ergatas_web so a single JWT `role` claim (set by FusionAuth from the user's app
-- roles) carries BOTH normal web-schema access AND grants access. Without this a
-- grants role claim would lack web access and break the rest of the app.
-- (ergatas_board_member inherits ergatas_web transitively via ergatas_grant_staff.)
GRANT ergatas_web TO ergatas_grant_staff;
GRANT ergatas_web TO ergatas_grantee;

-- Composite role for users who are BOTH an org admin AND a grantee (a foreign
-- org rep who manages their org profile on the platform AND accepts grant
-- agreements). A single JWT `role` claim names one PG role, so the (org_admin +
-- grantee) overlap needs a role that is a member of both; FusionAuth maps that
-- combination to this role. (Grant staff/board are internal-only and do not
-- overlap with the platform-admin roles, so no other composite is needed.)
DO $$
BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ergatas_org_admin_grantee') THEN
      CREATE ROLE ergatas_org_admin_grantee;
   END IF;
END
$$;
GRANT ergatas_org_admin TO ergatas_org_admin_grantee;   -- web-schema access (org_admin -> web)
GRANT ergatas_grantee   TO ergatas_org_admin_grantee;   -- grants access (agreement read_all)
-- Let PostgREST SET ROLE into it (the authenticator is NOINHERIT LOGIN).
GRANT ergatas_org_admin_grantee TO postgrest_auth;

-- Site admins can do everything: make ergatas_site_admin a member of every grants
-- role, so a site_admin user (mapped to ergatas_site_admin) gets full grants read
-- access on top of its existing web/org_admin privileges. (NOT ergatas_server —
-- that role's server-authoritative write access stays reserved to the app.)
GRANT ergatas_grant_staff, ergatas_board_member, ergatas_grantee TO ergatas_site_admin;

-- ---- Schema -------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS grants AUTHORIZATION ergatas_dev;

GRANT USAGE ON SCHEMA grants TO ergatas_server, ergatas_grant_staff, ergatas_board_member, ergatas_grantee;

-- ---- Write-once enforcement ---------------------------------------------------
-- Permits exactly one mutation: flipping a non-superseded row's status to
-- 'superseded' with no other column changed. Everything else (any other UPDATE,
-- any DELETE) is rejected at the database level, for every role.
CREATE OR REPLACE FUNCTION grants.enforce_write_once()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
   IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'grants.% records are immutable: DELETE is not permitted', TG_TABLE_NAME
         USING ERRCODE = 'check_violation';
   END IF;

   -- UPDATE: only the controlled supersede transition is allowed.
   IF OLD.status = 'superseded' THEN
      RAISE EXCEPTION 'grants.% record % is already superseded and cannot change', TG_TABLE_NAME, OLD.record_id
         USING ERRCODE = 'check_violation';
   END IF;
   IF NEW.status <> 'superseded' THEN
      RAISE EXCEPTION 'grants.% records are immutable: the only allowed update is status -> superseded', TG_TABLE_NAME
         USING ERRCODE = 'check_violation';
   END IF;
   IF (to_jsonb(OLD) - 'status') <> (to_jsonb(NEW) - 'status') THEN
      RAISE EXCEPTION 'grants.% records are immutable: no field other than status may change', TG_TABLE_NAME
         USING ERRCODE = 'check_violation';
   END IF;

   RETURN NEW;
END
$$;

-- Helper applied to each record table after creation.
-- (kept as a comment-template; each table wires the trigger explicitly below)

-- ---- Governance configuration -------------------------------------------------
-- Configurable, NOT hard-coded: quorum, vote thresholds, recusal handling,
-- finalizer roles, attestation wording, etc. (driven by bylaws/state law — for
-- counsel). Mutable config (this table is intentionally not write-once).
CREATE TABLE IF NOT EXISTS grants.governance_config (
    governance_config_key  serial       PRIMARY KEY,
    scope                  text         NOT NULL DEFAULT 'default',   -- future: per-grantor scoping
    config                 jsonb        NOT NULL DEFAULT '{}'::jsonb, -- {quorum, threshold, recusal, finalizer_roles, attestations:{...}}
    created_on             timestamptz  NOT NULL DEFAULT now(),
    created_by             varchar      NOT NULL DEFAULT current_user,
    last_updated_on        timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (scope)
);
ALTER TABLE grants.governance_config OWNER TO ergatas_dev;

-- ---- OFAC screening (chain root, lifecycle [1]) -------------------------------
CREATE TABLE IF NOT EXISTS grants.ofac_screening (
    record_id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    grantee_org                text         NOT NULL,
    country                    text,
    -- targets[], lists_checked[], results[], jurisdiction_program_check live in data
    data                       jsonb        NOT NULL DEFAULT '{}'::jsonb,
    list_source_version        text,
    overall_result             text         NOT NULL CHECK (overall_result IN ('clear','escalated','blocked')),
    prior_record_id            uuid         REFERENCES grants.ofac_screening(record_id),
    -- integrity columns (server-set)
    content_hash               text         NOT NULL,
    canonical_content          text         NOT NULL,
    timestamp_utc              timestamptz  NOT NULL,
    ip_address                 text,
    user_agent                 text,
    submitter_external_user_id text         NOT NULL,
    submitter_name             text,
    submitter_email            text,
    submitter_roles            jsonb,
    status                     text         NOT NULL DEFAULT 'final' CHECK (status IN ('final','superseded')),
    created_on                 timestamptz  NOT NULL DEFAULT now(),
    created_by                 varchar      NOT NULL DEFAULT current_user
);
ALTER TABLE grants.ofac_screening OWNER TO ergatas_dev;

-- ---- Due diligence (lifecycle [1]) --------------------------------------------
CREATE TABLE IF NOT EXISTS grants.due_diligence (
    record_id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    grantee_org                text         NOT NULL,
    summary                    text,
    risk_rating                text         CHECK (risk_rating IN ('low','medium','high')),
    data                       jsonb        NOT NULL DEFAULT '{}'::jsonb,   -- evidence_refs[], etc.
    prior_record_id            uuid         REFERENCES grants.due_diligence(record_id),
    content_hash               text         NOT NULL,
    canonical_content          text         NOT NULL,
    timestamp_utc              timestamptz  NOT NULL,
    ip_address                 text,
    user_agent                 text,
    submitter_external_user_id text         NOT NULL,
    submitter_name             text,
    submitter_email            text,
    submitter_roles            jsonb,
    status                     text         NOT NULL DEFAULT 'final' CHECK (status IN ('final','superseded')),
    created_on                 timestamptz  NOT NULL DEFAULT now(),
    created_by                 varchar      NOT NULL DEFAULT current_user
);
ALTER TABLE grants.due_diligence OWNER TO ergatas_dev;

-- ---- Wire write-once triggers + RLS on each record table ----------------------
DO $$
DECLARE t text;
BEGIN
   FOREACH t IN ARRAY ARRAY['ofac_screening','due_diligence']
   LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS write_once ON grants.%I', t);
      EXECUTE format(
         'CREATE TRIGGER write_once BEFORE UPDATE OR DELETE ON grants.%I
            FOR EACH ROW EXECUTE FUNCTION grants.enforce_write_once()', t);
      EXECUTE format('ALTER TABLE grants.%I ENABLE ROW LEVEL SECURITY', t);
      -- Server mediates all access; app-role authZ is enforced in Node endpoints.
      EXECUTE format('DROP POLICY IF EXISTS srv_all ON grants.%I', t);
      EXECUTE format(
         'CREATE POLICY srv_all ON grants.%I FOR ALL TO ergatas_server USING (true) WITH CHECK (true)', t);
      -- Defense-in-depth read access for internal roles (no client writes).
      EXECUTE format('DROP POLICY IF EXISTS staff_read ON grants.%I', t);
      EXECUTE format(
         'CREATE POLICY staff_read ON grants.%I FOR SELECT TO ergatas_grant_staff, ergatas_board_member USING (true)', t);
   END LOOP;
END
$$;

-- ---- Privileges ---------------------------------------------------------------
-- Server role mediates everything.
GRANT SELECT, INSERT, UPDATE ON grants.ofac_screening, grants.due_diligence TO ergatas_server;
GRANT SELECT, INSERT, UPDATE ON grants.governance_config TO ergatas_server;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA grants TO ergatas_server;
-- Internal read roles (PostgREST may expose read-only views later).
GRANT SELECT ON grants.ofac_screening, grants.due_diligence TO ergatas_grant_staff, ergatas_board_member;

-- ---- Views --------------------------------------------------------------------
-- Project rule: the application reaches grants tables ONLY through these views,
-- never the base tables. `security_invoker = true` makes each view run with the
-- *invoking* role's privileges + RLS (identical to querying the table directly as
-- that role), and the base-table write-once triggers still fire on every write.
-- Each view mirrors the privileges granted on its underlying table above.
CREATE OR REPLACE VIEW grants.governance_config_view WITH (security_invoker = true) AS
    SELECT * FROM grants.governance_config;
ALTER VIEW grants.governance_config_view OWNER TO ergatas_dev;
GRANT SELECT, INSERT, UPDATE ON grants.governance_config_view TO ergatas_server;

CREATE OR REPLACE VIEW grants.ofac_screening_view WITH (security_invoker = true) AS
    SELECT * FROM grants.ofac_screening;
ALTER VIEW grants.ofac_screening_view OWNER TO ergatas_dev;
GRANT SELECT, INSERT, UPDATE ON grants.ofac_screening_view TO ergatas_server;
GRANT SELECT ON grants.ofac_screening_view TO ergatas_grant_staff, ergatas_board_member;

CREATE OR REPLACE VIEW grants.due_diligence_view WITH (security_invoker = true) AS
    SELECT * FROM grants.due_diligence;
ALTER VIEW grants.due_diligence_view OWNER TO ergatas_dev;
GRANT SELECT, INSERT, UPDATE ON grants.due_diligence_view TO ergatas_server;
GRANT SELECT ON grants.due_diligence_view TO ergatas_grant_staff, ergatas_board_member;
