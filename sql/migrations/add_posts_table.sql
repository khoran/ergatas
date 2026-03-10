CREATE TABLE IF NOT EXISTS web.posts(
    post_key serial PRIMARY KEY NOT NULL,
    missionary_profile_key int NOT NULL REFERENCES web.missionary_profiles(missionary_profile_key) ON DELETE CASCADE,
    date_added date NOT NULL DEFAULT current_date,
    prayer_count int NOT NULL DEFAULT 0,
    data jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE web.posts OWNER TO ergatas_dev;
ALTER TABLE web.posts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON web.posts TO ergatas_view_owner;
GRANT USAGE, SELECT ON SEQUENCE web.posts_post_key_seq TO ergatas_view_owner;

INSERT INTO web.posts(missionary_profile_key, date_added, prayer_count, data)
SELECT mp.missionary_profile_key,
       coalesce((post->>'date_added')::date, current_date),
       coalesce((post->>'prayer_count')::int, 0),
       coalesce((post - 'date_added' - 'prayer_count'),'{}'::jsonb)
FROM web.missionary_profiles as mp,
     jsonb_array_elements(coalesce(mp.data->'posts','[]'::jsonb)) as post
;

UPDATE web.missionary_profiles
   SET data = data - 'posts'
 WHERE data ? 'posts';
