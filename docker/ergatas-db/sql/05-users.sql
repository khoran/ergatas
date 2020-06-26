
CREATE ROLE postgrest_auth NOINHERIT LOGIN;
CREATE ROLE ergatas_dev;
CREATE ROLE ergatas_web;

GRANT ergatas_web to postgrest_auth;
