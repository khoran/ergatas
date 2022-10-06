

GRANT USAGE ON ALL  SEQUENCES IN SCHEMA web TO ergatas_dev, ergatas_server,ergatas_web, ergatas_view_owner;

-- TABLE PERMISIONS

GRANT SELECT  ON 
        web.job_catagories,
        web.tags,
        web.causes
    TO ergatas_view_owner;
GRANT SELECT, INSERT ON 
        web.possible_transactions
    TO ergatas_view_owner;
--GRANT SELECT, UPDATE ON 
    --TO ergatas_view_owner;
GRANT SELECT, INSERT, DELETE ON 
        web.email_hashes ,
        web.organization_listeners
    TO ergatas_view_owner;
GRANT SELECT, INSERT, UPDATE ON 
        web.users ,
        web.non_profits,
        web.organizations
    TO ergatas_view_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON 
        web.missionary_profiles ,
        web.profile_fts,
        web.push_subscriptions,
        web.message_queue,
        web.saved_searches
    TO ergatas_view_owner;


--saved searches
CREATE OR REPLACE VIEW web.saved_searches_view AS
    SELECT * FROM web.saved_searches
;
ALTER VIEW web.saved_searches_view OWNER TO ergatas_view_owner;
GRANT SELECT ON web.saved_searches_view TO stats;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.saved_searches_view TO ergatas_web;



--users
CREATE OR REPLACE VIEW web.users_view AS
    SELECT user_key,external_user_id,agreed_to_sof,
        EXISTS (SELECT 1 FROM web.missionary_profiles_view WHERE user_key = user_key) as has_profile,
        EXISTS (SELECT 1 FROM web.saved_searches_view WHERE user_key = user_key) as has_saved_search
            
    FROM web.users
;

GRANT INSERT, UPDATE, SELECT, DELETE ON web.users_view TO ergatas_web;
GRANT SELECT ON web.users_view TO stats;
ALTER VIEW web.users_view OWNER TO  ergatas_view_owner;


CREATE OR REPLACE VIEW web.user_info AS
    SELECT u.user_key, u.external_user_id,
        u.created_on as user_created,
        mp.missionary_profile_key IS NOT NULL as has_profile,
        mp.data->>'first_name' as first_name,
        mp.data->>'last_name' as last_name,
        max(ptx.created_on) as last_possible_tx_date,
        string_agg(ptx.created_on::varchar,',')  as tx_dates
    FROM web.users as u LEFT JOIN
         web.missionary_profiles as mp USING(user_key) LEFT JOIN
         web.possible_transactions as ptx USING(missionary_profile_key)
    WHERE
        coalesce(current_setting('request.jwt.claim.role',true),'') IN ('ergatas_site_admin','ergatas_server')
    GROUP BY u.user_key, u.external_user_id, first_name, last_name,mp.missionary_profile_key,user_created
         
;
GRANT SELECT ON web.user_info TO ergatas_web,stats,ergatas_server;
ALTER VIEW web.user_info OWNER TO  ergatas_dev;


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
ALTER VIEW web.profile_statuses OWNER TO  ergatas_dev;
GRANT SELECT,UPDATE ON web.profile_statuses TO ergatas_server;



CREATE OR REPLACE VIEW web.people_groups_with_workers AS
   SELECT DISTINCT codes as code
      FROM web.missionary_profiles, 
           jsonb_array_elements_text(data->'people_id3_codes') as codes
      WHERE state != 'disabled'
;
ALTER VIEW web.people_groups_with_workers OWNER TO  ergatas_dev;
GRANT SELECT ON web.people_groups_with_workers TO ergatas_web;

CREATE OR REPLACE VIEW web.countries_with_workers AS
      SELECT DISTINCT data->>'country_code' as code
         FROM web.missionary_profiles 
         WHERE state != 'disabled' AND data->>'country_code' != '' AND data->>'country_code' IS NOT NULL
;

