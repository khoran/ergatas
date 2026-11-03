-- Site admins can unpublish (take down) any worker profile from its page.
-- lets a site admin take down a fraudulent profile by unpublishing it.
-- missionary_profiles RLS only allows a profile's owner/managers to edit it,
-- hence SECURITY DEFINER; the server checks the site_admin role first.
CREATE OR REPLACE FUNCTION web.admin_unpublish_profile(p_key int)
RETURNS void AS $func$
    UPDATE web.missionary_profiles
        SET data = jsonb_set(data, '{published}', 'false'::jsonb)
    WHERE missionary_profile_key = p_key;
$func$ LANGUAGE SQL SECURITY DEFINER SET search_path = web, public;
ALTER FUNCTION web.admin_unpublish_profile(int) OWNER TO ergatas_dev;
REVOKE EXECUTE ON FUNCTION web.admin_unpublish_profile(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION web.admin_unpublish_profile(int) TO ergatas_server;
