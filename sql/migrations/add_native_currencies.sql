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
-- public_prayer_posts_by_profile_keys), and cause/job/tag_counts_view -- all
-- recreated by re-running 20-views.sql. The search RPCs (primary_search_v3 /
-- primary_search_v4) use dynamic EXECUTE and are NOT dropped by this CASCADE.
DROP VIEW IF EXISTS web.base_profile_search CASCADE;

-- The new-signature search RPC is added as web.primary_search_v4 by 20-views.sql
-- (it adds org_currencies / tax_receipt_countries). The old web.primary_search_v3
-- is intentionally retained (not dropped) so clients that have not yet updated
-- their JS keep working during rollout.

-- AFTER running this file:
--   1. re-run 20-views.sql (recreates all dropped views/functions, adds
--      currency_counts_view and tax_receipt_country_counts_view, new RPC signature)
--   2. re-run 25-insert_org_trigger.sql (trigger now persists donation_settings)
--   3. reload the PostgREST schema cache (restart or NOTIFY pgrst)
