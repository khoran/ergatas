ALTER TABLE web.users ADD search_filter jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE web.organizations ADD is_sending_org boolean NOT NULL DEFAULT true;
ALTER TABLE web.organizations ADD search_filter jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE web.organizations ADD slug varchar NOT NULL UNIQUE DEFAULT '';

-- change cascade on user_key delete to NO ACTION
ALTER TABLE web.missionary_profiles DROP CONSTRAINT missionary_profiles_user_key_fkey;
ALTER TABLE web.missionary_profiles ADD FOREIGN KEY(user_key) REFERENCES web.users(user_key) ON DELETE NO ACTION;

--remove unique constraint on user_key in missionary_profiles table
ALTER TABLE web.missionary_profiles DROP CONSTRAINT missionary_profiles_user_key_key;

CREATE TABLE IF NOT EXISTS web.user_profile_permissions(
    user_profile_permission_key serial PRIMARY KEY NOT NULL,
    user_key int NOT NULL REFERENCES web.users(user_key) ON DELETE CASCADE,
    organization_key int NOT NULL REFERENCES web.organizations(organization_key) ON DELETE CASCADE,
    read_only boolean NOT NULL DEFAULT true,
    UNIQUE(user_key )
);
ALTER TABLE web.user_profile_permissions OWNER TO ergatas_dev;

CREATE TABLE IF NOT EXISTS web.cached_user_permissions(
    user_key int NOT NULL REFERENCES web.users(user_key) ON DELETE CASCADE,
    missionary_profile_key int NOT NULL REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    UNIQUE(user_key,missionary_profile_key)
);
ALTER TABLE web.cached_user_permissions OWNER TO ergatas_dev;


ALTER TABLE web.organizations ENABLE ROW LEVEL SECURITY;
DROP VIEW web.create_organizations_view;