ALTER VIEW web.countries_with_workers OWNER TO  ergatas_dev;
GRANT SELECT ON web.countries_with_workers TO ergatas_web;
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
            "job_catagory_keys": [],
            "marital_status": "",
            "kids_birth_years": [],
            "movement_stage": -1,
            "tag_keys":[],
            "cause_keys":[],
            "people_id3_codes":[],
            "rol3_codes":[],
            "video_url":"",
            "search_terms":"",
            "limit_social_media":false,
            "published":false
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
            "logo_url":"",
            "is_shell":false,
            "contact_email":""
        }'::jsonb as data
;
ALTER VIEW web.new_organization OWNER TO  ergatas_view_owner;
GRANT SELECT ON web.new_organization TO ergatas_web;



-- organizations

CREATE OR REPLACE VIEW web.organizations_view AS  
    SELECT o.organization_key,
           CASE WHEN np.is_shell THEN o.name
                ELSE np.registered_name 
           END as name,
           np.city,
           np.state,
           o.website,
           o.description,
           o.status,
           o.created_on,
           o.created_by,
           CASE WHEN NOT np.is_shell AND np.registered_name != o.name THEN o.name
                ELSE ''
           END as dba_name,
           o.logo_url,
           np.country_code,
           np.country_org_id,
           o.name::text as display_name,
           o.contact_email
    FROM web.organizations as o
         JOIN web.non_profits as np USING(non_profit_key)
    WHERE organization_key > 0
;
ALTER VIEW web.organizations_view OWNER TO  ergatas_view_owner;
GRANT   SELECT ON web.organizations_view TO ergatas_web;
REVOKE INSERT ON web.organizations_view FROM ergatas_web;
GRANT SELECT ON web.organizations_view TO stats;

-- this table allows inserts, but restricts the set of columns
-- to ensure only default values for them can be set initially
CREATE OR REPLACE VIEW web.create_organizations_view AS  
    SELECT o.organization_key,
           CASE WHEN np.is_shell THEN o.name
                ELSE np.registered_name 
           END as name,
           np.city,
           np.state,
           o.website,
           o.description,
           CASE WHEN NOT np.is_shell AND np.registered_name != o.name THEN o.name
                ELSE ''
           END as dba_name,
           np.country_code,
           np.country_org_id,
           o.logo_url,
           np.is_shell,
           o.contact_email
    FROM web.organizations as o
         JOIN web.non_profits as np USING(non_profit_key)
    WHERE organization_key > 0
;
ALTER VIEW web.create_organizations_view OWNER TO  ergatas_view_owner;
GRANT INSERT,  SELECT ON web.create_organizations_view TO ergatas_web;



CREATE OR REPLACE VIEW web.pending_organizations_view AS  
    SELECT o.organization_key,
           (select registered_name from web.non_profits where non_profit_key = o.non_profit_key) as name,
           (select city from web.non_profits where non_profit_key = o.non_profit_key) as city,
           (select state from web.non_profits where non_profit_key = o.non_profit_key) as state,
           o.website,
           o.description,
           o.status,
           o.created_on,
           o.created_by,
           o.name as dba_name,
           o.logo_url,
           (select country_code from web.non_profits where non_profit_key = o.non_profit_key) as country_code,
           (select country_org_id from web.non_profits where non_profit_key = o.non_profit_key) as country_org_id,
           o.contact_email
     FROM web.organizations as o
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

CREATE OR REPLACE VIEW web.organizations_with_profiles AS  
    SELECT (data->>'organization_key')::int as organization_key, organization_display_name as name, count(*)
    FROM web.profile_search
    GROUP BY 1,2
;
ALTER VIEW web.organizations_with_profiles OWNER TO  ergatas_dev;
GRANT SELECT  ON web.organizations_with_profiles TO ergatas_web;


-- job catagories

CREATE OR REPLACE VIEW web.job_catagories_view AS  
    SELECT * FROM web.job_catagories
