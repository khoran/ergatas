

GRANT USAGE ON ALL  SEQUENCES IN SCHEMA web TO ergatas_dev, ergatas_server,ergatas_web;

GRANT USAGE ON SCHEMA web TO ergatas_view_owner,ergatas_server,stats;

-- TABLE PERMISIONS

GRANT SELECT  ON 
        web.job_catagories
    TO ergatas_view_owner;
GRANT SELECT, INSERT ON 
        web.possible_transactions
    TO ergatas_view_owner;
--GRANT SELECT, UPDATE ON 
    --TO ergatas_view_owner;
GRANT SELECT, INSERT, DELETE ON 
        web.users ,
        web.email_hashes ,
        web.organization_listeners
    TO ergatas_view_owner;
GRANT SELECT, INSERT, UPDATE ON 
        web.organizations
    TO ergatas_view_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON 
        web.missionary_profiles ,
        web.profile_fts
    TO ergatas_view_owner;




--users
CREATE OR REPLACE VIEW web.users_view AS
    SELECT user_key,external_user_id FROM web.users
--    WHERE external_user_id= current_setting('request.jwt.claim.sub', true)
;

GRANT INSERT, UPDATE, SELECT, DELETE ON web.users_view TO ergatas_web;
GRANT SELECT ON web.users_view TO stats;
ALTER VIEW web.users_view OWNER TO  ergatas_view_owner;




-- missionary profiles
CREATE OR REPLACE VIEW web.missionary_profiles_view AS  
    SELECT * FROM web.missionary_profiles
;
ALTER VIEW web.missionary_profiles_view OWNER TO  ergatas_view_owner;
GRANT SELECT ON web.missionary_profiles_view TO stats;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.missionary_profiles_view TO ergatas_web;

CREATE OR REPLACE RULE a_set_update_time AS ON UPDATE TO web.missionary_profiles_view DO INSTEAD
    UPDATE web.missionary_profiles
        SET data = NEW.data,
            last_updated_on = now(),
            state = 'current' --set to current, since were doing an update right now
        WHERE missionary_profile_key = NEW.missionary_profile_key
        RETURNING *
;

CREATE OR REPLACE VIEW web.profile_statuses AS  
    SELECT missionary_profile_key,
           (SELECT external_user_id FROM web.users WHERE user_key=mp.user_key) as external_user_id,
           last_updated_on,
           state,
           (data->>'current_support_percentage')::integer as current_support_percentage
    FROM web.missionary_profiles as mp
         
    WHERE state != 'disabled'
;
-- set ownership to a superuser to get around RLP
ALTER VIEW web.profile_statuses OWNER TO  ergatas_view_owner;
GRANT SELECT,UPDATE ON web.profile_statuses TO ergatas_server;



-- new objects

CREATE OR REPLACE VIEW web.new_missionary_profile AS 
    SELECT '{
            "organization_key":0,
            "picture_url":"",
            "first_name":"",
            "last_name":"",
            "location":"",
            "country":"",
            "country_code":"",
            "description":"",
            "donation_url":"",
            "location_lat":0.0,
            "location_long":0.0,
            "current_support_percentage":0,
            "donate_instructions":"",
            "impact_countries":[],
            "job_catagory_keys": []
        }'::jsonb as data
;
ALTER VIEW web.new_missionary_profile OWNER TO  ergatas_view_owner;
GRANT SELECT ON web.new_missionary_profile TO ergatas_web;

CREATE OR REPLACE VIEW web.new_organization AS
    SELECT '{
            "country_code":"usa",
            "country_org_id":"",
            "name":"",
            "dba_name":"",
            "city":"",
            "state":"",
            "website":"",
            "description":"",
            "logo_url":""
        }'::jsonb as data
;
ALTER VIEW web.new_organization OWNER TO  ergatas_view_owner;
GRANT SELECT ON web.new_organization TO ergatas_web;



-- organizations

CREATE OR REPLACE VIEW web.organizations_view AS  
    SELECT *, COALESCE(nullif(dba_name,''),name) as display_name     
    FROM web.organizations
    WHERE organization_key > 0
;
ALTER VIEW web.organizations_view OWNER TO  ergatas_view_owner;
GRANT   SELECT ON web.organizations_view TO ergatas_web;
REVOKE INSERT ON web.organizations_view FROM ergatas_web;
GRANT SELECT ON web.organizations_view TO stats;

