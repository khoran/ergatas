
ALTER TABLE web.possible_transactions ADD paid boolean NOT NULL DEFAULT false;
-- re-run views.sql to re-create possible_transactions_view