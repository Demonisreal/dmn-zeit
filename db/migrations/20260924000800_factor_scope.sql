-- migrate:up
create function auth.mfa_challenge_attempt_with_scope(p_token_hash bytea)
returns table (user_id uuid, tenant_id uuid, role app.user_role)
language sql
security definer
set search_path = ''
as $$
  -- counted before the code is checked, and once login_failed has locked the account nothing is left
  with counted as (
    update auth.mfa_challenges m set attempts = m.attempts + 1
     where m.token_hash = p_token_hash
       and m.expires_at > now()
       and m.attempts < 5
       and not exists (
         select 1 from auth.credentials c where c.user_id = m.user_id and c.locked_until > now()
       )
    returning m.user_id
  )
  select u.id, u.tenant_id, u.role
    from counted
    join app.users u on u.id = counted.user_id;
$$;

create or replace function auth.mfa_challenge_attempt(p_token_hash bytea)
returns uuid
language sql
security definer
set search_path = ''
as $$
  -- kept for callers that only need the person
  select a.user_id from auth.mfa_challenge_attempt_with_scope(p_token_hash) a;
$$;

drop function auth.passkey_find(bytea);

create function auth.passkey_find(p_credential_id bytea)
returns table (
  id uuid,
  user_id uuid,
  public_key bytea,
  counter bigint,
  transports text[],
  tenant_id uuid,
  role app.user_role
)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.user_id, k.public_key, k.counter, k.transports, u.tenant_id, u.role
    from auth.passkeys k
    join app.users u on u.id = k.user_id
   where k.credential_id = p_credential_id
     and u.status in ('active', 'demo');
$$;

drop function auth.passkeys_list(uuid);

create function auth.passkeys_list(p_user_id uuid)
returns table (
  id uuid,
  credential_id bytea,
  name text,
  transports text[],
  backed_up boolean,
  created_at timestamptz,
  last_used_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.credential_id, k.name, k.transports, k.backed_up, k.created_at, k.last_used_at
    from auth.passkeys k
   where k.user_id = p_user_id
   order by k.created_at;
$$;

grant create on schema auth to zeit_system;
alter function auth.mfa_challenge_attempt_with_scope(bytea) owner to zeit_system;
alter function auth.passkey_find(bytea) owner to zeit_system;
alter function auth.passkeys_list(uuid) owner to zeit_system;
revoke create on schema auth from zeit_system;

grant execute on function
  auth.mfa_challenge_attempt_with_scope(bytea),
  auth.passkey_find(bytea),
  auth.passkeys_list(uuid)
to zeit_app;

-- migrate:down
drop function auth.passkeys_list(uuid);

create function auth.passkeys_list(p_user_id uuid)
returns table (
  id uuid,
  name text,
  transports text[],
  backed_up boolean,
  created_at timestamptz,
  last_used_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.name, k.transports, k.backed_up, k.created_at, k.last_used_at
    from auth.passkeys k
   where k.user_id = p_user_id
   order by k.created_at;
$$;

drop function auth.passkey_find(bytea);

create function auth.passkey_find(p_credential_id bytea)
returns table (id uuid, user_id uuid, public_key bytea, counter bigint, transports text[])
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.user_id, k.public_key, k.counter, k.transports
    from auth.passkeys k
    join app.users u on u.id = k.user_id
   where k.credential_id = p_credential_id
     and u.status in ('active', 'demo');
$$;

create or replace function auth.mfa_challenge_attempt(p_token_hash bytea)
returns uuid
language sql
security definer
set search_path = ''
as $$
  -- counted before the code is checked, and once login_failed has locked the account nothing is left
  update auth.mfa_challenges m set attempts = m.attempts + 1
   where m.token_hash = p_token_hash
     and m.expires_at > now()
     and m.attempts < 5
     and not exists (
       select 1 from auth.credentials c where c.user_id = m.user_id and c.locked_until > now()
     )
  returning m.user_id;
$$;

drop function auth.mfa_challenge_attempt_with_scope(bytea);

grant create on schema auth to zeit_system;
alter function auth.passkey_find(bytea) owner to zeit_system;
alter function auth.passkeys_list(uuid) owner to zeit_system;
revoke create on schema auth from zeit_system;

grant execute on function auth.passkey_find(bytea), auth.passkeys_list(uuid) to zeit_app;
