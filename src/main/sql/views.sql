

CREATE OR REPLACE VIEW web.users_view AS
    SELECT * FROM web.users
;

GRANT INSERT, UPDATE, SELECT, DELETE ON web.users_view TO ergatas_web;

CREATE OR REPLACE VIEW web.missionary_profiles_view AS  
    SELECT * FROM web.missionary_profiles
;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.missionary_profiles_view TO ergatas_web;

CREATE OR REPLACE VIEW web.profile_jobs_view AS  
    SELECT * FROM web.profile_jobs
;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.profile_jobs_view TO ergatas_web;


CREATE OR REPLACE VIEW web.organizations_view AS  
    SELECT * FROM web.organizations
;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.organizations_view TO ergatas_web;

CREATE OR REPLACE VIEW web.job_catagories_view AS  
    SELECT * FROM web.job_catagories
;
GRANT INSERT, UPDATE, SELECT, DELETE ON web.job_catagories TO ergatas_web;


CREATE OR REPLACE VIEW web.profile_search AS   
    SELECT user_key,username,first_name,last_name,email,
           name as organization_name, main_url as organization_url, donation_url as organization_donation_url, organizations.description as organization_description,
           catagory as job_catagory,
           location,missionary_profiles.description as profile_description, location_lat, location_long, current_support_percentage
    FROM web.missionary_profiles 
         JOIN web.users USING(user_key)
         JOIN web.organizations USING(organization_key)
         JOIN web.profile_jobs USING(missionary_profile_key)
         JOIN web.job_catagories USING(job_catagory_key)
;