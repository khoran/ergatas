

CREATE OR REPLACE VIEW web.users_view AS
    SELECT * FROM web.users
    WHERE email = current_setting('request.jwt.claim.email', true)
;

GRANT INSERT, UPDATE, SELECT, DELETE ON web.users_view TO ergatas_web;

CREATE OR REPLACE VIEW web.missionary_profiles_view AS  
    SELECT *FROM web.missionary_profiles
;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.missionary_profiles_view TO ergatas_web;

CREATE OR REPLACE VIEW web.profile_jobs_view AS  
    SELECT * FROM web.profile_jobs
;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.profile_jobs_view TO ergatas_web;

/* not sure this is needed
CREATE OR REPLACE VIEW web.profile_jobs_view2 AS  
    SELECT pj.missionary_profile_key, jc.*
    FROM web.profile_jobs as pj
         JOIN web.job_catagories jc USING(job_catagory_key)
;
GRANT SELECT ON web.profile_jobs_view2 TO ergatas_web;
*/



CREATE OR REPLACE VIEW web.organizations_view AS  
    SELECT * FROM web.organizations
    WHERE organization_key > 0
;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.organizations_view TO ergatas_web;

CREATE OR REPLACE VIEW web.job_catagories_view AS  
    SELECT * FROM web.job_catagories
;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.job_catagories_view TO ergatas_web;


--DROP VIEW web.profile_search;
CREATE OR REPLACE VIEW web.profile_search AS   
    SELECT user_key,first_name||' '||last_name as missionary_name,
           organization_key,org_name as organization_name, org_main_url as organization_url, org_description as organization_description,
           string_agg(catagory,'|') as job_catagories,
           missionary_profile_key,location,mp.description as profile_description, donation_url, location_lat, location_long, current_support_percentage,
           picture_url,mp.created_on,country,
           first_name||' '||last_name||' '||' '||org_name||' '||org_description||' '||coalesce(string_agg(catagory,'|'),'')||' '||
            location||' '||mp.description||' '||country as search_text,
            point (location_long,location_lat) as location_point
    FROM web.missionary_profiles as mp
         JOIN web.users USING(user_key)
         LEFT JOIN web.profile_jobs USING(missionary_profile_key)
         LEFT JOIN web.job_catagories USING(job_catagory_key)
    GROUP BY
        user_key,email,first_name,last_name,
        organization_key,org_name , org_main_url , org_description ,
        missionary_profile_key,location,mp.description , donation_url, location_lat, location_long, current_support_percentage
;
GRANT SELECT ON web.profile_search TO ergatas_web;

CREATE OR REPLACE FUNCTION web.profile_in_box(ne_lat numeric,ne_long numeric,sw_lat numeric,sw_long numeric)
RETURNS SETOF int AS $$
BEGIN
    RETURN QUERY EXECUTE 'SELECT missionary_profile_key FROM web.profile_search'||
        ' WHERE box ''(('||ne_long||','||ne_lat||'),('||sw_long||','||sw_lat||'))'' @> point (location_long,location_lat)';
END
$$ LANGUAGE 'plpgsql'IMMUTABLE SECURITY DEFINER;
ALTER FUNCTION web.profile_in_box OWNER TO ergatas_web;

CREATE OR REPLACE VIEW web.featured_profiles AS
    SELECT * FROM web.profile_search
        ORDER BY random()
        LIMIT 3
;
GRANT SELECT ON web.featured_profiles TO ergatas_web;


ALTER VIEW web.missionary_profiles_view OWNER TO  ergatas_dev;
GRANT SELECT ON web.users TO ergatas_dev;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.missionary_profiles TO ergatas_dev;



CREATE OR REPLACE VIEW web.table_fields AS
    SELECT c.relname as table_name,
           a.attname as field_name,
           pg_catalog.format_type(a.atttypid, a.atttypmod) as type

    FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON(c.oid=a.attrelid)
        LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind='v' AND n.nspname='web' AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY 1,2
;
ALTER VIEW web.table_fields OWNER TO  ergatas_dev;
GRANT SELECT ON web.table_fields TO ergatas_web;



-------------- ROW LEVEL POLICIES ----------------------

--CREATE POLICY user_mods ON web.users
 -- USING (username = current_user);


DROP POLICY edit_missionary_profile ON web.missionary_profiles;
CREATE POLICY edit_missionary_profile ON web.missionary_profiles
    FOR ALL
  USING ( user_key = (select user_key from web.users where email=current_setting('request.jwt.claim.email', true)))
;

DROP POLICY edit_profile_job ON web.profile_jobs;
CREATE POLICY edit_profile_job ON web.profile_jobs
  USING ( missionary_profile_key = (
      select missionary_profile_key 
      from web.users join web.missionary_profiles USING(user_key) 
      where email=current_setting('request.jwt.claim.email', true)))
;
