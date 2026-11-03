-- Relay aliases are now an HMAC of the address (see emailToHash in
-- lib/server/utils.js) instead of a plain md5, so one address can have both
-- its old md5 alias and a new HMAC alias. Keep the old rows so replies to
-- threads already in flight still resolve; uniqueness moves to the alias.
ALTER TABLE web.email_hashes DROP CONSTRAINT IF EXISTS email_hashes_email_address_key;
ALTER TABLE web.email_hashes ADD CONSTRAINT email_hashes_hashed_email_address_key UNIQUE (hashed_email_address);
