
INSERT INTO web.non_profits(country_code,country_org_id,registered_name,city,state,created_on,created_by)
    SELECT country_code,country_org_id,name,city,state,created_on,created_by 
        FROM web.organizations
        WHERE organization_key > 0
    ON CONFLICT DO NOTHING;

INSERT INTO web.organizations_temp(organization_key,non_profit_key,name, website,description,status,logo_url,created_on,created_by)
    SELECT o.organization_key,
           (SELECT non_profit_key FROM web.non_profits as np WHERE
                np.country_code = o.country_code AND np.country_org_id = o.country_org_id ) as non_profit_key,
            COALESCE(nullif(o.dba_name,''),o.name) as name,
            o.website,
            o.description,
            o.status,
            o.logo_url,
            o.created_on,
            o.created_by
        FROM web.organizations as o
        WHERE organization_key > 0
    ON CONFLICT DO NOTHING;

ALTER TABLE web.organization_listeners DROP CONSTRAINT organization_listeners_organization_key_fkey;
ALTER TABLE web.organization_listeners ADD FOREIGN KEY(organization_key) REFERENCES web.organizations_temp(organization_key);
--ALTER TABLE web.organization_listeners ADD FOREIGN KEY(organization_key) REFERENCES web.organizations(organization_key);