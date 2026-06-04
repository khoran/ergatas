-- Org-level feature settings column
ALTER TABLE web.organizations ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Document type enum (stored at db level like approval_status, profile_state)
CREATE TYPE document_type AS ENUM ('budget', 'report');

-- Worker document uploads: one row per file per profile per period
CREATE TABLE IF NOT EXISTS web.worker_documents (
    worker_document_key     serial            PRIMARY KEY NOT NULL,
    missionary_profile_key  int               NOT NULL REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    document_type           document_type     NOT NULL,
    storage_path            varchar           NOT NULL,
    original_filename       varchar           NOT NULL,
    -- First day of the covered period (e.g. 2025-01-01 for Q1 2025)
    submission_period       date              NOT NULL,
    created_on              timestamp         NOT NULL DEFAULT now(),
    created_by              varchar           NOT NULL DEFAULT current_user,
    UNIQUE (missionary_profile_key, document_type, submission_period)
);
ALTER TABLE web.worker_documents OWNER TO ergatas_dev;
ALTER TABLE web.worker_documents ENABLE ROW LEVEL SECURITY;

-- Reminder tracking: one row per missed (profile, doc_type, period), updated each month until resolved
CREATE TABLE IF NOT EXISTS web.worker_document_reminders (
    worker_document_reminder_key  serial        PRIMARY KEY NOT NULL,
    missionary_profile_key        int           NOT NULL REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    document_type                 document_type NOT NULL,
    submission_period             date          NOT NULL,
    deadline_date                 date          NOT NULL,
    reminders_sent                int           NOT NULL DEFAULT 0,
    last_reminder_sent_on         timestamp,
    resolved_on                   timestamp,
    created_on                    timestamp     NOT NULL DEFAULT now(),
    created_by                    varchar       NOT NULL DEFAULT current_user,
    UNIQUE (missionary_profile_key, document_type, submission_period)
);
ALTER TABLE web.worker_document_reminders OWNER TO ergatas_dev;

CREATE INDEX idx_worker_documents_missionary_profile_key ON web.worker_documents(missionary_profile_key);
CREATE INDEX idx_worker_document_reminders_open
    ON web.worker_document_reminders(missionary_profile_key)
    WHERE resolved_on IS NULL;
