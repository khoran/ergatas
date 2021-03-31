begin;
alter sequence web.organizations_organization_key_seq owned by web.organizations_temp.organization_key;
drop table web.organizations;
alter table web.organizations_temp rename to organizations;

ALTER TABLE web.organization_listeners DROP CONSTRAINT organization_listeners_organization_key_fkey;
ALTER TABLE web.organization_listeners ADD FOREIGN KEY(organization_key) REFERENCES web.organizations(organization_key);

-- apply 20-views.sql
-- apply 25-insert_org_triggers.sql


--rollback code
--alter table web.organizations rename to organizations_temp;
--ALTER TABLE web.organization_listeners DROP CONSTRAINT organization_listeners_organization_key_fkey;
--ALTER TABLE web.organization_listeners ADD FOREIGN KEY(organization_key) REFERENCES web.organizations_temp(organization_key);
-- modify 20-views.sql and 25-insert_org_triggers.sql