;
ALTER VIEW web.job_catagories_view OWNER TO  ergatas_view_owner;
REVOKE INSERT, UPDATE,  DELETE ON web.job_catagories_view FROM ergatas_web;
GRANT SELECT  ON web.job_catagories_view TO ergatas_web;


-- tags
CREATE OR REPLACE VIEW web.tags_view AS  
    SELECT * FROM web.tags
;
ALTER VIEW web.tags_view OWNER TO  ergatas_view_owner;
GRANT SELECT  ON web.tags_view TO ergatas_web;

-- causes
CREATE OR REPLACE VIEW web.causes_view AS  
    SELECT * FROM web.causes
;
ALTER VIEW web.causes_view OWNER TO  ergatas_view_owner;
GRANT SELECT  ON web.causes_view TO ergatas_web;




-- searching

--DROP VIEW web.profile_search CASCADE;
CREATE OR REPLACE VIEW web.profile_search AS   
    SELECT missionary_profile_key,user_key, external_user_id,
            (mp.data->>'first_name')||' '||(mp.data->>'last_name') as missionary_name,
            mp.data,
            (SELECT array_agg(t1) FROM jsonb_array_elements_text(mp.data -> 'job_catagory_keys') as t1) as job_catagory_keys,
            mp.data ->> 'location' as location,
            CASE WHEN np.is_shell THEN o.name
                ELSE np.registered_name 
            END as organization_name,
            CASE WHEN NOT np.is_shell AND np.registered_name != o.name THEN o.name
                 ELSE ''
            END as organziation_dba_name,
            o.name as organization_display_name,
            o.logo_url,
            coalesce((mp.data ->>'current_support_percentage')::integer,0) as current_support_percentage,
            '' as search_text,
            fts.document,
            mp.created_on,
            to_char(mp.last_updated_on, 'Month DD, YYYY') as last_updated_on,
            mp.last_updated_on as last_updated_timestamp
    FROM web.missionary_profiles as mp
         JOIN web.organizations as o ON(o.organization_key = (mp.data->>'organization_key')::int)
         JOIN web.non_profits as np USING(non_profit_key)
         JOIN web.users as u USING(user_key)
         JOIN web.profile_fts as fts USING(missionary_profile_key)
    WHERE --(mp.data->>'current_support_percentage')::integer < 100
          --AND
          mp.state != 'disabled'
          --AND ( (data->>'published') IS NULL OR (data->'published')::boolean)
          AND (data->>'published')::boolean
;
ALTER VIEW web.profile_search OWNER TO  ergatas_dev;
GRANT SELECT ON web.profile_search TO ergatas_web,stats;

/* RUN THESE AFTER map migration
DROP FUNCTION IF EXISTS web.ranked_profiles();
DROP FUNCTION IF EXISTS web.ranked_profiles(text);


DROP FUNCTION IF EXISTS web.profile_in_box(numeric,numeric,numeric,numeric);
*/


--DROP FUNCTION IF EXISTS web.primary_search(text,numeric[],text,int[],int,int,int[],varchar(3)[],varchar,int,int[],int[],int[],varchar,int);

/** bounds is a array with 4 values: [ne_lat/top, ne_long/right, sw_lat/bottom, sw_long/left]
    kids_ages is an array of values indicating an age rage. 0: 0-5, 1: 6-10, 2: 11-15, 3: 16-20

*/
CREATE OR REPLACE FUNCTION web.primary_search_v2(query text,
                                              bounds numeric[],
                                              name text,
                                              organization_keys int[] ,                                               
                                              support_level_gte int, 
                                              support_level_lte int,
                                              job_catagory_keys int[],
                                              impact_countries varchar(3)[],
                                              marital_status varchar,
                                              movement_stages int[],
                                              birth_years int[],
                                              tag_keys int[],
                                              cause_keys int[],
                                              people_id3_codes int[],
                                              rol3_codes varchar[],
                                              cultural_distances int[],
                                              sort_field varchar,
                                              page_size int = 20,
                                              use_or boolean = false )
