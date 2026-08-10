CREATE TABLE IF NOT EXISTS web.social_media_posts(
    social_media_post_key serial PRIMARY KEY NOT NULL,
    post_date date NOT NULL DEFAULT current_date,
    created_on timestamp NOT NULL DEFAULT now(),
    created_by varchar NOT NULL DEFAULT current_user,
    data jsonb NOT NULL DEFAULT '{}'::jsonb   -- { title, description, image_url, link_url }
);

ALTER TABLE web.social_media_posts OWNER TO ergatas_dev;
ALTER TABLE web.social_media_posts ENABLE ROW LEVEL SECURITY;

-- the *_view objects are owned by ergatas_view_owner and read this base table,
-- so the view owner needs table access (RLS still constrains the rows).
GRANT SELECT, INSERT, UPDATE, DELETE ON web.social_media_posts TO ergatas_view_owner;

-- ergatas_site_admin inserts through social_media_posts_view, so it needs USAGE
-- on the serial PK's sequence to evaluate the nextval() default.
GRANT USAGE ON SEQUENCE web.social_media_posts_social_media_post_key_seq
    TO ergatas_site_admin, ergatas_view_owner;
