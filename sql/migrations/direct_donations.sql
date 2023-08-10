
ALTER TABLE web.possible_transactions ADD stripe_id varchar NOT NULL DEFAULT '';

--TODO: re-run 20-views.sql to re-create possible_transactions_view with correct columns