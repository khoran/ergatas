CREATE TABLE IF NOT EXISTS web.pages(
    page_key serial PRIMARY KEY NOT NULL,
    slug varchar NOT NULL UNIQUE,
    data jsonb NOT NULL
);
ALTER TABLE web.pages OWNER TO ergatas_dev;