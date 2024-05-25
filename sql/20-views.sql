

GRANT USAGE ON ALL  SEQUENCES IN SCHEMA web TO ergatas_dev, ergatas_server,ergatas_web, ergatas_view_owner;

-- TABLE PERMISIONS

GRANT SELECT  ON 
        web.job_catagories,
        web.tags,
        web.causes
    TO ergatas_view_owner;
--GRANT SELECT, INSERT ON 
    --TO ergatas_view_owner;
--GRANT SELECT, UPDATE ON 
    --TO ergatas_view_owner;
GRANT SELECT, INSERT, DELETE ON 
        web.email_hashes ,
        web.organization_listeners,
        web.profile_invitations,
        web.cached_user_permissions
    TO ergatas_view_owner;
GRANT SELECT, INSERT, UPDATE ON 
        web.users ,
        web.non_profits,
        web.possible_transactions,
        web.organizations
    TO ergatas_view_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON 
        web.missionary_profiles ,
        web.profile_fts,
        web.push_subscriptions,
        web.message_queue,
        web.saved_searches,
        web.public_searches,
        web.user_profile_permissions
    TO ergatas_view_owner;


--saved searches
CREATE OR REPLACE VIEW web.saved_searches_view AS
    SELECT * FROM web.saved_searches
;
ALTER VIEW web.saved_searches_view OWNER TO ergatas_view_owner;
GRANT SELECT ON web.saved_searches_view TO stats;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.saved_searches_view TO ergatas_web;

CREATE OR REPLACE VIEW web.public_searches_view AS
    SELECT * FROM web.public_searches
;
ALTER VIEW web.public_searches_view OWNER TO ergatas_view_owner;
GRANT SELECT ON web.public_searches_view TO stats, ergatas_web;

CREATE OR REPLACE VIEW web.manage_public_searches AS
    SELECT * FROM web.public_searches
    WHERE coalesce(current_setting('request.jwt.claim.role',true),'') 
            IN ('public_search_manager')
;
ALTER VIEW web.manage_public_searches OWNER TO ergatas_view_owner;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.manage_public_searches TO ergatas_web;




--users
CREATE OR REPLACE VIEW web.users_view AS
    SELECT user_key,external_user_id,agreed_to_sof,search_filter,
        EXISTS (SELECT 1 FROM web.missionary_profiles_view WHERE user_key = u.user_key) as has_profile,
        EXISTS (SELECT 1 FROM web.saved_searches_view WHERE user_key = u.user_key) as has_saved_search,
        EXISTS (SELECT 1 FROM web.user_profile_permissions as upp WHERE upp.user_key = u.user_key and not upp.read_only) as is_org_admin
            
    FROM web.users as u
;

GRANT INSERT, UPDATE, SELECT, DELETE ON web.users_view TO ergatas_web,ergatas_server;
GRANT SELECT ON web.users_view TO stats;
ALTER VIEW web.users_view OWNER TO  ergatas_view_owner;


CREATE OR REPLACE VIEW web.user_info AS
    SELECT u.user_key, u.external_user_id,
        u.created_on as user_created,
        mp.missionary_profile_key IS NOT NULL as has_profile,
        mp.data->>'first_name' as first_name,
        mp.data->>'last_name' as last_name,
        max(ptx.created_on) as last_possible_tx_date,
        string_agg(ptx.created_on::varchar,',')  as tx_dates,
        ss.saved_search_key IS NOT NULL as has_saved_search,
        upp.user_profile_permission_key IS NOT NULL and not upp.read_only as is_org_admin
    FROM web.users as u LEFT JOIN
         web.missionary_profiles as mp USING(user_key) LEFT JOIN
         web.saved_searches as ss USING(user_key) LEFT JOIN
         web.possible_transactions as ptx USING(missionary_profile_key) LEFT JOIN
         web.user_profile_permissions as upp USING(user_key)
    WHERE
        coalesce(current_setting('request.jwt.claim.role',true),'') IN ('ergatas_site_admin','ergatas_server')
    GROUP BY u.user_key, u.external_user_id, first_name, last_name,
        mp.missionary_profile_key,user_created,ss.saved_search_key,
        upp.user_profile_permission_key
         
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
            --state = 'current' --set to current, since were doing an update right now
            state = CASE state WHEN 'blocked' THEN 'blocked'::profile_state ELSE 'current'::profile_state END
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
         
    WHERE state NOT IN ('disabled','blocked')
;
-- set ownership to a superuser to get around RLP
ALTER VIEW web.profile_statuses OWNER TO  ergatas_dev;
GRANT SELECT,UPDATE ON web.profile_statuses TO ergatas_server;


-- profile permissions
CREATE OR REPLACE VIEW web.user_profile_permissions_view AS
    SELECT * FROM web.user_profile_permissions;
