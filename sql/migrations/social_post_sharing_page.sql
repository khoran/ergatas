-- posts whose date has arrived, read by the /social-post/:key sharing page with
-- the ergatas_server role (see 20-views.sql).
CREATE OR REPLACE VIEW web.published_social_media_posts_view AS
    SELECT * FROM web.social_media_posts WHERE post_date <= current_date
;
ALTER VIEW web.published_social_media_posts_view OWNER TO ergatas_view_owner;
GRANT SELECT ON web.published_social_media_posts_view TO ergatas_server;
