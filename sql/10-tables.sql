CREATE SCHEMA IF NOT EXISTS web;

GRANT USAGE ON SCHEMA web TO ergatas_web,ergatas_dev;

CREATE TABLE web.users(
    user_key serial PRIMARY KEY NOT NULL,
    external_user_id varchar(255) NOT NULL,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user
);
ALTER TABLE web.users ENABLE ROW LEVEL SECURITY;


CREATE TYPE approval_status AS ENUM ('approved', 'pending', 'denied');
CREATE TYPE donation_type AS ENUM ('one-time', 'recurring' );
CREATE TYPE profile_state AS ENUM ('current','warning1','warning2','disabled' );


CREATE TABLE web.organizations(
    organization_key serial PRIMARY KEY NOT NULL,
    -- https://en.wikipedia.org/wiki/List_of_ISO_3166_country_codes
    country_code varchar(3) NOT NULL DEFAULT 'USA', --ISO 3166-1 alpha-3
    country_org_id varchar NOT NULL,
    name varchar NOT NULL,
    dba_name varchar NOT NULL DEFAULT '',
    city varchar NOT NULL,
    state varchar NOT NULL,
    website varchar NOT NULL,
    description text NOT NULL DEFAULT '',
    status approval_status NOT NULL DEFAULT 'pending',
    logo_url varchar NOT NULL DEFAULT '',
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user,
    UNIQUE(country_code,country_org_id)
);
CREATE TABLE web.organization_listeners(
    organization_key INT NOT NULL REFERENCES web.organizations(organization_key) ON DELETE CASCADE,
    user_key INT NOT NULL REFERENCES web.users(user_key) ON DELETE CASCADE,
    created_on timestamp NOT NULL DEFAULT now(),
    UNIQUE(organization_key,user_key)
);

CREATE TABLE web.job_catagories(
    job_catagory_key serial PRIMARY KEY NOT NULL,
    catagory varchar UNIQUE NOT NULL
);
CREATE TABLE web.missionary_profiles(
    missionary_profile_key serial PRIMARY KEY NOT NULL,
    user_key INT UNIQUE REFERENCES web.users(user_key) ON DELETE CASCADE,
    data jsonb NOT NULL,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user,
    last_updated_on timestamp NOT NULL DEFAULT now(),
    state profile_state NOT NULL DEFAULT 'current'
);
ALTER TABLE web.missionary_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE web.possible_transactions(
    possible_transaction_key serial PRIMARY KEY NOT NULL,
    missionary_profile_key int NOT NULL REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    amount float NOT NULL,
    donation_type donation_type NOT NULL,
    confirmed boolean NOT NULL DEFAULT false,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user
);

CREATE TABLE web.email_hashes(
    email_hash_key serial PRIMARY KEY,
    email_address varchar NOT NULL UNIQUE,
    hashed_email_address varchar NOT NULL,
    created_on timestamp NOT NULL DEFAULT now()
);