-- this table allows inserts, but restricts the set of columns
-- to ensure only default values for them can be set initially
CREATE OR REPLACE VIEW web.create_organizations_view AS  
    SELECT organization_key, name, city, state, website, description, 
            dba_name,country_code, country_org_id, logo_url
    FROM web.organizations
    WHERE organization_key > 0
;
ALTER VIEW web.create_organizations_view OWNER TO  ergatas_view_owner;
GRANT INSERT,  SELECT ON web.create_organizations_view TO ergatas_web;



CREATE OR REPLACE VIEW web.pending_organizations_view AS  
    SELECT * FROM web.organizations
    WHERE status = 'pending' AND organization_key > 0
;
ALTER VIEW web.pending_organizations_view OWNER TO  ergatas_view_owner;
GRANT UPDATE,SELECT ON web.pending_organizations_view TO ergatas_org_admin;


CREATE OR REPLACE VIEW web.organization_listeners_view AS   
    SELECT organization_key, user_key
    FROM web.organization_listeners
;
ALTER VIEW web.organization_listeners_view OWNER TO  ergatas_view_owner;
GRANT SELECT, INSERT ON web.organization_listeners_view TO ergatas_web;
GRANT DELETE ON web.organization_listeners_view TO ergatas_org_admin;
GRANT SELECT ON web.organization_listeners_view TO stats;

CREATE OR REPLACE VIEW web.organization_users_to_notify AS   
    SELECT organization_key, user_key, external_user_id
    FROM web.organization_listeners JOIN web.users USING(user_key)
;
--ALTER VIEW web.organization_users_to_notify OWNER TO  ergatas_view_owner;
--assign to ergatas_dev to bypass row level restrictions on users table
ALTER VIEW web.organization_users_to_notify OWNER TO  ergatas_dev; 
REVOKE SELECT ON web.organization_users_to_notify FROM ergatas_web;
GRANT SELECT ON web.organization_users_to_notify TO ergatas_org_admin;


-- job catagories

CREATE OR REPLACE VIEW web.job_catagories_view AS  
    SELECT * FROM web.job_catagories
;
ALTER VIEW web.job_catagories_view OWNER TO  ergatas_view_owner;
REVOKE INSERT, UPDATE,  DELETE ON web.job_catagories_view FROM ergatas_web;
GRANT SELECT  ON web.job_catagories_view TO ergatas_web;



-- searching

--DROP VIEW web.profile_search CASCADE;
CREATE OR REPLACE VIEW web.profile_search AS   
    SELECT missionary_profile_key,user_key, external_user_id,
            (mp.data->>'first_name')||' '||(mp.data->>'last_name') as missionary_name,
            mp.data,
            (SELECT array_agg(t1) FROM jsonb_array_elements_text(mp.data -> 'job_catagory_keys') as t1) as job_catagory_keys,
            mp.data ->> 'location' as location,
            o.name as organization_name,
            o.dba_name as organziation_dba_name,
            coalesce(nullif(o.dba_name,''),o.name)::varchar as organization_display_name,
            o.logo_url,
            coalesce((mp.data ->>'current_support_percentage')::integer,0) as current_support_percentage,
           (mp.data->>'first_name')||' '||(mp.data->>'last_name')||' '|| (mp.data->>'location')||' '||(mp.data->>'description')
            ||' '||(mp.data->>'country') ||' '||o.name||' '||o.description as search_text,
            fts.document,
            mp.created_on,
            to_char(mp.last_updated_on, 'Month DD, YYYY') as last_updated_on
    FROM web.missionary_profiles as mp
         JOIN web.organizations as o ON(o.organization_key = (mp.data->>'organization_key')::int)
         JOIN web.users as u USING(user_key)
         JOIN web.profile_fts as fts USING(missionary_profile_key)
    WHERE (mp.data->>'current_support_percentage')::integer < 100
;
ALTER VIEW web.profile_search OWNER TO  ergatas_dev;
GRANT SELECT ON web.profile_search TO ergatas_web,stats;

DROP FUNCTION IF EXISTS web.ranked_profiles();
CREATE OR REPLACE FUNCTION web.ranked_profiles()
RETURNS TABLE (
    missionary_profile_key integer,
    user_key integer,
    external_user_id varchar(255),
    missionary_name text,
    data jsonb,
    job_catagory_keys text[],
    location text,
    organization_name varchar,
    organization_dba_name varchar,
    organization_display_name varchar,
    logo_url varchar,
    current_support_percentage integer,
    search_text text,
    document tsvector,
    created_on timestamp,
    last_updated_on text,
    rank real
) AS $$
BEGIN
    RETURN QUERY SELECT *, 1.0::real as rank
        FROM web.profile_search;
