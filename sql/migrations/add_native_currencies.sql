-- Multi-currency / tax-receipt support.
-- New org fields live inside the existing non_profits.donation_settings jsonb:
--   native_currencies: [<ISO 4217 code>,...]  manually selected, no-exchange currencies
--   stripe_currencies: [<ISO 4217 code>,...]  detected from Stripe bank accounts (machine-written)
--   provides_tax_receipt: boolean             org can give tax receipts valid in its own country
-- No table columns are added; just indexes.

CREATE INDEX IF NOT EXISTS non_profits_donation_settings_gin
    ON web.non_profits USING gin (donation_settings);
CREATE INDEX IF NOT EXISTS non_profits_provides_tax_receipt
    ON web.non_profits ((coalesce((donation_settings->>'provides_tax_receipt')::boolean,false)))
    WHERE coalesce((donation_settings->>'provides_tax_receipt')::boolean,false);

-- base_profile_search gains computed columns (org_currencies, provides_tax_receipt,
-- organization_country_code). CREATE OR REPLACE VIEW cannot add columns, so drop it
-- with CASCADE. This also drops: all_profile_search, profile_search,
-- organizations_with_profiles, featured_profiles, random_profiles, public_posts_view
-- (and its dependent functions public_posts_by_profile_keys /
-- public_prayer_posts_by_profile_keys), cause/job/tag_counts_view, and
-- primary_search_v3 dependents — all recreated by re-running 20-views.sql.
DROP VIEW IF EXISTS web.base_profile_search CASCADE;

-- primary_search_v3 gains two new arguments; drop the old signature so re-running
-- 20-views.sql does not leave an ambiguous overload behind.
DROP FUNCTION IF EXISTS web.primary_search_v3(
        text, numeric[], text, int[] , int, int, int[], varchar(3)[],
        varchar, int[], int[], int[], int[], int[], varchar[], int[], int[],
        varchar, int, boolean, boolean, boolean);

-- AFTER running this file:
--   1. re-run 20-views.sql (recreates all dropped views/functions, adds
--      currency_counts_view and tax_receipt_country_counts_view, new RPC signature)
--   2. re-run 25-insert_org_trigger.sql (trigger now persists donation_settings)
--   3. reload the PostgREST schema cache (restart or NOTIFY pgrst)
