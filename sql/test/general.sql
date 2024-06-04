BEGIN;
SELECT plan(47);

SELECT has_schema('web');

SELECT schema_privs_are('web','ergatas_web',ARRAY['USAGE','CREATE']);
SELECT schema_privs_are('web','ergatas_dev',ARRAY['USAGE','CREATE']);

SELECT enums_are(ARRAY[
    'approval_status',
    'donation_type',
    'profile_state'
]);

SELECT tables_are('web',
    ARRAY[
        'users',
        'organizations',
        'non_profits',
        'organization_listeners',
        'job_catagories',
        'missionary_profiles',
        'possible_transactions',
        'email_hashes',
        'profile_fts'
    ]);
SELECT table_owner_is('web','users','ergatas_dev','table owned by ergatas_dev');
SELECT table_owner_is('web','organizations','ergatas_dev','table owned by ergatas_dev');
SELECT table_owner_is('web','organization_listeners','ergatas_dev','table owned by ergatas_dev');
SELECT table_owner_is('web','job_catagories','ergatas_dev','table owned by ergatas_dev');
SELECT table_owner_is('web','missionary_profiles','ergatas_dev','table owned by ergatas_dev');
SELECT table_owner_is('web','possible_transactions','ergatas_dev','table owned by ergatas_dev');
SELECT table_owner_is('web','email_hashes','ergatas_dev','table owned by ergatas_dev');
SELECT table_owner_is('web','profile_fts','ergatas_dev','table owned by ergatas_dev');

SELECT view_owner_is('web','create_organizations_view','ergatas_view_owner','view owned by ergatas_view_owner');
SELECT view_owner_is('web','email_hashes_view','ergatas_view_owner','view owned by ergatas_view_owner');
SELECT view_owner_is('web','job_catagories_view','ergatas_view_owner','view owned by ergatas_view_owner');
SELECT view_owner_is('web','missionary_profiles_view','ergatas_view_owner','view owned by ergatas_view_owner');
SELECT view_owner_is('web','new_missionary_profile','ergatas_view_owner','view owned by ergatas_view_owner');
SELECT view_owner_is('web','new_organization','ergatas_view_owner','view owned by ergatas_view_owner');
SELECT view_owner_is('web','organization_listeners_view','ergatas_view_owner','view owned by ergatas_view_owner');
SELECT view_owner_is('web','organizations_view','ergatas_view_owner','view owned by ergatas_view_owner');
SELECT view_owner_is('web','pending_organizations_view','ergatas_view_owner','view owned by ergatas_view_owner');
SELECT view_owner_is('web','possible_transactions_view','ergatas_view_owner','view owned by ergatas_view_owner');
SELECT view_owner_is('web','users_view','ergatas_view_owner','view owned by ergatas_view_owner');

SELECT view_owner_is('web','profile_statuses','ergatas_dev','view owned by ergatas_dev');
SELECT view_owner_is('web','organization_users_to_notify','ergatas_dev','view owned by ergatas_dev');
SELECT view_owner_is('web','featured_profiles','ergatas_dev','view owned by ergatas_dev');
SELECT view_owner_is('web','profile_search','ergatas_dev','view owned by ergatas_dev');
 
SELECT views_are('web',
    ARRAY[
        'create_organizations_view',
        'email_hashes_view',
        'featured_profiles',
        'job_catagories_view',
        'missionary_profiles_view',
        'new_missionary_profile',
        'new_organization',
        'organization_listeners_view',
        'organization_users_to_notify',
        'organizations_view',
        'organizations_with_profiles',
        'pending_organizations_view',
        'possible_transactions_view',
        'profile_search',
        'profile_statuses',
        'users_view',
        'user_info'
    ]);

SELECT functions_are('web',
    ARRAY[
        'profile_fts_trigger',
        'primary_search',
        'insert_org_trigger',
        'profile_in_box',
        'ranked_profiles'
    ]);

SELECT triggers_are('web','missionary_profiles',
    ARRAY['profile_fts_update']);

SELECT has_role('postgrest_auth');
SELECT has_role('ergatas_dev');
SELECT has_role('ergatas_view_owner');
SELECT has_role('ergatas_web');
SELECT has_role('ergatas_org_admin');
SELECT has_role('ergatas_site_admin');
SELECT has_role('ergatas_server');
SELECT has_user('stats');

SELECT is_member_of('ergatas_web','postgrest_auth');
SELECT is_member_of('ergatas_org_admin','postgrest_auth');
SELECT is_member_of('ergatas_site_admin','postgrest_auth');
SELECT is_member_of('ergatas_server','postgrest_auth');

SELECT is_member_of('ergatas_web','ergatas_org_admin');
SELECT is_member_of('ergatas_org_admin','ergatas_site_admin');

SELECT policies_are('web','users',ARRAY['user_mods']);
SELECT policies_are('web','missionary_profiles',ARRAY['edit_missionary_profile']);

SELECT * from finish();
ROLLBACK;