END
$$ LANGUAGE 'plpgsql' IMMUTABLE SECURITY DEFINER;
ALTER FUNCTION web.ranked_profiles() OWNER TO ergatas_web;



DROP FUNCTION IF EXISTS web.ranked_profiles(text);
CREATE OR REPLACE FUNCTION web.ranked_profiles(query text)
RETURNS TABLE (
    missionary_profile_key integer,
    user_key integer,
    external_user_id varchar(255),
    missionary_name text,
    data jsonb,
    job_catagory_keys text[],
    location text,
    organization_name varchar,
    organization_dba_name varchar,
    organization_display_name varchar,
    logo_url varchar,
    current_support_percentage integer,
    search_text text,
    document tsvector,
    created_on timestamp,
    last_updated_on text,
    rank real
) AS $$
BEGIN
    RETURN QUERY SELECT *, 
            ts_rank_cd(ps.document,websearch_to_tsquery('simple',query)) +
            ts_rank_cd(ps.document,websearch_to_tsquery(query)) as rank
        FROM web.profile_search as ps
        WHERE  ps.document @@ websearch_to_tsquery(query) OR
               ps.document @@ websearch_to_tsquery('simple',query)
        ORDER BY rank DESC;
END
$$ LANGUAGE 'plpgsql'IMMUTABLE SECURITY DEFINER;
ALTER FUNCTION web.ranked_profiles(text) OWNER TO ergatas_web;



DROP FUNCTION IF EXISTS web.profile_in_box(numeric,numeric,numeric,numeric);
--                                            top            right           bottom         left
CREATE OR REPLACE FUNCTION web.profile_in_box(ne_lat numeric,ne_long numeric,sw_lat numeric,sw_long numeric)
RETURNS SETOF int AS $$
BEGIN
    RETURN QUERY EXECUTE 'SELECT missionary_profile_key FROM web.profile_search'||
        ' WHERE  CASE WHEN  '||ne_lat||' >= (data->''location_lat'')::float AND (data->''location_lat'')::float >= '||sw_lat||' THEN
                        CASE
                            WHEN  '||sw_long||' <= '||ne_long||' AND '||sw_long||'<= (data->''location_long'')::float AND (data->''location_long'')::float <= '||ne_long||' THEN true
                            WHEN  '||sw_long||' > '||ne_long||' AND ('||sw_long||' <= (data->''location_long'')::float OR (data->''location_long'')::float <= '||ne_long||') THEN true
                            ELSE  false
                        END
                    ELSE false
                END';
END
$$ LANGUAGE 'plpgsql'IMMUTABLE SECURITY DEFINER;
ALTER FUNCTION web.profile_in_box OWNER TO ergatas_web;

CREATE OR REPLACE VIEW web.featured_profiles AS
    SELECT * FROM web.profile_search
        ORDER BY random()
        LIMIT 3
;
ALTER VIEW web.featured_profiles OWNER TO  ergatas_dev;
GRANT SELECT ON web.featured_profiles TO ergatas_web;



-- transactions

CREATE OR REPLACE VIEW web.possible_transactions_view AS
    SELECT * FROM web.possible_transactions
;
ALTER VIEW web.possible_transactions_view OWNER TO ergatas_view_owner;
GRANT INSERT ON web.possible_transactions_view TO ergatas_web;
GRANT SELECT ON web.possible_transactions_view TO ergatas_site_admin;
GRANT SELECT ON web.possible_transactions_view TO stats;



-- email communications

CREATE OR REPLACE VIEW web.email_hashes_view AS 
    SELECT * FROM web.email_hashes
;
ALTER VIEW web.email_hashes_view  OWNER TO ergatas_view_owner;
GRANT SELECT, INSERT, DELETE ON web.email_hashes_view TO ergatas_server;
GRANT SELECT ON web.email_hashes_view TO stats;



-------------- ROW LEVEL POLICIES ----------------------

DROP POLICY IF EXISTS user_mods ON web.users;
CREATE POLICY user_mods ON web.users
    FOR ALL
  USING (external_user_id = coalesce(current_setting('request.jwt.claim.sub',true),''));


DROP POLICY IF EXISTS edit_missionary_profile ON web.missionary_profiles;
CREATE POLICY edit_missionary_profile ON web.missionary_profiles
    FOR ALL
  USING ( user_key = (select user_key from web.users 
                        where external_user_id = coalesce(current_setting('request.jwt.claim.sub', true),'')))
;
