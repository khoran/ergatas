CREATE SCHEMA IF NOT EXISTS web;

GRANT USAGE ON SCHEMA web TO stats,ergatas_server;
-- ALL is needed for any user who need to own something
GRANT ALL ON SCHEMA web TO ergatas_view_owner,ergatas_dev, ergatas_web;

CREATE TABLE IF NOT EXISTS web.users(
    user_key serial PRIMARY KEY NOT NULL,
    external_user_id varchar(255) UNIQUE NOT NULL,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user,
    agreed_to_sof boolean NOT NULL DEFAULT false,
    search_filter jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE web.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE web.users OWNER TO ergatas_dev;


--CREATE TYPE approval_status AS ENUM ('approved', 'pending', 'denied');
--CREATE TYPE donation_type AS ENUM ('one-time', 'recurring' );
--CREATE TYPE profile_state AS ENUM ('current','warning1','warning2','disabled','blocked' );


CREATE TABLE IF NOT EXISTS web.non_profits(
    non_profit_key serial PRIMARY KEY NOT NULL,
    country_code varchar(3) NOT NULL DEFAULT 'USA', --ISO 3166-1 alpha-3
    country_org_id varchar NOT NULL,
    registered_name varchar NOT NULL,
    city varchar NOT NULL,
    state varchar NOT NULL,
    is_shell boolean NOT NULL DEFAULT false, -- true if this is a parent organization
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user,
    stripe_account varchar NOT NULL DEFAULT '',
    donation_urls jsonb NOT NULL DEFAULT '[]'::jsonb, --array of objects with keys {url, match_type:<domain,full_domain,full_url>}
    donation_settings jsonb NOT NULL DEFAULT '{}'::jsonb
    UNIQUE(country_code,country_org_id)
);
ALTER TABLE web.non_profits OWNER TO ergatas_dev;
INSERT INTO web.non_profits(non_profit_key,registered_name,city,state,country_org_id)
    VALUES(0,'Unknown Organization','Unknown','Unknown','Unknown') 
    ON CONFLICT DO NOTHING;


CREATE TABLE IF NOT EXISTS web.organizations(
    organization_key int PRIMARY KEY NOT NULL DEFAULT nextval('web.organizations_organization_key_seq'::regclass),
    non_profit_key INT NOT NULL REFERENCES web.non_profits(non_profit_key),
    name varchar NOT NULL,
    website varchar NOT NULL,
    description text NOT NULL DEFAULT '',
    status approval_status NOT NULL DEFAULT 'pending',
    logo_url varchar NOT NULL DEFAULT '',
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user,
    contact_email varchar NOT NULL DEFAULT '',
    is_sending_org boolean NOT NULL DEFAULT true,
    search_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
    slug varchar NOT NULL UNIQUE DEFAULT '',
    UNIQUE(non_profit_key,name)
);
ALTER TABLE web.organizations OWNER TO ergatas_dev;
INSERT INTO web.organizations(organization_key,non_profit_key,name,website)
    VALUES(0,0,'Unknown Organization','') 
    ON CONFLICT DO NOTHING;
ALTER TABLE web.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS web.organization_listeners(
    organization_key INT NOT NULL REFERENCES web.organizations(organization_key) ON DELETE CASCADE,
    user_key INT NOT NULL REFERENCES web.users(user_key) ON DELETE CASCADE,
    created_on timestamp NOT NULL DEFAULT now(),
    UNIQUE(organization_key,user_key)
);
ALTER TABLE web.organization_listeners OWNER TO ergatas_dev;

CREATE TABLE IF NOT EXISTS web.job_catagories(
    job_catagory_key serial PRIMARY KEY NOT NULL,
    catagory varchar UNIQUE NOT NULL
);
ALTER TABLE web.job_catagories OWNER TO ergatas_dev;

CREATE TABLE IF NOT EXISTS web.missionary_profiles(
    missionary_profile_key serial PRIMARY KEY NOT NULL,
    user_key INT REFERENCES web.users(user_key) ON DELETE NO ACTION,
    data jsonb NOT NULL,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user,
    last_updated_on timestamp NOT NULL DEFAULT now(),
    state profile_state NOT NULL DEFAULT 'current'
);
ALTER TABLE web.missionary_profiles OWNER TO ergatas_dev;
ALTER TABLE web.missionary_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS web.donors(
    donor_key serial PRIMARY KEY NOT NULL,
    stripe_customer_id varchar UNIQUE NOT NULL,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user
);
ALTER TABLE web.donors OWNER TO ergatas_dev;


CREATE TABLE IF NOT EXISTS web.possible_transactions(
    possible_transaction_key serial PRIMARY KEY NOT NULL,
    missionary_profile_key int NOT NULL REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    amount float NOT NULL,
    donation_type donation_type NOT NULL,
    confirmed boolean NOT NULL DEFAULT false,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user,
    stripe_id varchar UNIQUE, -- can be a payment_id or a subscription_id
    donor_key int REFERENCES web.donors(donor_key) ON DELETE CASCADE,
    paid boolean NOT NULL DEFAULT false
);
ALTER TABLE web.possible_transactions OWNER TO ergatas_dev;

CREATE TABLE IF NOT EXISTS web.email_hashes(
    email_hash_key serial PRIMARY KEY,
    email_address varchar NOT NULL UNIQUE,
    hashed_email_address varchar NOT NULL,
    created_on timestamp NOT NULL DEFAULT now()
);
ALTER TABLE web.email_hashes OWNER TO ergatas_dev;

CREATE TABLE IF NOT EXISTS web.profile_fts(
    missionary_profile_key int NOT NULL UNIQUE REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    document tsvector NOT NULL,
    updated_on timestamp NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE web.profile_fts OWNER TO ergatas_dev;

CREATE TABLE IF NOT EXISTS web.tags(
    tag_key serial PRIMARY KEY NOT NULL,
    name varchar UNIQUE NOT NULL
);
ALTER TABLE web.tags OWNER TO ergatas_dev;

CREATE TABLE IF NOT EXISTS web.causes(
    cause_key serial PRIMARY KEY NOT NULL,
    cause varchar UNIQUE NOT NULL
);
ALTER TABLE web.causes OWNER TO ergatas_dev;

CREATE TABLE IF NOT EXISTS web.push_subscriptions(
   push_subscription_key serial PRIMARY KEY NOT NULL,
   endpoint varchar UNIQUE NOT NULL,
   subscription jsonb NOT NULL,
   daily_prayer_list boolean NOT NULL DEFAULT false,
   creatd_on timestamp NOT NULL DEFAULT now()
);
ALTER TABLE web.push_subscriptions OWNER TO ergatas_dev;


CREATE TABLE IF NOT EXISTS web.message_queue(
   message_queue_key serial PRIMARY KEY NOT NULL,
   external_user_id varchar(255) NOT NULL,
   from_name varchar NOT NULL,
   from_email varchar NOT NULL,
   message text NOT NULL,
   created_on timestamp NOT NULL DEFAULT now()
);
ALTER TABLE web.message_queue OWNER TO ergatas_dev;

CREATE TABLE IF NOT EXISTS web.saved_searches(
    saved_search_key serial PRIMARY KEY NOT NULL,
    user_key INT REFERENCES web.users(user_key) ON DELETE CASCADE,
    data jsonb NOT NULL,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user
);
ALTER TABLE web.saved_searches OWNER TO ergatas_dev;
ALTER TABLE web.saved_searches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS web.public_searches(
    public_search_key serial PRIMARY KEY NOT NULL,
    search_name varchar UNIQUE NOT NULL,
    data jsonb NOT NULL,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user
);
ALTER TABLE web.public_searches OWNER TO ergatas_dev;

CREATE TABLE IF NOT EXISTS web.user_profile_permissions(
    user_profile_permission_key serial PRIMARY KEY NOT NULL,
    user_key int NOT NULL REFERENCES web.users(user_key) ON DELETE CASCADE,
    organization_key int NOT NULL REFERENCES web.organizations(organization_key) ON DELETE CASCADE,
    read_only boolean NOT NULL DEFAULT true,
    UNIQUE(user_key ) -- users can only be in charge of one organization
);
ALTER TABLE web.user_profile_permissions OWNER TO ergatas_dev;

CREATE TABLE IF NOT EXISTS web.cached_user_permissions(
    user_key int NOT NULL REFERENCES web.users(user_key) ON DELETE CASCADE,
    missionary_profile_key int NOT NULL REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    UNIQUE(user_key,missionary_profile_key)
);
ALTER TABLE web.cached_user_permissions OWNER TO ergatas_dev;

CREATE TABLE IF NOT EXISTS web.profile_invitations(
    profile_invitation_key serial PRIMARY KEY NOT NULL,
    missionary_profile_key int NOT NULL REFERENCES web.missionary_profiles ON DELETE CASCADE UNIQUE,
    email varchar NOT NULL UNIQUE,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by_external_user_id varchar NOT NULL REFERENCES web.users(external_user_id) ON DELETE CASCADE DEFAULT current_setting('request.jwt.claim.sub', true)
);
ALTER TABLE web.profile_invitations OWNER TO ergatas_dev;
ALTER TABLE web.profile_invitations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS web.pages(
    page_key serial PRIMARY KEY NOT NULL,
    slug varchar NOT NULL UNIQUE,
    data jsonb NOT NULL
);
ALTER TABLE web.pages OWNER TO ergatas_dev;