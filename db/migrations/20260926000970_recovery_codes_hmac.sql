-- migrate:up
-- the api hashes recovery codes with an hmac now and cannot tell the old sha-256 rows apart, people create new codes
delete from auth.recovery_codes;

-- migrate:down
-- the deleted codes do not come back, new ones are created under security settings