RETURNS jsonb AS $func$
DECLARE
ne_lat CONSTANT integer := 1;
ne_long CONSTANT integer := 2;
sw_lat CONSTANT integer := 3;
sw_long CONSTANT integer := 4;
full_query text;
page_query text;
condition text;
boundry_condition text;
order_by text;
secondary_order_by text;
all_results jsonb;
first_page jsonb;
filter_op text;
BEGIN

        IF use_or THEN
            filter_op := ' OR ';
            condition := ' FALSE ';
        ELSE
            filter_op := ' AND ';
            condition := ' TRUE ';
        END IF;
       
             
        IF query IS NOT NULL THEN
            condition := condition || format($$ %s
                (ps.document @@ websearch_to_tsquery(%L) OR
                        ps.document @@ websearch_to_tsquery('simple',%L) 
                )
            $$,filter_op,query,query);
        END IF;
                
        IF name IS NOT NULL AND name != '' THEN
            condition := condition || format($$ %s
                (ps.missionary_name ILIKE %L)
            $$,filter_op,'%'||name||'%');
        END IF;
        IF organization_keys IS NOT NULL AND array_length(organization_keys,1) > 0 THEN
            condition := condition || format($$ %s
                ((data->>'organization_key') = ANY(ARRAY['%s']))
            $$,filter_op,array_to_string(organization_keys,''','''));
        END IF;
        IF support_level_gte IS NOT NULL  THEN
            condition := condition || format($$ %s
                (current_support_percentage >= %s)
            $$,filter_op,support_level_gte);
        END IF;
        IF support_level_lte IS NOT NULL  THEN
            condition := condition || format($$ %s
                (current_support_percentage <= %s)
            $$,filter_op,support_level_lte);
        END IF;
        IF job_catagory_keys IS NOT NULL AND array_length(job_catagory_keys,1) > 0 THEN
            condition := condition || format($$ %s
                (job_catagory_keys && ARRAY['%s'])
            $$,filter_op,array_to_string(job_catagory_keys,''','''));
        END IF;
        IF impact_countries IS NOT NULL AND array_length(impact_countries,1) > 0 THEN
            condition := condition || format($$ %s
                ( (SELECT array_agg(t1) FROM jsonb_array_elements_text(data -> 'impact_countries') as t1) 
                    && ARRAY['%s'])
            $$,filter_op,array_to_string(impact_countries,''','''));
        END IF;

        IF marital_status IS NOT NULL AND marital_status != '' THEN
            condition := condition || format($$ %s
                (data->>'marital_status') = %L
                $$,filter_op, marital_status);
        END IF;

        IF birth_years IS NOT NULL AND array_length(birth_years,1) > 0 THEN
            condition := condition || format($$ %s
                ( (SELECT array_agg(t1) FROM jsonb_array_elements_text(data -> 'kids_birth_years') as t1) 
                    && ARRAY['%s'])
            $$,filter_op,array_to_string(birth_years,''','''));

        END IF;

        IF movement_stages IS NOT NULL AND array_length(movement_stages,1) > 0 THEN
            condition := condition || format($$ %s
                ((data->>'movement_stage') = ANY(ARRAY['%s']))
                $$,filter_op,array_to_string(movement_stages,''','''));
        END IF;

        IF tag_keys IS NOT NULL AND array_length(tag_keys,1) > 0 THEN
            condition := condition || format($$ %s
                ( (SELECT array_agg(t1) FROM jsonb_array_elements_text(data -> 'tag_keys') as t1) 
                    && ARRAY['%s'])
            $$,filter_op,array_to_string(tag_keys,''','''));

        END IF;

        IF cause_keys IS NOT NULL AND array_length(cause_keys,1) > 0 THEN
            condition := condition || format($$ %s
                ( (SELECT array_agg(t1) FROM jsonb_array_elements_text(data -> 'cause_keys') as t1) 
                    && ARRAY['%s'])
            $$,filter_op,array_to_string(cause_keys,''','''));

        END IF;

        IF people_id3_codes IS NOT NULL AND array_length(people_id3_codes,1) > 0 THEN
            condition := condition || format($$ %s
                ( (SELECT array_agg(t1) FROM jsonb_array_elements_text(data -> 'people_id3_codes') as t1) 
                    && ARRAY['%s'])
            $$,filter_op,array_to_string(people_id3_codes,''','''));

        END IF;

        IF rol3_codes IS NOT NULL AND array_length(rol3_codes,1) > 0 THEN
            condition := condition || format($$ %s
                ( (SELECT array_agg(t1) FROM jsonb_array_elements_text(data -> 'rol3_codes') as t1) 
                    && ARRAY['%s'])
            $$,filter_op,array_to_string(rol3_codes,''','''));

        END IF;

        IF cultural_distances IS NOT NULL AND array_length(cultural_distances,1) > 0 THEN
            condition := condition || format($$ %s
                ((data->>'cultural_distance') = ANY(ARRAY['%s']))
                $$,filter_op,array_to_string(cultural_distances,''','''));
        END IF;



        -- KEEP BOUNDRY LAST
        IF bounds IS NOT NULL AND array_length(bounds,1) = 4 THEN
            boundry_condition := format($$ 
                (   (data->'location_lat')::float != 0 AND
                    (data->'location_long')::float != 0 AND
                    CASE WHEN  %s >= (data->'location_lat')::float AND (data->'location_lat')::float >= %s THEN
                            CASE
                                WHEN  %s <= %s AND %s <= (data->'location_long')::float AND (data->'location_long')::float <= %s THEN true
                                WHEN  %s > %s AND (%s <= (data->'location_long')::float OR (data->'location_long')::float <= %s ) THEN true
                                ELSE  false
                            END
                        ELSE false
                    END
                )
            $$,bounds[ne_lat],bounds[sw_lat],
                bounds[sw_long],bounds[ne_long],bounds[sw_long],bounds[ne_long],
                bounds[sw_long],bounds[ne_long],bounds[sw_long],bounds[ne_long]);

            -- we always want the boundry to be and'ed.
            condition := format($$ %s AND ( %s )$$,boundry_condition,condition);
        END IF;
       

        order_by :=  
            CASE sort_field
                WHEN 'rank,desc' THEN ' ORDER BY rank DESC'
                WHEN 'current_support_percentage,asc' THEN ' ORDER BY current_support_percentage ASC '
                WHEN 'current_support_percentage,desc' THEN ' ORDER BY current_support_percentage DESC '
                WHEN 'created_on,desc' THEN ' ORDER BY created_on DESC '
                WHEN 'organization_display_name' THEN ' ORDER BY organization_display_name ASC'
                ELSE 'ORDER BY missionary_profile_key DESC'
            END;

        -- add a secondary key to keep sort order stable when there are ties with first sort field
        order_by := order_by || ', last_updated_timestamp DESC, missionary_profile_key DESC';



        full_query:= format($$ SELECT missionary_profile_key,
                            (data->'location_lat')::float as lat, (data->'location_long')::float as long
                        FROM web.profile_search as ps
                        WHERE %s
                        %s
                     $$,
                        condition,
                        -- insert rank expresion if we're sorting on rank
                        CASE sort_field
                            WHEN 'rank,desc' THEN format($$
                                    ORDER BY (ts_rank_cd(ps.document,websearch_to_tsquery('simple',%L)) +
                                               ts_rank_cd(ps.document,websearch_to_tsquery(%L))), 
                                             last_updated_timestamp DESC, missionary_profile_key DESC
                                $$,query,query)
                            ELSE order_by
                        END
                     );

        page_query:= format( $$ SELECT *, 
                                    ts_rank_cd(ps.document,websearch_to_tsquery('simple',%L)) +
                                    ts_rank_cd(ps.document,websearch_to_tsquery(%L)) as rank
                        FROM web.profile_search as ps
                        WHERE %s
                        %s
                        LIMIT %L
                     $$,query,query,condition, order_by, page_size); 
        
        --EXECUTE full_query;
        --EXECUTE page_query;
        EXECUTE format($$ SELECT json_agg(t) FROM (%s) as t $$,full_query) INTO all_results;
        --TODO: test if its faster to extract first page_size keys from all_results and use it to filter
        -- for first_page, or to just run whole query and use a limit
        EXECUTE format($$ SELECT json_agg(t) FROM (%s) as t $$,page_query) INTO first_page;

    
    --RETURN jsonb_build_object('foo',2,'bounds',bounds,'sb',support_bound,'org_name',org_name,'query',full_query,'page_query',page_query);
    RETURN jsonb_build_object('all_results', all_results, 'first_page',first_page);
                              --'full_query',full_query,'page_query',page_query);
