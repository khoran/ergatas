CREATE SCHEMA IF NOT EXISTS web;

GRANT USAGE ON SCHEMA web TO ergatas_web,ergatas_dev;

CREATE TABLE web.users(
    user_key serial PRIMARY KEY NOT NULL,
    email varchar UNIQUE NOT NULL,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user
);
ALTER TABLE web.users ENABLE ROW LEVEL SECURITY;


CREATE TYPE approval_status AS ENUM ('approved', 'pending', 'denied');
CREATE TYPE donation_type AS ENUM ('one-time', 'recurring' );


CREATE TABLE web.organizations(
    organization_key serial PRIMARY KEY NOT NULL,
    ein int NOT NULL UNIQUE,
    name varchar NOT NULL,
    city varchar NOT NULL,
    state varchar NOT NULL,
    website varchar NOT NULL,
    description text NOT NULL DEFAULT '',
    status approval_status NOT NULL DEFAULT 'pending',
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user
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
    last_updated_on timestamp NOT NULL DEFAULT now()
);
ALTER TABLE web.missionary_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE web.possible_transactions(
    possible_transaction_key serial PRIMARY KEY NOT NULL,
    missionary_profile_key int NOT NULL REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    amount float NOT NULL,
    donation_type donation_type NOT NULL
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user
)

