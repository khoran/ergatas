-- Annual salary-report reminders (grants branch). Same statements as the end of sql/44-grants-reports.sql.

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
