
CREATE ROLE postgrest_auth NOINHERIT LOGIN;
CREATE ROLE ergatas_dev; -- for developers, should own tables and other base objects
CREATE ROLE ergatas_view_owner; -- should own views and have required table permissions
CREATE ROLE ergatas_web;

-- org_admin has permisison to review and accept/reject organization applications
CREATE ROLE ergatas_org_admin;
GRANT ergatas_web TO ergatas_org_admin;

-- site_admin additionally has permission to review and remove profiles from the site
CREATE ROLE ergatas_site_admin;
GRANT ergatas_org_admin TO ergatas_site_admin;

-- for use by the app server 
CREATE ROLE ergatas_server;

CREATE USER stats;

GRANT ergatas_web,ergatas_org_admin,ergatas_site_admin,ergatas_server to postgrest_auth;