GRANT SELECT ON web.user_profile_permissions_view TO ergatas_web;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.user_profile_permissions_view TO ergatas_site_admin,ergatas_server;
ALTER VIEW web.user_profile_permissions_view OWNER TO ergatas_view_owner;


DROP VIEW web.user_org_search_filters CASCADE;
CREATE OR REPLACE VIEW web.user_org_search_filters AS
    SELECT u.user_key, u.external_user_id,
           o.organization_key, o.search_filter, 
           p.user_profile_permission_key, p.read_only
    FROM web.users as u 
         JOIN web.user_profile_permissions as p USING(user_key)
         JOIN web.organizations as o USING(organization_key)
;
ALTER VIEW web.user_org_search_filters OWNER TO  ergatas_dev;
GRANT SELECT ON web.user_org_search_filters TO ergatas_server;

CREATE OR REPLACE VIEW web.cached_user_permissions_view AS  
    SELECT * FROM web.cached_user_permissions
;
ALTER VIEW web.cached_user_permissions_view OWNER TO  ergatas_view_owner;
GRANT INSERT, DELETE ON web.cached_user_permissions_view TO ergatas_server;
GRANT SELECT ON web.cached_user_permissions_view TO ergatas_web;

CREATE OR REPLACE VIEW web.people_groups_with_workers AS
   SELECT DISTINCT codes as code
      FROM web.missionary_profiles, 
           jsonb_array_elements_text(data->'people_id3_codes') as codes
      WHERE state NOT IN ('disabled','blocked')
;
ALTER VIEW web.people_groups_with_workers OWNER TO  ergatas_dev;
GRANT SELECT ON web.people_groups_with_workers TO ergatas_web;

CREATE OR REPLACE VIEW web.countries_with_workers AS
      SELECT DISTINCT data->>'country_code' as code
         FROM web.missionary_profiles 
         WHERE state NOT IN ('disabled','blocked')
            AND data->>'country_code' != '' AND data->>'country_code' IS NOT NULL
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
            "on_site_donation":true,
            "use_mpk_prefix":true,
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
            "contact_email":"",
            "is_sending_org":true,
            "search_filter":{},
            "slug":""
        }'::jsonb as data
;
ALTER VIEW web.new_organization OWNER TO  ergatas_view_owner;
GRANT SELECT ON web.new_organization TO ergatas_web;



-- organizations

CREATE OR REPLACE VIEW web.non_profit_and_organizations_view AS  
    SELECT o.organization_key,
           CASE WHEN np.is_shell THEN o.name
                ELSE np.registered_name 
           END as name,
           np.city,
           np.state,
           np.is_shell,
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
           o.contact_email,
           o.is_sending_org,
           o.search_filter,
           o.slug
    FROM web.organizations as o
         JOIN web.non_profits as np USING(non_profit_key)
    WHERE organization_key > 0
;
ALTER VIEW web.non_profit_and_organizations_view OWNER TO  ergatas_view_owner;
GRANT SELECT,INSERT ON web.non_profit_and_organizations_view TO ergatas_web;
GRANT SELECT ON web.non_profit_and_organizations_view TO stats;

DROP VIEW web.organizations_view CASCADE;
CREATE OR REPLACE VIEW web.organizations_view AS
    SELECT * FROM web.organizations
;
ALTER VIEW web.organizations_view OWNER TO  ergatas_view_owner;
GRANT SELECT, INSERT, UPDATE ON web.organizations_view TO ergatas_server,ergatas_web;


-- this table allows inserts, but restricts the set of columns
-- to ensure only default values for them can be set initially
--CREATE OR REPLACE VIEW web.create_organizations_view AS  
--    SELECT o.organization_key,
--           CASE WHEN np.is_shell THEN o.name
--                ELSE np.registered_name 
--           END as name,
--           np.city,
--           np.state,
--           o.website,
--           o.description,
--           CASE WHEN NOT np.is_shell AND np.registered_name != o.name THEN o.name
--                ELSE ''
--           END as dba_name,
--           np.country_code,
--           np.country_org_id,
--           o.logo_url,
--           np.is_shell,
--           o.contact_email,
--           is_sending_org
--    FROM web.organizations as o
--         JOIN web.non_profits as np USING(non_profit_key)
--    WHERE organization_key > 0
--;
--ALTER VIEW web.create_organizations_view OWNER TO  ergatas_view_owner;
--GRANT INSERT,  SELECT ON web.create_organizations_view TO ergatas_web;



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
           o.contact_email,
           o.is_sending_org
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

