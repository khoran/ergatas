-- ============================================================================
-- Foreign Grant Compliance — Grant agreement versions + clickwrap acceptance
-- (Phase 3, lifecycle [3]/[4]).
--
-- grant_agreement_version: append-only, versioned agreement templates. A
-- published version is never edited — a change is a NEW version (which forces
-- re-acceptance). The version body is hashed so an acceptance can prove exactly
-- which terms were shown.
--
-- acceptance_record: write-once clickwrap acceptance. Stores the exact document
-- snapshot + its hash + signer identity + evidence (NOT just agreed=true), per
-- the acceptance spec.
-- ============================================================================

-- Generic append-only guard (no status column / no supersede): blocks all edits.
CREATE OR REPLACE FUNCTION grants.forbid_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
   RAISE EXCEPTION 'grants.% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
      USING ERRCODE = 'check_violation';
END
$$;

CREATE TABLE IF NOT EXISTS grants.grant_agreement_version (
    agreement_version_id  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    version_label         text         NOT NULL,            -- e.g. "v1.0 2026-06-01"
    body                  text         NOT NULL,            -- full agreement text shown to grantees
    document_hash         text         NOT NULL,            -- sha256(body)
    terms                 jsonb        NOT NULL DEFAULT '{}'::jsonb,  -- default/sample grant terms
    language              text         NOT NULL DEFAULT 'en',
    governing_version     boolean      NOT NULL DEFAULT true,
    published_by          text         NOT NULL,
    created_on            timestamptz  NOT NULL DEFAULT now(),
    created_by            varchar      NOT NULL DEFAULT current_user,
    UNIQUE (version_label, language)
);
ALTER TABLE grants.grant_agreement_version OWNER TO ergatas_dev;
DROP TRIGGER IF EXISTS append_only ON grants.grant_agreement_version;
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON grants.grant_agreement_version
    FOR EACH ROW EXECUTE FUNCTION grants.forbid_mutation();
ALTER TABLE grants.grant_agreement_version ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS srv_all ON grants.grant_agreement_version;
CREATE POLICY srv_all ON grants.grant_agreement_version FOR ALL TO ergatas_server USING (true) WITH CHECK (true);
-- Grantees may read the agreement they are accepting.
DROP POLICY IF EXISTS read_all ON grants.grant_agreement_version;
CREATE POLICY read_all ON grants.grant_agreement_version FOR SELECT
    TO ergatas_grant_staff, ergatas_board_member, ergatas_grantee USING (true);
GRANT SELECT, INSERT ON grants.grant_agreement_version TO ergatas_server;
GRANT SELECT ON grants.grant_agreement_version TO ergatas_grant_staff, ergatas_board_member, ergatas_grantee;

-- View (see sql/40-grants.sql): the app reaches this table only through the view.
CREATE OR REPLACE VIEW grants.grant_agreement_version_view WITH (security_invoker = true) AS
    SELECT * FROM grants.grant_agreement_version;
ALTER VIEW grants.grant_agreement_version_view OWNER TO ergatas_dev;
GRANT SELECT, INSERT ON grants.grant_agreement_version_view TO ergatas_server;
GRANT SELECT ON grants.grant_agreement_version_view TO ergatas_grant_staff, ergatas_board_member, ergatas_grantee;

CREATE TABLE IF NOT EXISTS grants.acceptance_record (
    record_id                       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    grantee_org_legal_name          text         NOT NULL,
    grantee_country                 text,
    signer_full_name                text         NOT NULL,
    signer_title                    text,
    signer_email                    text,
    email_verified                  boolean      NOT NULL DEFAULT false,
    authorized_representation_confirmed boolean  NOT NULL DEFAULT false,
    agreement_version_id            uuid         NOT NULL REFERENCES grants.grant_agreement_version(agreement_version_id),
    board_approval_id               uuid         REFERENCES grants.board_approval(record_id),
    agreement_document_hash         text         NOT NULL,   -- hash of exact text shown
    agreement_document_snapshot     text         NOT NULL,   -- exact text shown
    grant_terms_snapshot            jsonb        NOT NULL DEFAULT '{}'::jsonb,
    consent_to_electronic_records   boolean      NOT NULL DEFAULT false,
    assent_checkbox_text            jsonb        NOT NULL DEFAULT '[]'::jsonb,  -- literal wording(s) affirmed
    typed_signature                 text,
    prior_record_id                 uuid         REFERENCES grants.acceptance_record(record_id),
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
    status                     text         NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','superseded','revoked')),
    created_on                 timestamptz  NOT NULL DEFAULT now(),
    created_by                 varchar      NOT NULL DEFAULT current_user
);
ALTER TABLE grants.acceptance_record OWNER TO ergatas_dev;
CREATE INDEX IF NOT EXISTS idx_acceptance_grantee ON grants.acceptance_record(grantee_org_legal_name);
DROP TRIGGER IF EXISTS write_once ON grants.acceptance_record;
CREATE TRIGGER write_once BEFORE UPDATE OR DELETE ON grants.acceptance_record
    FOR EACH ROW EXECUTE FUNCTION grants.enforce_write_once();
ALTER TABLE grants.acceptance_record ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS srv_all ON grants.acceptance_record;
CREATE POLICY srv_all ON grants.acceptance_record FOR ALL TO ergatas_server USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS staff_read ON grants.acceptance_record;
CREATE POLICY staff_read ON grants.acceptance_record FOR SELECT TO ergatas_grant_staff, ergatas_board_member USING (true);
GRANT SELECT, INSERT, UPDATE ON grants.acceptance_record TO ergatas_server;
GRANT SELECT ON grants.acceptance_record TO ergatas_grant_staff, ergatas_board_member;

-- View (see sql/40-grants.sql): the app reaches this table only through the view.
CREATE OR REPLACE VIEW grants.acceptance_record_view WITH (security_invoker = true) AS
    SELECT * FROM grants.acceptance_record;
ALTER VIEW grants.acceptance_record_view OWNER TO ergatas_dev;
GRANT SELECT, INSERT, UPDATE ON grants.acceptance_record_view TO ergatas_server;
GRANT SELECT ON grants.acceptance_record_view TO ergatas_grant_staff, ergatas_board_member;

-- enforce_write_once requires NEW.status; the acceptance status enum includes
-- 'revoked' but the trigger only permits the 'superseded' transition. To allow a
-- documented revoke, we treat revoke as supersede-with-reason in the app layer.
