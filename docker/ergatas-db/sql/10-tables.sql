CREATE SCHEMA IF NOT EXISTS web;

GRANT USAGE ON SCHEMA web TO ergatas_web,ergatas_dev;

CREATE TABLE web.users(
    user_key serial PRIMARY KEY NOT NULL,
    email varchar UNIQUE NOT NULL,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user
);
ALTER TABLE web.users ENABLE ROW LEVEL SECURITY;

-- we may want to push these fields into the missionary_profile and let 
-- each user set them as they want. 
CREATE TABLE web.organizations(
    organization_key serial PRIMARY KEY NOT NULL,
    ein int NOT NULL UNIQUE,
    name varchar NOT NULL,
    city varchar NOT NULL,
    state varchar NOT NULL,
    website varchar NOT NULL,
    description text NOT NULL DEFAULT '',
    approved boolean NOT NULL DEFAULT false,
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
    /*
    organization_key INT NOT NULL DEFAULT 0 REFERENCES web.organizations(organization_key) ON DELETE SET DEFAULT,
    --org_name varchar NOT NULL,
    org_main_url varchar NOT NULL,
    org_description text NOT NULL DEFAULT ''
    picture_url string NOT NULL DEFAULT '',
    first_name varchar NOT NULL DEFAULT '',
    last_name varchar NOT NULL DEFAULT '',
    location varchar DEFAULT '',
    country varchar DEFAULT '',
    description text DEFAULT '',
    donation_url varchar NOT NULL,
    location_lat float NOT NULL DEFAULT 0.0,
    location_long float NOT NULL DEFAULT 0.0,
    current_support_percentage NUMERIC DEFAULT 0,
*/
    data jsonb NOT NULL,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user
);
ALTER TABLE web.missionary_profiles ENABLE ROW LEVEL SECURITY;

/*
CREATE TABLE web.profile_jobs(
    profile_job_key serial PRIMARY KEY NOT NULL,
    missionary_profile_key INT NOT NULL REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    job_catagory_key INT NOT NULL REFERENCES web.job_catagories(job_catagory_key) ON DELETE CASCADE,
    UNIQUE(missionary_profile_key,job_catagory_key)
);

ALTER TABLE web.profile_jobs ENABLE ROW LEVEL SECURITY;
*/
