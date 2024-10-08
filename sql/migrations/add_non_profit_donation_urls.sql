
ALTER TABLE web.non_profits ADD donation_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
