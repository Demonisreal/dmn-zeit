-- migrate:up
delete from auth.recovery_codes;

-- migrate:down
