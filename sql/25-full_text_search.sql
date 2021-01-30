
-------------- FULL TEXT SEARCH  -------------------------
CREATE INDEX IF NOT EXISTS profile_fts_index on web.profile_fts USING gin(document);

/* not working, not sure if needed. Attempt to not remove stop works, and make it impossible to search for 'IT'
CREATE TEXT SEARCH DICTIONARY english_stem_nostop (
    Template = snowball
    , Language = english
);

CREATE TEXT SEARCH CONFIGURATION public.english_nostop ( COPY = pg_catalog.english );
ALTER TEXT SEARCH CONFIGURATION public.english_nostop
   ALTER MAPPING FOR asciiword, asciihword, hword_asciipart, hword, hword_part, word WITH english_stem_nostop;
*/

SET ROLE ergatas_view_owner;
CREATE OR REPLACE FUNCTION web.profile_fts_trigger() RETURNS trigger AS
$$
DECLARE
    document_tsv tsvector;
    org web.organizations%rowtype;
BEGIN

    SELECT * FROM web.organizations_view INTO org
        WHERE organization_key = (new.data->>'organization_key')::integer;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION'No organization found for given organization_key %',new.data->>'organization_key'
            USING hint = 'Ensure organization_key exists in web.organizations table';
    END IF;

    document_tsv = (SELECT

                setweight( to_tsvector('simple',
                        COALESCE(new.data->>'first_name','')|| ' '||COALESCE(new.data->>'last_name','')
                    ),'A')  ||
                setweight(to_tsvector('simple',COALESCE(new.data->>'location','')), 'A') ||
                setweight(to_tsvector(COALESCE(new.data->>'description','')),'D') ||
                setweight(to_tsvector('simple',COALESCE(new.data->>'country','')),'A') ||
                setweight(to_tsvector(
                    COALESCE((SELECT string_agg(catagory,' ') 
                     FROM web.job_catagories 
                          JOIN jsonb_array_elements(new.data->'job_catagory_keys') AS t 
                            ON((t.value->>0)::integer = job_catagories.job_catagory_key)  ) 
                ,'')),'C') ||
                setweight(to_tsvector('simple',COALESCE(o.name,'')),'B')||
                setweight(to_tsvector('simple',COALESCE(o.dba_name,'')),'B')||
                setweight(to_tsvector(COALESCE(o.description,'')),'D') as document
            FROM 
                web.organizations_view as o 
            WHERE o.organization_key= (new.data->>'organization_key')::integer);


    INSERT INTO web.profile_fts(missionary_profile_key,document) 
        VALUES (new.missionary_profile_key, document_tsv )
        ON CONFLICT (missionary_profile_key)
        DO UPDATE SET document = document_tsv, updated_on=DEFAULT;

    RETURN new;

END 
$$ LANGUAGE plpgsql SECURITY DEFINER;
ALTER FUNCTION web.profile_fts_trigger OWNER TO ergatas_view_owner;
RESET ROLE;

DROP TRIGGER IF EXISTS profile_fts_update ON web.missionary_profiles;
CREATE TRIGGER profile_fts_update
    AFTER INSERT OR UPDATE ON web.missionary_profiles
    FOR EACH ROW EXECUTE PROCEDURE web.profile_fts_trigger();


