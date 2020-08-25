
GRANT USAGE ON ALL  SEQUENCES IN SCHEMA web TO ergatas_dev, ergatas_server,ergatas_web;

CREATE OR REPLACE VIEW web.users_view AS
    SELECT user_key,external_user_id FROM web.users
    WHERE external_user_id= current_setting('request.jwt.claim.sub', true)
;

GRANT INSERT, UPDATE, SELECT, DELETE ON web.users_view TO ergatas_web;

ALTER VIEW web.users_view OWNER TO  ergatas_dev;
GRANT INSERT,  SELECT ON web.users TO ergatas_dev;

CREATE OR REPLACE VIEW web.missionary_profiles_view AS  
    SELECT * FROM web.missionary_profiles
;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.missionary_profiles_view TO ergatas_web;

CREATE OR REPLACE RULE a_set_update_time AS ON UPDATE TO web.missionary_profiles_view DO INSTEAD
    UPDATE web.missionary_profiles
        SET data = NEW.data,
            last_updated_on = now()
        RETURNING *
;



CREATE OR REPLACE VIEW web.new_missionary_profile AS 
    SELECT '{
            "organization_key":0,
            "picture_url":"",
            "first_name":"",
            "last_name":"",
            "location":"",
            "country":"",
            "description":"",
            "donation_url":"",
            "location_lat":0.0,
            "location_long":0.0,
            "current_support_percentage":0.0,
            "donate_instructions":"",
            "job_catagory_keys": []
        }'::jsonb as data
;
GRANT SELECT ON web.new_missionary_profile TO ergatas_web;

CREATE OR REPLACE VIEW web.new_organization AS
    SELECT '{
            "ein":0,
            "name":"",
            "city":"",
            "state":"",
            "website":"",
            "description":""
        }'::jsonb as data
;
GRANT SELECT ON web.new_organization TO ergatas_web;



CREATE OR REPLACE VIEW web.organizations_view AS  
    SELECT * FROM web.organizations
    WHERE status = 'approved' AND organization_key > 0
;
GRANT INSERT,  SELECT ON web.organizations_view TO ergatas_web;

CREATE OR REPLACE VIEW web.pending_organizations_view AS  
    SELECT * FROM web.organizations
    WHERE status = 'pending' AND organization_key > 0
;
GRANT UPDATE,SELECT ON web.pending_organizations_view TO ergatas_org_admin;

CREATE OR REPLACE VIEW web.unapproved_organizations_view AS  
    SELECT ein,status FROM web.organizations
    WHERE status != 'approved' AND organization_key > 0
;
GRANT SELECT ON web.unapproved_organizations_view TO ergatas_web;




CREATE OR REPLACE VIEW web.job_catagories_view AS  
    SELECT * FROM web.job_catagories
;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.job_catagories_view TO ergatas_web;


--DROP VIEW web.profile_search CASCADE;
CREATE OR REPLACE VIEW web.profile_search AS   
    SELECT missionary_profile_key,user_key, external_user_id,
            (mp.data->>'first_name')||' '||(mp.data->>'last_name') as missionary_name,
            mp.data,
            (SELECT array_agg(t1) FROM jsonb_array_elements_text(mp.data -> 'job_catagory_keys') as t1) as job_catagory_keys,
            mp.data ->> 'location' as location,
            o.name as organization_name,
            mp.data ->>'current_support_percentage' as current_support_percentage,
           (mp.data->>'first_name')||' '||(mp.data->>'last_name')||' '|| (mp.data->>'location')||' '||(mp.data->>'description')
            ||' '||(mp.data->>'country') ||' '||o.name||' '||o.description as search_text
    FROM web.missionary_profiles as mp
         JOIN web.organizations as o ON(o.organization_key = (mp.data->>'organization_key')::int)
         JOIN web.users as u USING(user_key)
    WHERE (mp.data->>'current_support_percentage')::integer < 100
;
GRANT SELECT ON web.profile_search TO ergatas_web;

CREATE OR REPLACE FUNCTION web.profile_in_box(ne_lat numeric,ne_long numeric,sw_lat numeric,sw_long numeric)
RETURNS SETOF int AS $$
BEGIN
    RETURN QUERY EXECUTE 'SELECT missionary_profile_key FROM web.profile_search'||
        ' WHERE box ''(('||ne_long||','||ne_lat||'),('||sw_long||','||sw_lat||'))'' @> 
                    point ((data->''location_long'')::float,(data->''location_lat'')::float)';
END
$$ LANGUAGE 'plpgsql'IMMUTABLE SECURITY DEFINER;
ALTER FUNCTION web.profile_in_box OWNER TO ergatas_web;

CREATE OR REPLACE VIEW web.featured_profiles AS
    SELECT * FROM web.profile_search
        ORDER BY random()
        LIMIT 3
;
GRANT SELECT ON web.featured_profiles TO ergatas_web;


CREATE OR REPLACE VIEW web.possible_transactions_view AS
    SELECT * FROM web.possible_transactions
;
ALTER VIEW web.possible_transactions_view OWNER TO ergatas_dev;
GRANT INSERT, SELECT ON web.possible_transactions TO ergatas_dev;
GRANT usage ON SEQUENCE web.possible_transactions_possible_transaction_key_seq TO ergatas_web;
GRANT INSERT ON web.possible_transactions_view TO ergatas_web;
GRANT SELECT ON web.possible_transactions_view TO ergatas_site_admin;


CREATE OR REPLACE VIEW web.email_hashes_view AS 
    SELECT * FROM web.email_hashes
;
ALTER VIEW web.email_hashes_view  OWNER TO ergatas_dev;
GRANT SELECT, INSERT, DELETE ON web.email_hashes_view TO ergatas_server;
GRANT SELECT, INSERT, DELETE ON web.email_hashes TO ergatas_dev;



ALTER VIEW web.missionary_profiles_view OWNER TO  ergatas_dev;
GRANT SELECT ON web.users TO ergatas_dev;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.missionary_profiles TO ergatas_dev;




-------------- ROW LEVEL POLICIES ----------------------

DROP POLICY IF EXISTS user_mods ON web.users;
CREATE POLICY user_mods ON web.users
    FOR ALL
  WITH CHECK (external_user_id= current_setting('request.jwt.claim.sub',true));


DROP POLICY IF EXISTS edit_missionary_profile ON web.missionary_profiles;
CREATE POLICY edit_missionary_profile ON web.missionary_profiles
    FOR ALL
  USING ( user_key = (select user_key from web.users where external_user_id=current_setting('request.jwt.claim.sub', true)))
;
