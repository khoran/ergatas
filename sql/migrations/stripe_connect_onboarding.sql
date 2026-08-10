-- allow the server role to look up org application listeners when authorizing
-- stripe connect onboarding requests
GRANT SELECT ON web.organization_users_to_notify TO ergatas_server;
