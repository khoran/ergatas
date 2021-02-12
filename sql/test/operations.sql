BEGIN;

\set test_sub test-sub123
select plan(50);

set role ergatas_web;
SELECT set_config('request.jwt.claim.sub',:'test_sub',false);

SELECT is(current_setting('request.jwt.claim.sub',false),:'test_sub','test subject claim set');

-- users
----------------------

INSERT INTO web.users_view(external_user_id) VALUES(:'test_sub');
DEALLOCATE ALL; 

PREPARE q1 AS SELECT * FROM web.users_view WHERE external_user_id = :'test_sub' ;
SELECT isnt_empty( 'q1','test sub was inserted and is visible');

SELECT throws_ok('INSERT INTO web.users_view(external_user_id) VALUES(''bad_sub'')',
                'new row violates row-level security policy for table "users"','inserting bad_sub');

PREPARE q2 AS  UPDATE web.users_view SET external_user_id = 'bad_sub' WHERE external_user_id = :'test_sub';
SELECT throws_ok('q2','permission denied for table users','updating to  bad_sub');

PREPARE q3 AS SELECT * FROM web.users_view WHERE external_user_id != :'test_sub' ;
SELECT is_empty( 'q3',' only test sub should be visible from uses table or view');

PREPARE q34 AS DELETE FROM web.users_view WHERE external_user_id = :'test_sub';
SELECT lives_ok('q34','ergatas_web can delete own user');

INSERT INTO web.users_view(external_user_id) VALUES(:'test_sub');

-- organizations
--------------------


PREPARE q5 AS INSERT INTO web.create_organizations_view(country_code,country_org_id,name,
                            dba_name,city,state,website,description,logo_url,is_shell)
    VALUES(
            'usa',
            'test_org_1',
            'test_org',
            'test_org_dba',
            'test_city',
            'test_state',
            'test_website',
            'test_description',
            'test_logo_url',
            false );
SELECT lives_ok('q5','insert new organization in create_organizations');

SELECT isnt_empty('SELECT * FROM web.organizations_view WHERE country_code=''usa'' AND country_org_id=''test_org_1'' AND status=''pending'' ',
                'new org created and set as pending');


PREPARE q6 AS 
SELECT throws_ok('UPDATE web.organizations_view SET description=''updated test description'' WHERE country_code=''usa'' AND country_org_id=''test_org_1'' ',
        'permission denied for view organizations_view','update existing organization');


-- pending_orgnaizations_view

SELECT throws_ok('SELECT * FROM web.pending_organizations_view WHERE status !=''pending'' ',
                    'permission denied for view pending_organizations_view','ergatas_web cannot select from pending_organizations_view');

SELECT throws_ok('UPDATE web.pending_organizations_view SET status=''denied'' WHERE country_code=''usa'' AND country_org_id=''test_org_1'' ',
                    'permission denied for view pending_organizations_view','ergatas_web cannot update from pending_organizations_view');

set role ergatas_org_admin;
SELECT is_empty('SELECT * FROM web.pending_organizations_view WHERE status !=''pending'' ','only pending orgs in pending_organizations_view');

SELECT lives_ok('UPDATE web.pending_organizations_view SET status=''denied'' WHERE country_code=''usa'' AND country_org_id=''test_org_1'' ',
                'ergatas_org_admin can update pending_organizations_view');


-- organization_listners_view
set role ergatas_web;

SELECT throws_ok('INSERT INTO web.organization_listeners_view(organization_key,user_key) VALUES(-1,-1)',23503, -- violates foreign key constraint
                null,'insert into organizatinon_listners_view requires org and user to exist');

SELECT organization_key as test_org_key FROM web.organizations_view WHERE country_code='usa' AND country_org_id='test_org_1' \gset
SELECT user_key as test_user_key FROM web.users_view WHERE external_user_id= :'test_sub' \gset

PREPARE olv1 AS INSERT INTO web.organization_listeners_view(organization_key, user_key) SELECT  :test_org_key, :test_user_key;

SELECT lives_ok('olv1','insert into organization_listeners_view');

PREPARE olv2 AS SELECT * FROM web.organization_listeners_view WHERE organization_key = :test_org_key AND  user_key = :test_user_key;
SELECT isnt_empty('olv2','can select inserted row from organization_listeners_view');

PREPARE olv3 AS DELETE FROM web.organization_listeners_view WHERE organization_key = :test_org_key AND  user_key = :test_user_key;
SELECT throws_ok('olv3','permission denied for view organization_listeners_view','ergatas_web cannot delete from organization_listeners_view');

set role ergatas_org_admin;
PREPARE olv21 AS SELECT * FROM web.organization_users_to_notify 
    WHERE organization_key = :test_org_key AND  user_key = :test_user_key AND external_user_id=:'test_sub';
SELECT isnt_empty('olv21','can select from organization_users_to_notify');

PREPARE olv4 AS DELETE FROM web.organization_listeners_view WHERE organization_key = :test_org_key AND  user_key = :test_user_key;
SELECT lives_ok('olv4','ergatas_org_admin can delete from organization_listeners_view');