END
$func$ LANGUAGE 'plpgsql'IMMUTABLE SECURITY DEFINER;
ALTER FUNCTION web.primary_search_v2(
        text, numeric[], text, int[] , int, int, int[], varchar(3)[],
        varchar, int[], int[], int[], int[], int[], varchar[], int[], varchar, int, boolean 
    ) OWNER TO ergatas_web;



-- featured_profiles is no longer needed
CREATE OR REPLACE VIEW web.featured_profiles AS
    SELECT * FROM web.profile_search
        ORDER BY random()
        LIMIT 3
;
ALTER VIEW web.featured_profiles OWNER TO  ergatas_dev;
GRANT SELECT ON web.featured_profiles TO ergatas_web;

CREATE OR REPLACE VIEW web.random_profiles AS
    SELECT * FROM web.profile_search
        ORDER BY random()
;
ALTER VIEW web.random_profiles OWNER TO  ergatas_dev;
GRANT SELECT ON web.random_profiles TO ergatas_web;


-- transactions

CREATE OR REPLACE VIEW web.possible_transactions_view AS
    SELECT * FROM web.possible_transactions
;
ALTER VIEW web.possible_transactions_view OWNER TO ergatas_view_owner;
GRANT INSERT ON web.possible_transactions_view TO ergatas_web;
GRANT SELECT ON web.possible_transactions_view TO ergatas_site_admin,stats;
GRANT SELECT,INSERT ON web.possible_transactions_view TO ergatas_server;



