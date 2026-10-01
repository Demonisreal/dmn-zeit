-- migrate:up
-- the person comes from the session; session_create and token_issue keep p_user_id, before login there is none
drop function auth.passkey_add(uuid, bytea, bytea, bigint, text[], uuid, boolean, text);
drop function auth.totp_remove(uuid);

create function auth.passkey_add(
  p_credential_id bytea,
  p_public_key bytea,
  p_counter bigint,
  p_transports text[],
  p_aaguid uuid,
  p_backed_up boolean,
  p_name text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into auth.passkeys (user_id, credential_id, public_key, counter, transports, aaguid, backed_up, name)
  values (
    app.user_id(), p_credential_id, p_public_key, p_counter, coalesce(p_transports, '{}'), p_aaguid,
    p_backed_up, p_name
  )
  returning id;
$$;

create function auth.totp_remove()
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from auth.totp t where t.user_id = app.user_id() returning t.user_id)
  select exists (select 1 from gone);
$$;

-- totp_confirm still names the person itself, the first codes come with it
create or replace function auth.totp_confirm(p_user_id uuid, p_step bigint, p_code_hashes bytea[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- the code that confirmed the secret is spent and cannot sign in afterwards
  update auth.totp t set confirmed_at = now(), last_used_step = p_step
   where t.user_id = p_user_id and t.confirmed_at is null;
  if not found then
    return false;
  end if;

  if p_code_hashes is not null then
    delete from auth.recovery_codes c where c.user_id = p_user_id;
    insert into auth.recovery_codes (user_id, code_hash)
    select p_user_id, h.code_hash from unnest(p_code_hashes) as h (code_hash);
  end if;
  return true;
end;
$$;

drop function auth.recovery_codes_replace(uuid, bytea[]);

create function auth.recovery_codes_replace(p_code_hashes bytea[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.recovery_codes c where c.user_id = app.user_id();
  insert into auth.recovery_codes (user_id, code_hash)
  select app.user_id(), h.code_hash from unnest(p_code_hashes) as h (code_hash);
$$;

grant create on schema auth to zeit_system;
alter function auth.passkey_add(bytea, bytea, bigint, text[], uuid, boolean, text) owner to zeit_system;
alter function auth.totp_remove() owner to zeit_system;
alter function auth.recovery_codes_replace(bytea[]) owner to zeit_system;
revoke create on schema auth from zeit_system;

grant execute on function
  auth.passkey_add(bytea, bytea, bigint, text[], uuid, boolean, text),
  auth.totp_remove(),
  auth.recovery_codes_replace(bytea[])
to zeit_app;

-- migrate:down
drop function auth.recovery_codes_replace(bytea[]);
drop function auth.totp_remove();
drop function auth.passkey_add(bytea, bytea, bigint, text[], uuid, boolean, text);

create function auth.recovery_codes_replace(p_user_id uuid, p_code_hashes bytea[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.recovery_codes c where c.user_id = p_user_id;
  insert into auth.recovery_codes (user_id, code_hash)
  select p_user_id, h.code_hash from unnest(p_code_hashes) as h (code_hash);
$$;

create or replace function auth.totp_confirm(p_user_id uuid, p_step bigint, p_code_hashes bytea[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- the code that confirmed the secret is spent and cannot sign in afterwards
  update auth.totp t set confirmed_at = now(), last_used_step = p_step
   where t.user_id = p_user_id and t.confirmed_at is null;
  if not found then
    return false;
  end if;

  if p_code_hashes is not null then
    perform auth.recovery_codes_replace(p_user_id, p_code_hashes);
  end if;
  return true;
end;
$$;

create function auth.totp_remove(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from auth.totp t where t.user_id = p_user_id returning t.user_id)
  select exists (select 1 from gone);
$$;

create function auth.passkey_add(
  p_user_id uuid,
  p_credential_id bytea,
  p_public_key bytea,
  p_counter bigint,
  p_transports text[],
  p_aaguid uuid,
  p_backed_up boolean,
  p_name text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into auth.passkeys (user_id, credential_id, public_key, counter, transports, aaguid, backed_up, name)
  values (
    p_user_id, p_credential_id, p_public_key, p_counter, coalesce(p_transports, '{}'), p_aaguid,
    p_backed_up, p_name
  )
  returning id;
$$;

grant create on schema auth to zeit_system;
alter function auth.recovery_codes_replace(uuid, bytea[]) owner to zeit_system;
alter function auth.totp_remove(uuid) owner to zeit_system;
alter function auth.passkey_add(uuid, bytea, bytea, bigint, text[], uuid, boolean, text) owner to zeit_system;
revoke create on schema auth from zeit_system;

grant execute on function
  auth.recovery_codes_replace(uuid, bytea[]),
  auth.totp_remove(uuid),
  auth.passkey_add(uuid, bytea, bytea, bigint, text[], uuid, boolean, text)
to zeit_app;
