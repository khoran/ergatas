-- ============================================================================
-- Foreign Grant Compliance — Board review & approval (Phase 2, lifecycle [2]/[7])
--
-- One immutable record per grantee decision (never blanket). New-grant approvals
-- and annual reviews share this table; annual reviews/amendments chain to their
-- predecessor via prior_approval_id (predecessor flipped to 'superseded').
-- Voting mechanics (quorum, thresholds, recusal, finalizer roles) and the
-- exempt-purpose attestation wording are CONFIGURABLE in grants.governance_config
-- (for counsel / bylaws), never hard-coded.
-- ============================================================================

CREATE TABLE IF NOT EXISTS grants.board_approval (
    record_id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    review_type                text         NOT NULL CHECK (review_type IN ('new_grant','annual_review')),
    grantee_org                text         NOT NULL,
    country                    text,
    grant_reference            text,
    prior_approval_id          uuid         REFERENCES grants.board_approval(record_id),
    ofac_screening_id          uuid         REFERENCES grants.ofac_screening(record_id),
    due_diligence_id           uuid         REFERENCES grants.due_diligence(record_id),
    meeting_date               date,
    meeting_reference          text,
    -- {affirmed:bool, text:"<verbatim wording affirmed>"}
    exempt_purpose_finding     jsonb        NOT NULL DEFAULT '{}'::jsonb,
    motion_text                text,
    outcome                    text         NOT NULL CHECK (outcome IN
                                   ('approved','approved_conditions','deferred','denied',
                                    'renewed','modified','suspended','terminated')),
    quorum_met                 boolean      NOT NULL DEFAULT false,
    -- votes[], tally, conditions[], delegation{authorized,scope}, proposed_terms{},
    -- and annual-review fields (period_reviewed, reports_received/expected,
    -- reconciliation_status, compliance_flags[], re_screening) live in data.
    data                       jsonb        NOT NULL DEFAULT '{}'::jsonb,
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
ALTER TABLE grants.board_approval OWNER TO ergatas_dev;
CREATE INDEX IF NOT EXISTS idx_board_approval_grantee ON grants.board_approval(grantee_org);

-- Write-once trigger + RLS (same policy shape as the other record tables).
DROP TRIGGER IF EXISTS write_once ON grants.board_approval;
CREATE TRIGGER write_once BEFORE UPDATE OR DELETE ON grants.board_approval
    FOR EACH ROW EXECUTE FUNCTION grants.enforce_write_once();
ALTER TABLE grants.board_approval ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS srv_all ON grants.board_approval;
CREATE POLICY srv_all ON grants.board_approval FOR ALL TO ergatas_server USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS staff_read ON grants.board_approval;
CREATE POLICY staff_read ON grants.board_approval FOR SELECT TO ergatas_grant_staff, ergatas_board_member USING (true);

GRANT SELECT, INSERT, UPDATE ON grants.board_approval TO ergatas_server;
GRANT SELECT ON grants.board_approval TO ergatas_grant_staff, ergatas_board_member;

-- View (see sql/40-grants.sql): the app reaches this table only through the view.
CREATE OR REPLACE VIEW grants.board_approval_view WITH (security_invoker = true) AS
    SELECT * FROM grants.board_approval;
ALTER VIEW grants.board_approval_view OWNER TO ergatas_dev;
GRANT SELECT, INSERT, UPDATE ON grants.board_approval_view TO ergatas_server;
GRANT SELECT ON grants.board_approval_view TO ergatas_grant_staff, ergatas_board_member;

-- Seed a default, editable governance configuration (for counsel to tune).
INSERT INTO grants.governance_config (scope, config)
VALUES ('default', jsonb_build_object(
    'quorum', 3,
    'approve_threshold', 'majority',           -- 'majority' | 'two_thirds' | a fraction 0..1
    'finalizer_roles', jsonb_build_array('board_chair','board_secretary'),
    'attestations', jsonb_build_object(
        'exempt_purpose',
        'The board finds that this grant furthers the organization''s own exempt purposes, ' ||
        'that the organization retains discretion and control over the funds, and that it is ' ||
        'not acting as a conduit for any earmarked contribution.'),
    -- Grantor identity substituted into the agreement template''s {{grantor_*}}
    -- tokens. The address MUST be configured before the first agreement is
    -- published (an unset value renders as a visible {{grantor_address}} token).
    'grantor', jsonb_build_object(
        'legal_name', 'Ergatas',
        'address', '',
        'exempt_purpose',
        'performing the functions of the Christian church — conducting Christian religious and ' ||
        'missionary services; disseminating, teaching and preaching the Gospel and teachings of ' ||
        'Jesus Christ; encouraging and aiding the growth, nurture and spread of the Christian ' ||
        'religion; and rendering Christian service, both material and spiritual, to the sick, ' ||
        'the aged, the homeless and the needy')
))
ON CONFLICT (scope) DO NOTHING;
