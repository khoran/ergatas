
-------------- FULL TEXT SEARCH  -------------------------
CREATE INDEX profile_fts_index on web.profile_fts USING gin(document);

/* not working, not sure if needed. Attempt to not remove stop works, and make it impossible to search for 'IT'
CREATE TEXT SEARCH DICTIONARY english_stem_nostop (
    Template = snowball
    , Language = english
);

CREATE TEXT SEARCH CONFIGURATION public.english_nostop ( COPY = pg_catalog.english );
ALTER TEXT SEARCH CONFIGURATION public.english_nostop
   ALTER MAPPING FOR asciiword, asciihword, hword_asciipart, hword, hword_part, word WITH english_stem_nostop;
*/

CREATE OR REPLACE FUNCTION profile_fts_trigger() RETURNS trigger AS
$$
DECLARE
    document_tsv tsvector;
BEGIN

    document_tsv = (SELECT

                setweight(to_tsvector(('simple',mp.data->>'first_name')||' '||(mp.data->>'last_name')),'A')  ||
                setweight(to_tsvector('simple',mp.data->>'location'), 'A') ||
                setweight(to_tsvector(mp.data->>'description'),'D') ||
                setweight(to_tsvector('simple',mp.data->>'country'),'A') ||
                setweight(to_tsvector(
                    (SELECT string_agg(catagory,' ') 
                     FROM web.job_catagories 
                          JOIN jsonb_array_elements(mp.data->'job_catagory_keys') AS t 
                            ON((t.value->>0)::integer = job_catagories.job_catagory_key)  ) 
                ),'C') ||
                setweight(to_tsvector('simple',o.name),'B')||
                setweight(to_tsvector('simple',o.dba_name),'B')||
                setweight(to_tsvector(o.description),'D') as document
            FROM web.missionary_profiles as mp
                JOIN web.organizations as o ON(o.organization_key = (mp.data->>'organization_key')::int)
            WHERE mp.missionary_profile_key = new.missionary_profile_key);


    INSERT INTO web.profile_fts(missionary_profile_key,document,updated_on) 
        VALUES (new.missionary_profile_key, document_tsv ,now())
        ON CONFLICT (missionary_profile_key)
        DO UPDATE SET document = document_tsv, updated_on=now();

    RETURN new;

END 
$$ LANGUAGE plpgsql;

CREATE TRIGGER profile_fts_update
    BEFORE INSERT OR UPDATE ON web.missionary_profiles
    FOR EACH ROW EXECUTE PROCEDURE profile_fts_trigger();


