ALTER TABLE web.users ADD COLUMN agreed_to_sof boolean NOT NULL DEFAULT true;
ALTER TABLE web.users ALTER agreed_to_sof SET DEFAULT false;

--ALTER TABLE web.users DROP agreed_to_sof CASCADE;