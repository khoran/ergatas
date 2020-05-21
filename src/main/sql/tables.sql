CREATE TABLE web.users(
    user_key serial PRIMARY KEY NOT NULL,
    username varchar(256) UNIQUE NOT NULL,
    password varchar(256) NOT NULL,
    picture bytea DEFAULT NULL,
    first_name varchar NOT NULL DEFAULT '',
    last_name varchar NOT NULL DEFAULT '',
    email varchar UNIQUE NOT NULL
);
CREATE TABLE web.organizations(
    organization_key serial PRIMARY KEY NOT NULL,
    name varchar NOT NULL,
    main_url varchar UNIQUE NOT NULL,
    donation_url varchar NOT NULL,
    description text NOT NULL DEFAULT ''
);

CREATE TABLE web.job_catagories(
    job_catagory_key serial PRIMARY KEY NOT NULL,
    soc_group varchar UNIQUE NOT NULL,
    catagory varchar NOT NULL
);
CREATE TABLE web.missionary_profiles(
    missionary_profile_key serial PRIMARY KEY NOT NULL,
    user_key INT UNIQUE REFERENCES web.users(user_key) ON DELETE CASCADE,
    organization_key INT NOT NULL DEFAULT 0 REFERENCES web.organizations(organization_key) ON DELETE SET DEFAULT,
    location varchar DEFAULT '',
    description text DEFAULT '',
    location_lat float NOT NULL DEFAULT 0.0,
    location_long float NOT NULL DEFAULT 0.0,
    current_support_percentage NUMERIC DEFAULT 0
);
CREATE TABLE web.profile_jobs(
    profile_job_key serial PRIMARY KEY NOT NULL,
    missionary_profile_key INT NOT NULL REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    job_catagory_key INT NOT NULL REFERENCES web.job_catagories(job_catagory_key) ON DELETE CASCADE,
    UNIQUE(missionary_profile_key,job_catagory_key)
);
