-- Users can now change their account email (see changeUserEmail in
-- lib/server/utils.js). The app's own tables don't store an account's email,
-- but two key on it: pending profile invitations (matched against the JWT
-- email claim) and message relay aliases. This moves both to the new address.
-- profile_invitations_view filters on the caller's JWT email, which the
-- server's token doesn't have, hence a SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION web.change_user_email_references(old_email text, new_email text)
RETURNS void AS $func$
    -- email is unique on invitations; an invitation already waiting at the
    -- new address wins and the old one is left alone
    UPDATE web.profile_invitations SET email = new_email
    WHERE email = old_email
        AND NOT EXISTS (SELECT 1 FROM web.profile_invitations WHERE email = new_email);
    -- old aliases keep working, now delivering to the new address
    UPDATE web.email_hashes SET email_address = new_email
    WHERE email_address = old_email;
$func$ LANGUAGE SQL SECURITY DEFINER SET search_path = web, public;
ALTER FUNCTION web.change_user_email_references(text, text) OWNER TO ergatas_dev;
REVOKE EXECUTE ON FUNCTION web.change_user_email_references(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION web.change_user_email_references(text, text) TO ergatas_server;
