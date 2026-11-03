-- ============================================================================
-- Foreign Grant Compliance — Salary-use report (Phase 4, lifecycle [6]).
--
-- Periodic, reconciled, attested record of how grant funds were applied to staff
-- salaries. Write-once. The form is a summary; granular payroll stays with the
-- grantee (producible on request). Supports a role-based (name-optional) mode for
-- data-protection regimes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS grants.salary_report (
    record_id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type                text         NOT NULL DEFAULT 'salary_use_periodic',
    grantee_org                text         NOT NULL,
    country                    text,
    reporting_period           text         NOT NULL,
    agreement_version          text,                                   -- version certified against
    grant_reference            text,
    board_approval_id          uuid         REFERENCES grants.board_approval(record_id),
    acceptance_record_id       uuid         REFERENCES grants.acceptance_record(record_id),
    role_based_mode            boolean      NOT NULL DEFAULT false,     -- names kept in grantee records
    -- lines[]{employee,role,sent,applied,variance,explanation}, totals{sent,applied,variance}
    data                       jsonb        NOT NULL DEFAULT '{}'::jsonb,
    charitable_use_confirmed   boolean      NOT NULL DEFAULT false,     -- Confirmation 1
    attestation_confirmed      boolean      NOT NULL DEFAULT false,     -- Confirmation 2
    attestation_text           jsonb        NOT NULL DEFAULT '[]'::jsonb, -- exact wording(s) affirmed
    typed_signature            text,
    prior_record_id            uuid         REFERENCES grants.salary_report(record_id),
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
    status                     text         NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','superseded')),
    created_on                 timestamptz  NOT NULL DEFAULT now(),
    created_by                 varchar      NOT NULL DEFAULT current_user
);
ALTER TABLE grants.salary_report OWNER TO ergatas_dev;
CREATE INDEX IF NOT EXISTS idx_salary_report_grantee ON grants.salary_report(grantee_org);

DROP TRIGGER IF EXISTS write_once ON grants.salary_report;
CREATE TRIGGER write_once BEFORE UPDATE OR DELETE ON grants.salary_report
    FOR EACH ROW EXECUTE FUNCTION grants.enforce_write_once();
ALTER TABLE grants.salary_report ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS srv_all ON grants.salary_report;
CREATE POLICY srv_all ON grants.salary_report FOR ALL TO ergatas_server USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS staff_read ON grants.salary_report;
CREATE POLICY staff_read ON grants.salary_report FOR SELECT TO ergatas_grant_staff, ergatas_board_member USING (true);
GRANT SELECT, INSERT, UPDATE ON grants.salary_report TO ergatas_server;
GRANT SELECT ON grants.salary_report TO ergatas_grant_staff, ergatas_board_member;

-- View (see sql/40-grants.sql): the app reaches this table only through the view.
CREATE OR REPLACE VIEW grants.salary_report_view WITH (security_invoker = true) AS
    SELECT * FROM grants.salary_report;
ALTER VIEW grants.salary_report_view OWNER TO ergatas_dev;
GRANT SELECT, INSERT, UPDATE ON grants.salary_report_view TO ergatas_server;
GRANT SELECT ON grants.salary_report_view TO ergatas_grant_staff, ergatas_board_member;

-- ---- Annual report reminders ---------------------------------------------------
-- One row per grantee + reporting year, tracking the reminder emails sent to the
-- organization's owners as the annual salary-use report comes due (same shape as
-- web.worker_document_reminders for Ministry Review). Mutable bookkeeping, not an
-- evidence record, so no write-once trigger. resolved_on is set once the report
-- for that year is on file.
CREATE TABLE IF NOT EXISTS grants.report_reminders (
    report_reminder_key    serial       PRIMARY KEY,
    grantee_org            text         NOT NULL,
    reporting_period       text         NOT NULL,          -- the year, "YYYY"
    deadline_date          date         NOT NULL,
    reminders_sent         int          NOT NULL DEFAULT 0,
    last_reminder_sent_on  timestamptz,
    last_sent_to           text,
    resolved_on            timestamptz,
    created_on             timestamptz  NOT NULL DEFAULT now(),
    created_by             varchar      NOT NULL DEFAULT current_user,
    UNIQUE (grantee_org, reporting_period)
);
ALTER TABLE grants.report_reminders OWNER TO ergatas_dev;
ALTER TABLE grants.report_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS srv_all ON grants.report_reminders;
CREATE POLICY srv_all ON grants.report_reminders FOR ALL TO ergatas_server USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS staff_read ON grants.report_reminders;
CREATE POLICY staff_read ON grants.report_reminders FOR SELECT TO ergatas_grant_staff, ergatas_board_member USING (true);
GRANT SELECT, INSERT, UPDATE ON grants.report_reminders TO ergatas_server;
GRANT USAGE, SELECT ON SEQUENCE grants.report_reminders_report_reminder_key_seq TO ergatas_server;
GRANT SELECT ON grants.report_reminders TO ergatas_grant_staff, ergatas_board_member;

CREATE OR REPLACE VIEW grants.report_reminders_view WITH (security_invoker = true) AS
    SELECT * FROM grants.report_reminders;
ALTER VIEW grants.report_reminders_view OWNER TO ergatas_dev;
GRANT SELECT, INSERT, UPDATE ON grants.report_reminders_view TO ergatas_server;
GRANT SELECT ON grants.report_reminders_view TO ergatas_grant_staff, ergatas_board_member;

-- Who to remind for a grantee: the writable managers of every organization
-- listed under that registered non-profit name. Owned by ergatas_dev (like
-- web.user_org_search_filters) so it can read the permission tables; only the
-- server role may read it. Emails are resolved from FusionAuth by user id.
CREATE OR REPLACE VIEW grants.grantee_org_managers_view AS
    SELECT np.registered_name AS grantee_org,
           o.organization_key,
           u.external_user_id
    FROM web.non_profits np
    JOIN web.organizations o ON o.non_profit_key = np.non_profit_key
    JOIN web.user_profile_permissions p ON p.organization_key = o.organization_key AND NOT coalesce(p.read_only, false)
    JOIN web.users u ON u.user_key = p.user_key;
ALTER VIEW grants.grantee_org_managers_view OWNER TO ergatas_dev;
GRANT SELECT ON grants.grantee_org_managers_view TO ergatas_server;
