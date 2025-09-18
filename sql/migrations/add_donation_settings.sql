ALTER TABLE web.non_profits ADD COLUMN donation_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