--DROP VIEW web.all_profile_search CASCADE;
--CREATE OR REPLACE VIEW web.all_profile_search AS   
CREATE OR REPLACE VIEW web.base_profile_search AS   
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
            END as organization_dba_name,
            o.name as organization_display_name,
            o.logo_url,
            coalesce((mp.data ->>'current_support_percentage')::integer,0) as current_support_percentage,
            '' as search_text,
            fts.document,
            mp.created_on,
            to_char(mp.last_updated_on, 'Month DD, YYYY') as last_updated_on,
            mp.last_updated_on as last_updated_timestamp,
            mp.state,
            (data->>'published')::boolean as published
    FROM web.missionary_profiles as mp
         JOIN web.organizations as o ON(o.organization_key = (mp.data->>'organization_key')::int)
         JOIN web.non_profits as np USING(non_profit_key)
         JOIN web.users as u USING(user_key)
         JOIN web.profile_fts as fts USING(missionary_profile_key)
;
ALTER VIEW web.base_profile_search OWNER TO  ergatas_dev;

CREATE OR REPLACE VIEW web.all_profile_search AS   
    SELECT * 
    FROM web.base_profile_search
    -- see if intersection of current roles and acceptable roles is non-empty
    WHERE EXISTS(
        SELECT 1 FROM jsonb_array_elements_text(
                        coalesce(current_setting('request.jwt.claim.roles',true)::jsonb,'[]'::jsonb))
                WHERE value IN ('ergatas_server','profile_manager') )
;

ALTER VIEW web.all_profile_search OWNER TO  ergatas_dev;
GRANT SELECT ON web.all_profile_search TO ergatas_web,stats;

CREATE OR REPLACE VIEW web.profile_search AS   
    SELECT  * 
    FROM web.base_profile_search
    WHERE state NOT IN  ('disabled','blocked') AND published
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
CREATE OR REPLACE FUNCTION web.primary_search_v3(query text,
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
                                              missionary_profile_keys int[],
                                              sort_field varchar,
                                              page_size int = 20,
                                              use_or boolean = false,
                                              all_profiles boolean =false,
                                              profile_sub_search boolean = false )
RETURNS jsonb AS $func$
DECLARE
ne_lat CONSTANT integer := 1;
ne_long CONSTANT integer := 2;
sw_lat CONSTANT integer := 3;
sw_long CONSTANT integer := 4;
full_query text;
page_query text;
condition text;
boundary_condition text;
order_by text;
secondary_order_by text;
all_results jsonb;
first_page jsonb;
filter_op text;
profile_search_view text;
BEGIN

        IF use_or THEN
            filter_op := ' OR ';
            condition := ' FALSE ';
        ELSE
            filter_op := ' AND ';
            condition := ' TRUE ';
        END IF;

        IF all_profiles THEN
            profile_search_view := ' web.all_profile_search ';
        ELSE
            profile_search_view := ' web.profile_search ';
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
            boundary_condition := format($$ 
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
            condition := format($$ %s AND ( %s )$$,boundary_condition,condition);
        END IF;
       
        IF missionary_profile_keys IS NOT NULL AND array_length(missionary_profile_keys,1) > 0 THEN
            condition := format($$ missionary_profile_key = ANY(ARRAY[%s]) %s (%s) $$,
                array_to_string(missionary_profile_keys,','), 
                (CASE WHEN profile_sub_search THEN 'AND' ELSE 'OR' END) ,
                condition);
        END IF;

        --RAISE NOTICE 'condition: %s', condition;

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
                        FROM %s as ps
                        WHERE %s
                        %s
                     $$,
                        profile_search_view,
                        condition,
                        -- insert rank expresion if we're sorting on rank
                        CASE sort_field
                            WHEN 'rank,desc' THEN format($$
                                    ORDER BY (ts_rank_cd(ps.document,websearch_to_tsquery('simple',%L)) +
                                               ts_rank_cd(ps.document,websearch_to_tsquery(%L))) DESC, 
                                             last_updated_timestamp DESC, missionary_profile_key DESC
                                $$,query,query)
                            ELSE order_by
                        END
                     );

        page_query:= format( $$ SELECT *, 
                                    ts_rank_cd(ps.document,websearch_to_tsquery('simple',%L)) +
                                    ts_rank_cd(ps.document,websearch_to_tsquery(%L)) as rank
                        FROM %s as ps
                        WHERE %s
                        %s
                        LIMIT %L
                     $$,query,query,profile_search_view,condition, order_by, page_size); 
        
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
$func$ LANGUAGE 'plpgsql' IMMUTABLE SECURITY DEFINER;
ALTER FUNCTION web.primary_search_v3(
        text, numeric[], text, int[] , int, int, int[], varchar(3)[],
        varchar, int[], int[], int[], int[], int[], varchar[], int[], int[], 
        varchar, int, boolean, boolean, boolean
    ) OWNER TO ergatas_web;

