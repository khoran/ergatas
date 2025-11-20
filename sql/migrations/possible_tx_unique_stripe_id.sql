-- in table possible_transactions, make stripe_id unique
DROP INDEX IF EXISTS web.possible_transactions_stripe_id_idx;
--change stripe_id to allow null.
ALTER TABLE web.possible_transactions ALTER COLUMN stripe_id DROP NOT NULL;

--update fields where stripe_id = '' to null
UPDATE web.possible_transactions SET stripe_id = NULL WHERE stripe_id = '';

CREATE UNIQUE INDEX IF NOT EXISTS possible_transactions_stripe_id_idx
    ON web.possible_transactions(stripe_id)
;