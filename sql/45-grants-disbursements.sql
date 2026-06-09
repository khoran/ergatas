-- ============================================================================
-- Foreign Grant Compliance — Disbursement records (Phase 5, lifecycle [5]).
--
-- Disbursements are recorded WITHIN the board-delegated scope (no per-payment
-- vote). This system records and constrains disbursements and feeds "sent"
-- amounts into salary reports; it does NOT move money (a banking rail is a
-- separate, later effort). A suspension/termination in the latest board review
-- halts further disbursement (enforced in the app layer).
-- ============================================================================

CREATE TABLE IF NOT EXISTS grants.disbursement (
    record_id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    grantee_org                text         NOT NULL,
    board_approval_id          uuid         NOT NULL REFERENCES grants.board_approval(record_id),
    reporting_period           text,
    amount                     numeric(14,2) NOT NULL CHECK (amount >= 0),
    currency                   text         NOT NULL DEFAULT 'USD',
    -- optional per-employee/role allocation for salary-report prefill
    allocation                 jsonb        NOT NULL DEFAULT '[]'::jsonb,
    method                     text,
    scheduled_date             date,
    sent_date                  date,
    note                       text,
    prior_record_id            uuid         REFERENCES grants.disbursement(record_id),
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
    status                     text         NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','superseded')),
    created_on                 timestamptz  NOT NULL DEFAULT now(),
    created_by                 varchar      NOT NULL DEFAULT current_user
);
ALTER TABLE grants.disbursement OWNER TO ergatas_dev;
CREATE INDEX IF NOT EXISTS idx_disbursement_grantee ON grants.disbursement(grantee_org);
CREATE INDEX IF NOT EXISTS idx_disbursement_approval ON grants.disbursement(board_approval_id);

DROP TRIGGER IF EXISTS write_once ON grants.disbursement;
CREATE TRIGGER write_once BEFORE UPDATE OR DELETE ON grants.disbursement
    FOR EACH ROW EXECUTE FUNCTION grants.enforce_write_once();
ALTER TABLE grants.disbursement ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS srv_all ON grants.disbursement;
CREATE POLICY srv_all ON grants.disbursement FOR ALL TO ergatas_server USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS staff_read ON grants.disbursement;
CREATE POLICY staff_read ON grants.disbursement FOR SELECT TO ergatas_grant_staff, ergatas_board_member USING (true);
GRANT SELECT, INSERT, UPDATE ON grants.disbursement TO ergatas_server;
GRANT SELECT ON grants.disbursement TO ergatas_grant_staff, ergatas_board_member;

-- View (see sql/40-grants.sql): the app reaches this table only through the view.
CREATE OR REPLACE VIEW grants.disbursement_view WITH (security_invoker = true) AS
    SELECT * FROM grants.disbursement;
ALTER VIEW grants.disbursement_view OWNER TO ergatas_dev;
GRANT SELECT, INSERT, UPDATE ON grants.disbursement_view TO ergatas_server;
GRANT SELECT ON grants.disbursement_view TO ergatas_grant_staff, ergatas_board_member;
