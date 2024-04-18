
CREATE OR REPLACE FUNCTION web.insert_org_trigger() RETURNS trigger AS
$$
BEGIN

    INSERT INTO web.non_profits (registered_name,city,state,country_code,country_org_id,is_shell)
        SELECT NEW.name,NEW.city, NEW.state, NEW.country_code, NEW.country_org_id, NEW.is_shell
        ON CONFLICT DO NOTHING;

    INSERT INTO web.organizations (non_profit_key, name, website, description,logo_url,contact_email)
        SELECT (SELECT non_profit_key FROM web.non_profits 
                    WHERE country_code = NEW.country_code AND country_org_id = NEW.country_org_id),
                COALESCE(nullif(NEW.dba_name,''),NEW.name),
                NEW.website, NEW.description, NEW.logo_url, NEW.contact_email;

    NEW.organization_key = lastval();

    RETURN NEW;
END 
$$ LANGUAGE plpgsql SECURITY DEFINER;
ALTER FUNCTION web.insert_org_trigger OWNER TO ergatas_view_owner;

DROP TRIGGER IF EXISTS organization_insert ON web.non_profit_and_organizations_view;
CREATE TRIGGER organization_insert
    INSTEAD OF INSERT ON web.non_profit_and_organizations_view
    FOR EACH ROW EXECUTE PROCEDURE web.insert_org_trigger();


