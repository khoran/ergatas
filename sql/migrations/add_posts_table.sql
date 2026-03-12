CREATE TABLE IF NOT EXISTS web.posts(
    post_key serial PRIMARY KEY NOT NULL,
    missionary_profile_key int NOT NULL REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    date_added date NOT NULL DEFAULT current_date,
    prayer_count int NOT NULL DEFAULT 0,
    data jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE web.posts OWNER TO ergatas_dev;
ALTER TABLE web.posts ENABLE ROW LEVEL SECURITY;