-- email communications

CREATE OR REPLACE VIEW web.email_hashes_view AS 
    SELECT * FROM web.email_hashes
;
ALTER VIEW web.email_hashes_view  OWNER TO ergatas_view_owner;
GRANT SELECT, INSERT, DELETE ON web.email_hashes_view TO ergatas_server;
GRANT SELECT ON web.email_hashes_view TO stats;


-- push subscriptions
CREATE OR REPLACE VIEW web.push_subs_view AS
   SELECT * FROM web.push_subscriptions
;
ALTER VIEW web.push_subs_view OWNER TO ergatas_view_owner;
GRANT SELECT, INSERT, DELETE, UPDATE ON web.push_subs_view TO ergatas_server;

-- message queue
CREATE OR REPLACE VIEW web.message_queue_view AS
   SELECT * FROM web.message_queue
;
ALTER VIEW web.message_queue_view OWNER TO ergatas_view_owner;
GRANT SELECT, INSERT, DELETE ON web.message_queue_view TO ergatas_server;
GRANT SELECT ON web.message_queue_view TO stats;


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

DROP POLICY IF EXISTS edit_saved_search ON web.saved_searches;
CREATE POLICY edit_saved_search ON web.saved_searches
    FOR ALL
  USING ( user_key = (select user_key from web.users 
                        where external_user_id = coalesce(current_setting('request.jwt.claim.sub', true),'')))
;