--DROP FUNCTION IF EXISTS web.primary_search_v2(
        --text, numeric[], text, int[] , int, int, int[], varchar(3)[],
        --varchar, int[], int[], int[], int[], int[], varchar[], int[], varchar, int, boolean);




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
GRANT SELECT,INSERT, UPDATE ON web.possible_transactions_view TO ergatas_server;

CREATE OR REPLACE VIEW web.donations_view AS
    SELECT pt.*,
           (mp.data->>'first_name') || ' ' || (mp.data->>'last_name') as name,
           mp.data->>'donation_url' as donation_url,
           u.external_user_id
    FROM web.possible_transactions as pt
        JOIN  web.missionary_profiles as mp USING(missionary_profile_key)
        JOIN web.users as u USING(user_key)
;
ALTER VIEW web.donations_view OWNER TO ergatas_dev;
GRANT SELECT ON web.donations_view TO ergatas_site_admin, ergatas_server;


CREATE OR REPLACE VIEW web.workers_donations AS
    SELECT possible_transaction_key,
           missionary_profile_key,
           user_key,
           amount,
           donation_type,
           pt.created_on,
           confirmed,
           paid
    FROM web.possible_transactions as pt
        JOIN web.missionary_profiles USING(missionary_profile_key)
        JOIN web.users USING(user_key)
    WHERE external_user_id = coalesce(current_setting('request.jwt.claim.sub', true),'')
;
ALTER VIEW web.workers_donations OWNER TO ergatas_view_owner;
GRANT SELECT ON web.workers_donations TO ergatas_web;


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

-- invitations
CREATE OR REPLACE VIEW web.profile_invitations_view AS
    SELECT * FROM web.profile_invitations 
    WHERE email = coalesce(current_setting('request.jwt.claim.email', true),'')
;
ALTER VIEW web.profile_invitations_view OWNER TO ergatas_view_owner;
GRANT SELECT ON web.profile_invitations_view TO ergatas_web;
GRANT SELECT,DELETE, INSERT ON web.profile_invitations_view TO ergatas_server;


-------------- ROW LEVEL POLICIES ----------------------

DROP POLICY IF EXISTS user_mods ON web.users;
CREATE POLICY user_mods ON web.users
    FOR ALL
  USING (external_user_id = coalesce(current_setting('request.jwt.claim.sub',true),''));


DROP POLICY IF EXISTS edit_missionary_profile ON web.missionary_profiles;
CREATE POLICY edit_missionary_profile ON web.missionary_profiles
    FOR ALL
  USING ( user_key = (select user_key from web.users 
                        where external_user_id = coalesce(current_setting('request.jwt.claim.sub', true),''))
          OR missionary_profile_key IN (select missionary_profile_key 
                                        from web.users
                                            join web.cached_user_permissions using(user_key)
                                        where external_user_id=coalesce(current_setting('request.jwt.claim.sub', true),''))
          OR missionary_profile_key IN (select missionary_profile_key
                                        from web.profile_invitations as pi
                                        where pi.email = coalesce(current_setting('request.jwt.claim.email', true),''))
                        
        )
;

DROP POLICY IF EXISTS edit_saved_search ON web.saved_searches;
CREATE POLICY edit_saved_search ON web.saved_searches
    FOR ALL
  USING ( user_key = (select user_key from web.users 
                        where external_user_id = coalesce(current_setting('request.jwt.claim.sub', true),'')))
;


DROP POLICY IF EXISTS update_own ON web.organizations;
CREATE POLICY update_own ON web.organizations
    FOR UPDATE
    USING ( 
        (organization_key = (select organization_key 
         from web.user_profile_permissions
             join web.users USING(user_key)
         where external_user_id = coalesce(current_setting('request.jwt.claim.sub', true),'')))

         OR coalesce(current_setting('request.jwt.claim.role', true),'') IN ('ergatas_org_admin','ergatas_server')
    )
;
DROP POLICY IF EXISTS all_insert ON web.organizations;
CREATE POLICY all_insert ON web.organizations
    FOR INSERT WITH CHECK(true)
;
DROP POLICY IF EXISTS all_select ON web.organizations;
CREATE POLICY all_select ON web.organizations
    FOR SELECT USING(true)
;

DROP POLICY IF EXISTS permit_all ON web.profile_invitations;
DROP POLICY IF EXISTS select_own ON web.profile_invitations;
/*
CREATE POLICY select_own ON web.profile_invitations
    FOR SELECT USING (
        email = coalesce(current_setting('request.jwt.claim.email', true),'')
    )
;
CREATE POLICY permit_all ON web.profile_invitations
    FOR ALL USING(true)
;
*/