-- job_catagories

set role ergatas_web;
SELECT throws_ok('INSERT INTO web.job_catagories_view(catagory) VALUES(''test_job'')','permission denied for view job_catagories_view',
                 'ergatas_web cannot insert into job_catagories_view');
SELECT throws_ok('UPDATE web.job_catagories_view SET catagory = ''test_job'' ','permission denied for view job_catagories_view',
                 'ergatas_web cannot update job_catagories_view');
SELECT throws_ok('DELETE FROM web.job_catagories_view','permission denied for view job_catagories_view',
                 'ergatas_web cannot delete from job_catagories_view');
SELECT isnt_empty('SELECT * FROM web.job_catagories_view', 'ergatas_web can select from job_catagories_view');

-- missionary_profiles

reset role;
SELECT isnt_empty('SELECT * from web.organizations WHERE organization_key = 0 AND name = ''Unknown Organization'' ',
                    'Ensure unknown organization exists with organization_key 0');

set role ergatas_web;
SELECT '{
            "organization_key": 4,
            "picture_url":"",
            "first_name":"test_first_name",
            "last_name":"test_last_name",
            "location":"",
            "country":"United States of America",
            "description":"unit test profile",
            "donation_url":"",
            "location_lat":0.0,
            "location_long":0.0,
            "current_support_percentage":0,
            "donate_instructions":"",
            "job_catagory_keys": []
        }'::jsonb as profile_data \gset


-- insert missionary profile
PREPARE mp1 AS INSERT INTO web.missionary_profiles_view(user_key,data) VALUES(:test_user_key, :'profile_data');
SELECT lives_ok('mp1','insert into missionary_profiles_view');

-- ensure profile created
PREPARE mp12 AS SELECT * FROM web.missionary_profiles_view WHERE user_key = :test_user_key AND state='current';
SELECT isnt_empty('mp12','profile created in state ''current'' ');

-- set some variables
SELECT  last_updated_on, state FROM web.missionary_profiles_view WHERE user_key = :test_user_key \gset

--  try to update forbidden fields
UPDATE web.missionary_profiles_view SET  last_updated_on = '2020-01-01', state = 'disabled' WHERE user_key = :test_user_key;
PREPARE mp2 AS SELECT * FROM web.missionary_profiles_view WHERE user_key = :test_user_key 
    AND (last_updated_on ='2020-01-01' OR state='disabled' );
SELECT is_empty('mp2', 'cannot update fields last_updated_on or state');

 -- set vars
SELECT missionary_profile_key as test_profile_key FROM web.missionary_profiles_view WHERE user_key = :test_user_key \gset
reset role;
SELECT  updated_on as fts_updated_on FROM web.profile_fts WHERE missionary_profile_key = :test_profile_key \gset

-- ensure profile_fts row created for profile
PREPARE mp3 AS SELECT * FROM web.profile_fts WHERE missionary_profile_key = :test_profile_key;
SELECT isnt_empty('mp3','full text search index row created in profile_fts for test profile');

set role ergatas_web;

-- update profile legally
PREPARE mp4 AS UPDATE web.missionary_profiles_view SET data = jsonb_set(data,'{first_name}','"new first name"') WHERE user_key = :test_user_key;
SELECT lives_ok('mp4', 'missionary_profiles_view data field is updatedable by ergatas_web');

-- ensure update saved
PREPARE mp5 AS SELECT  data->>'first_name'  FROM web.missionary_profiles_view WHERE user_key = :test_user_key;
SELECT row_eq('mp5',ROW('new first name'::text),'update of data.first_name field succeeded');

-- check profile_fts updated as well
reset role;
SELECT updated_on as  new_fts_updated_on FROM web.profile_fts WHERE missionary_profile_key = :test_profile_key \gset
SELECT cmp_ok(:'fts_updated_on'::timestamp,'<', :'new_fts_updated_on'::timestamp,'profile fts updated_on date advances after missionary_profile_view update');


--get a user_key that is not us
SELECT user_key as other_user_key, data->>'first_name' as other_first_name FROM web.missionary_profiles WHERE user_key != :test_user_key LIMIT 1 \gset


-- try to update other user
set role ergatas_web;
UPDATE web.missionary_profiles_view SET data = jsonb_set(data,'{first_name}','"other first name"') WHERE user_key = :other_user_key;

-- ensure that update was not saved
reset role;
PREPARE mp6 AS SELECT  data->>'first_name'  FROM web.missionary_profiles  WHERE user_key = :other_user_key;
SELECT row_eq('mp6',ROW(:'other_first_name'::text),'update of data.first_name field on other user remains unchanged from original value');

set role ergatas_web;

-- ensure we can't insert profile for other user
PREPARE mp7 AS INSERT INTO web.missionary_profiles_view(user_key,data) VALUES(:other_user_key, :'profile_data');
SELECT throws_ok('mp7','new row violates row-level security policy for table "missionary_profiles"',
                    'fail to insert into missionary_profiles_view with other user_key');


-- delete profile
PREPARE mp8 AS DELETE FROM web.missionary_profiles_view WHERE user_key = :test_user_key;
SELECT lives_ok('mp8','we can delete our own profile');

reset role;
PREPARE mp9 AS SELECT * FROM web.profile_fts WHERE missionary_profile_key = :test_profile_key;
SELECT is_empty('mp9','profile fts entry is removed when profile is removed');

set role ergatas_web;
-- insert missionary profile for future tests
PREPARE mp10 AS INSERT INTO web.missionary_profiles_view(user_key,data) VALUES(:test_user_key, :'profile_data');
SELECT lives_ok('mp10','insert into missionary_profiles_view');
SELECT missionary_profile_key as test_profile_key FROM web.missionary_profiles_view WHERE user_key = :test_user_key \gset

--insert an 'other user' profile
-- not working right now. just assume there will be other profiles in there for now
--reset role;
--PREPARE mp11 AS INSERT INTO web.missionary_profiles(user_key,data) VALUES(:other_user_key, :'profile_data');
--SELECT lives_ok('mp11','insert other_user into missionary_profiles_view');
--set role ergatas_web;

-- profile_statuses
--------------------

-- ensure ergatas_web cannot select or update
SELECT throws_ok('SELECT * from web.profile_statuses','permission denied for view profile_statuses',
                    'ergatas_web cannot select from profile_statuses');
SELECT throws_ok('UPDATE web.profile_statuses SET last_updated_on=now()','permission denied for view profile_statuses',
                    'ergatas_web cannot update profile_statuses');
-- ensure ergatas_server can select and update
set role ergatas_server;
PREPARE ps1 AS SELECT * from web.profile_statuses WHERE external_user_id != :'test_sub';
SELECT isnt_empty('ps1', 'ergatas_server can select from profile_statuses, and see more than just own user');
SELECT lives_ok('UPDATE web.profile_statuses SET last_updated_on=now() WHERE missionary_profile_key = '|| :test_profile_key, 
                    'ergatas_server can update profile_statuses');


-- profile_search
------------------------
set role ergatas_web;
--ensure ergatas_web can select
SELECT isnt_empty('SELECT * FROM web.profile_search WHERE missionary_profile_key = '|| :test_profile_key,'can select our own profile from profile_search');

-- ensure we see more than just our own record
SELECT isnt_empty('SELECT * FROM web.profile_search WHERE missionary_profile_key != '|| :test_profile_key,'can select other users profiles  from profile_search');

-- ranked_profiles fn
----------------------------
--SELECT isnt_empty('SELECT rank FROM web.ranked_profiles()','can select from ranked_profiles function');
--SELECT isnt_empty('SELECT rank FROM web.ranked_profiles(''test'')','can select from ranked_profiles, searching for ''test'' ');
--SELECT is_empty('SELECT rank FROM web.ranked_profiles(''non-existant130u804'')',' no results for non-existant keyword');
--SELECT isnt_empty('SELECT rank FROM web.ranked_profiles(''test name'')',' some result for multi-word query');
--

-- profile_in_box
--------------------------

--SELECT isnt_empty('SELECT * FROM web.profile_in_box(180,180,-180,-180)','can select from profile_in_box function');

-- primary_search
-----------------------------
SELECT isnt_empty('SELECT web.primary_search(null,null,null,null,null,null,null,null,''rank,desc'')',
                'can execute primary_search function');

-- featured_profiles
-------------------------

SELECT isnt_empty('SELECT * FROM web.featured_profiles','can select from featured_profiles');

-- transactions
----------------------
SELECT lives_ok('INSERT INTO web.possible_transactions_view(missionary_profile_key,amount,donation_type) VALUES('|| :test_profile_key ||
                    ',42,''recurring'')','can insert into possible_transactions_view as ergatas_web' );
SELECT throws_ok('SELECT * FROM web.possible_transactions_view','permission denied for view possible_transactions_view',
                    'ergatas_web cannot select possible_transactions_view');
set role ergatas_site_admin;
SELECT lives_ok('SELECT * FROM web.possible_transactions_view', 'ergatas_site_admin can select possible_transactions_view');


-- email_hashes_view
------------------------
set role ergatas_server;
SELECT lives_ok('INSERT INTO web.email_hashes_view(email_address,hashed_email_address) VALUES(''test@example.com'',''hashedemail'')',
                    'ergatas_server can insert ito email_hashes_view');
SELECT row_eq('SELECT hashed_email_address FROM web.email_hashes_view WHERE email_address=''test@example.com'' ',ROW('hashedemail'::varchar),
                'hashed email address was really updated');
SELECT lives_ok('DELETE FROM web.email_hashes_view WHERE email_address=''test@example.com'' ','ergatas_server can delete from email_hashes_view');
SELECT is_empty('SELECT * FROM web.email_hashes_view WHERE email_address=''test@example.com'' ','test email address row was deleted');

select * from finish();
ROLLBACK;