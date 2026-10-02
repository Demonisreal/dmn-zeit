-- migrate:up
create type auth.webauthn_purpose as enum ('register', 'login', 'reauth');

create table auth.totp (
  user_id uuid primary key references app.users (id) on delete cascade,
  secret_enc bytea not null,
  key_version smallint not null check (key_version > 0),
  confirmed_at timestamptz,
  last_used_step bigint check (last_used_step >= 0),
  created_at timestamptz not null default now()
);

create table auth.recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id) on delete cascade,
  code_hash bytea not null check (octet_length(code_hash) = 32),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);

create table auth.passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id) on delete cascade,
  credential_id bytea not null unique check (octet_length(credential_id) between 16 and 1023),
  public_key bytea not null check (octet_length(public_key) > 0),
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  aaguid uuid,
  backed_up boolean not null default false,
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index passkeys_user_idx on auth.passkeys (user_id);

create table auth.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app.users (id) on delete cascade,
  challenge bytea not null unique check (octet_length(challenge) between 16 and 64),
  purpose auth.webauthn_purpose not null,
  expires_at timestamptz not null default now() + interval '5 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check ((purpose = 'login') = (user_id is null))
);

create index webauthn_challenges_expires_idx on auth.webauthn_challenges (expires_at);

create table auth.mfa_challenges (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  user_id uuid not null references app.users (id) on delete cascade,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null default now() + interval '5 minutes',
  created_at timestamptz not null default now()
);

create index mfa_challenges_user_idx on auth.mfa_challenges (user_id);

alter table auth.sessions
  add column reauth_at timestamptz,
  add column enrollment_pending boolean not null default false;

drop function auth.session_resolve(bytea);

create function auth.session_resolve(p_token_hash bytea)
returns table (
  session_id uuid,
  user_id uuid,
  tenant_id uuid,
  role app.user_role,
  employee_id uuid,
  csrf_hash bytea,
  reauth_at timestamptz,
  enrollment_pending boolean
)
language sql
security definer
set search_path = ''
as $$
  with hit as (
    select s.id, s.last_seen_at, s.csrf_hash, s.reauth_at, s.enrollment_pending,
           u.id as user_id, u.tenant_id, u.role, u.employee_id
      from auth.sessions s
      join app.users u on u.id = s.user_id
      join app.tenants t on t.id = u.tenant_id
     where s.token_hash = p_token_hash
       and s.idle_expires_at > now()
       and s.absolute_expires_at > now()
       and u.status in ('active', 'demo')
       and (t.expires_at is null or t.expires_at > now())
  ), touched as (
    update auth.sessions s
       set idle_expires_at = least(now() + interval '12 hours', s.absolute_expires_at),
           last_seen_at = now()
      from hit
     where s.id = hit.id
       and hit.last_seen_at < now() - interval '1 minute'
  )
  select hit.id, hit.user_id, hit.tenant_id, hit.role, hit.employee_id, hit.csrf_hash,
         hit.reauth_at, hit.enrollment_pending
    from hit;
$$;

create or replace function auth.session_create(
  p_user_id uuid,
  p_token_hash bytea,
  p_csrf_hash bytea,
  p_ip inet,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  sandbox boolean;
begin
  update app.users u set last_login_at = now()
   where u.id = p_user_id and u.status in ('active', 'demo')
  returning u.status = 'demo' into sandbox;
  if not found then
    raise exception 'user % may not sign in', p_user_id using errcode = '28000';
  end if;

  if exists (select 1 from auth.credentials c where c.user_id = p_user_id and c.locked_until > now()) then
    raise exception 'user % is locked', p_user_id using errcode = '28000';
  end if;

  update auth.credentials c set failed_count = 0, locked_until = null, last_failed_at = null
   where c.user_id = p_user_id and c.failed_count > 0;

  insert into auth.sessions (
    user_id, token_hash, csrf_hash, idle_expires_at, absolute_expires_at, ip, user_agent,
    enrollment_pending
  )
  values (
    p_user_id, p_token_hash, p_csrf_hash, now() + interval '12 hours', now() + interval '7 days',
    p_ip, p_user_agent,
    not sandbox
      and not exists (select 1 from auth.totp t where t.user_id = p_user_id and t.confirmed_at is not null)
      and not exists (select 1 from auth.passkeys k where k.user_id = p_user_id)
  )
  returning id into sid;

  return sid;
end;
$$;

create or replace function auth.purge_expired()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions s where s.idle_expires_at <= now();
  delete from auth.tokens t where t.expires_at <= now();
  delete from auth.webauthn_challenges w where w.expires_at <= now() or w.used_at is not null;
  delete from auth.mfa_challenges m where m.expires_at <= now();
$$;

create function auth.factors(p_user_id uuid)
returns table (has_totp boolean, passkey_count integer, recovery_left integer)
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.totp t where t.user_id = p_user_id and t.confirmed_at is not null),
         (select count(*)::integer from auth.passkeys k where k.user_id = p_user_id),
         (select count(*)::integer from auth.recovery_codes c where c.user_id = p_user_id and c.used_at is null);
$$;

create function auth.totp_begin(p_user_id uuid, p_secret_enc bytea, p_key_version integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with saved as (
    insert into auth.totp as t (user_id, secret_enc, key_version)
    values (p_user_id, p_secret_enc, p_key_version)
    on conflict (user_id) do update
      set secret_enc = excluded.secret_enc, key_version = excluded.key_version,
          last_used_step = null, created_at = now()
      where t.confirmed_at is null
    returning t.user_id
  )
  select exists (select 1 from saved);
$$;

create function auth.totp_secret(p_user_id uuid)
returns table (secret_enc bytea, key_version smallint, confirmed boolean, last_used_step bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.secret_enc, t.key_version, t.confirmed_at is not null, t.last_used_step
    from auth.totp t
   where t.user_id = p_user_id;
$$;

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

create function auth.totp_confirm(p_user_id uuid, p_step bigint, p_code_hashes bytea[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create function auth.totp_use_step(p_user_id uuid, p_step bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with used as (
    update auth.totp t set last_used_step = p_step
     where t.user_id = p_user_id
       and t.confirmed_at is not null
       and p_step > coalesce(t.last_used_step, -1)
    returning t.user_id
  )
  select exists (select 1 from used);
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

create function auth.recovery_code_use(p_user_id uuid, p_code_hash bytea)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with used as (
    update auth.recovery_codes c set used_at = now()
     where c.user_id = p_user_id and c.code_hash = p_code_hash and c.used_at is null
    returning c.id
  )
  select exists (select 1 from used);
$$;

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

create function auth.passkey_rename(p_user_id uuid, p_passkey_id uuid, p_name text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with renamed as (
    update auth.passkeys k set name = p_name
     where k.id = p_passkey_id and k.user_id = p_user_id
    returning k.id
  )
  select exists (select 1 from renamed);
$$;

create function auth.passkey_remove(p_user_id uuid, p_passkey_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from auth.passkeys k where k.id = p_passkey_id and k.user_id = p_user_id returning k.id
  )
  select exists (select 1 from gone);
$$;

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

create function auth.passkey_touch(p_passkey_id uuid, p_counter bigint, p_backed_up boolean)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with touched as (
    update auth.passkeys k
       set counter = p_counter, backed_up = p_backed_up, last_used_at = now()
     where k.id = p_passkey_id
       and (p_counter > k.counter or (p_counter = 0 and k.counter = 0))
    returning k.id
  )
  select exists (select 1 from touched);
$$;

create function auth.webauthn_challenge_create(
  p_challenge bytea,
  p_purpose auth.webauthn_purpose,
  p_user_id uuid
)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  insert into auth.webauthn_challenges (challenge, purpose, user_id)
  values (p_challenge, p_purpose, p_user_id)
  returning expires_at;
$$;

create function auth.webauthn_challenge_consume(
  p_challenge bytea,
  p_purpose auth.webauthn_purpose,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with used as (
    update auth.webauthn_challenges w set used_at = now()
     where w.challenge = p_challenge
       and w.purpose = p_purpose
       and w.user_id is not distinct from p_user_id
       and w.used_at is null
       and w.expires_at > now()
    returning w.id
  )
  select exists (select 1 from used);
$$;

create function auth.mfa_challenge_create(p_user_id uuid, p_token_hash bytea)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  delete from auth.mfa_challenges m where m.user_id = p_user_id;
  insert into auth.mfa_challenges (token_hash, user_id)
  values (p_token_hash, p_user_id)
  returning expires_at;
$$;

create function auth.mfa_challenge_attempt(p_token_hash bytea)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update auth.mfa_challenges m set attempts = m.attempts + 1
   where m.token_hash = p_token_hash
     and m.expires_at > now()
     and m.attempts < 5
  returning m.user_id;
$$;

create function auth.mfa_challenge_consume(p_token_hash bytea)
returns uuid
language sql
security definer
set search_path = ''
as $$
  delete from auth.mfa_challenges m
   where m.token_hash = p_token_hash and m.expires_at > now()
  returning m.user_id;
$$;

create function auth.session_reauth(p_session_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  update auth.sessions s set reauth_at = now() where s.id = p_session_id returning s.reauth_at;
$$;

create function auth.enrollment_finish(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid;
begin
  update auth.sessions s set enrollment_pending = false
   where s.id = p_session_id
     and s.enrollment_pending
     and (
       exists (select 1 from auth.totp t where t.user_id = s.user_id and t.confirmed_at is not null)
       or exists (select 1 from auth.passkeys k where k.user_id = s.user_id)
     )
  returning s.user_id into account;
  if account is null then
    return false;
  end if;

  delete from auth.sessions s where s.user_id = account and s.enrollment_pending;
  return true;
end;
$$;

create function auth.mfa_reset(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.role() is distinct from 'admin'
    or p_user_id is not distinct from app.user_id()
    or not exists (select 1 from app.users u where u.id = p_user_id and u.tenant_id = app.tenant_id())
  then
    raise exception 'second factors of % cannot be reset from here', p_user_id
      using errcode = 'insufficient_privilege';
  end if;

  delete from auth.totp t where t.user_id = p_user_id;
  delete from auth.passkeys k where k.user_id = p_user_id;
  delete from auth.recovery_codes c where c.user_id = p_user_id;
  delete from auth.mfa_challenges m where m.user_id = p_user_id;
  delete from auth.webauthn_challenges w where w.user_id = p_user_id;
  delete from auth.sessions s where s.user_id = p_user_id;
end;
$$;

grant select, insert, update, delete
  on auth.totp, auth.recovery_codes, auth.passkeys, auth.webauthn_challenges, auth.mfa_challenges
  to zeit_system;

grant create on schema auth to zeit_system;
alter function auth.session_resolve(bytea) owner to zeit_system;
alter function auth.factors(uuid) owner to zeit_system;
alter function auth.totp_begin(uuid, bytea, integer) owner to zeit_system;
alter function auth.totp_secret(uuid) owner to zeit_system;
alter function auth.recovery_codes_replace(uuid, bytea[]) owner to zeit_system;
alter function auth.totp_confirm(uuid, bigint, bytea[]) owner to zeit_system;
alter function auth.totp_use_step(uuid, bigint) owner to zeit_system;
alter function auth.totp_remove(uuid) owner to zeit_system;
alter function auth.recovery_code_use(uuid, bytea) owner to zeit_system;
alter function auth.passkeys_list(uuid) owner to zeit_system;
alter function auth.passkey_add(uuid, bytea, bytea, bigint, text[], uuid, boolean, text) owner to zeit_system;
alter function auth.passkey_rename(uuid, uuid, text) owner to zeit_system;
alter function auth.passkey_remove(uuid, uuid) owner to zeit_system;
alter function auth.passkey_find(bytea) owner to zeit_system;
alter function auth.passkey_touch(uuid, bigint, boolean) owner to zeit_system;
alter function auth.webauthn_challenge_create(bytea, auth.webauthn_purpose, uuid) owner to zeit_system;
alter function auth.webauthn_challenge_consume(bytea, auth.webauthn_purpose, uuid) owner to zeit_system;
alter function auth.mfa_challenge_create(uuid, bytea) owner to zeit_system;
alter function auth.mfa_challenge_attempt(bytea) owner to zeit_system;
alter function auth.mfa_challenge_consume(bytea) owner to zeit_system;
alter function auth.session_reauth(uuid) owner to zeit_system;
alter function auth.enrollment_finish(uuid) owner to zeit_system;
alter function auth.mfa_reset(uuid) owner to zeit_system;
revoke create on schema auth from zeit_system;

grant execute on function
  auth.session_resolve(bytea),
  auth.factors(uuid),
  auth.totp_begin(uuid, bytea, integer),
  auth.totp_secret(uuid),
  auth.recovery_codes_replace(uuid, bytea[]),
  auth.totp_confirm(uuid, bigint, bytea[]),
  auth.totp_use_step(uuid, bigint),
  auth.totp_remove(uuid),
  auth.recovery_code_use(uuid, bytea),
  auth.passkeys_list(uuid),
  auth.passkey_add(uuid, bytea, bytea, bigint, text[], uuid, boolean, text),
  auth.passkey_rename(uuid, uuid, text),
  auth.passkey_remove(uuid, uuid),
  auth.passkey_find(bytea),
  auth.passkey_touch(uuid, bigint, boolean),
  auth.webauthn_challenge_create(bytea, auth.webauthn_purpose, uuid),
  auth.webauthn_challenge_consume(bytea, auth.webauthn_purpose, uuid),
  auth.mfa_challenge_create(uuid, bytea),
  auth.mfa_challenge_attempt(bytea),
  auth.mfa_challenge_consume(bytea),
  auth.session_reauth(uuid),
  auth.enrollment_finish(uuid),
  auth.mfa_reset(uuid)
to zeit_app;

-- migrate:down
drop function auth.mfa_reset(uuid);
drop function auth.enrollment_finish(uuid);
drop function auth.session_reauth(uuid);
drop function auth.mfa_challenge_consume(bytea);
drop function auth.mfa_challenge_attempt(bytea);
drop function auth.mfa_challenge_create(uuid, bytea);
drop function auth.webauthn_challenge_consume(bytea, auth.webauthn_purpose, uuid);
drop function auth.webauthn_challenge_create(bytea, auth.webauthn_purpose, uuid);
drop function auth.passkey_touch(uuid, bigint, boolean);
drop function auth.passkey_find(bytea);
drop function auth.passkey_remove(uuid, uuid);
drop function auth.passkey_rename(uuid, uuid, text);
drop function auth.passkey_add(uuid, bytea, bytea, bigint, text[], uuid, boolean, text);
drop function auth.passkeys_list(uuid);
drop function auth.recovery_code_use(uuid, bytea);
drop function auth.totp_remove(uuid);
drop function auth.totp_use_step(uuid, bigint);
drop function auth.totp_confirm(uuid, bigint, bytea[]);
drop function auth.recovery_codes_replace(uuid, bytea[]);
drop function auth.totp_secret(uuid);
drop function auth.totp_begin(uuid, bytea, integer);
drop function auth.factors(uuid);

create or replace function auth.purge_expired()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions s where s.idle_expires_at <= now();
  delete from auth.tokens t where t.expires_at <= now();
$$;

create or replace function auth.session_create(
  p_user_id uuid,
  p_token_hash bytea,
  p_csrf_hash bytea,
  p_ip inet,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
begin
  update app.users u set last_login_at = now()
   where u.id = p_user_id and u.status in ('active', 'demo');
  if not found then
    raise exception 'user % may not sign in', p_user_id using errcode = '28000';
  end if;

  if exists (select 1 from auth.credentials c where c.user_id = p_user_id and c.locked_until > now()) then
    raise exception 'user % is locked', p_user_id using errcode = '28000';
  end if;

  update auth.credentials c set failed_count = 0, locked_until = null, last_failed_at = null
   where c.user_id = p_user_id and c.failed_count > 0;

  insert into auth.sessions (
    user_id, token_hash, csrf_hash, idle_expires_at, absolute_expires_at, ip, user_agent
  )
  values (
    p_user_id, p_token_hash, p_csrf_hash, now() + interval '12 hours', now() + interval '7 days',
    p_ip, p_user_agent
  )
  returning id into sid;

  return sid;
end;
$$;

drop function auth.session_resolve(bytea);

create function auth.session_resolve(p_token_hash bytea)
returns table (
  session_id uuid,
  user_id uuid,
  tenant_id uuid,
  role app.user_role,
  employee_id uuid,
  csrf_hash bytea
)
language sql
security definer
set search_path = ''
as $$
  with hit as (
    select s.id, s.last_seen_at, s.csrf_hash, u.id as user_id, u.tenant_id, u.role, u.employee_id
      from auth.sessions s
      join app.users u on u.id = s.user_id
      join app.tenants t on t.id = u.tenant_id
     where s.token_hash = p_token_hash
       and s.idle_expires_at > now()
       and s.absolute_expires_at > now()
       and u.status in ('active', 'demo')
       and (t.expires_at is null or t.expires_at > now())
  ), touched as (
    update auth.sessions s
       set idle_expires_at = least(now() + interval '12 hours', s.absolute_expires_at),
           last_seen_at = now()
      from hit
     where s.id = hit.id
       and hit.last_seen_at < now() - interval '1 minute'
  )
  select hit.id, hit.user_id, hit.tenant_id, hit.role, hit.employee_id, hit.csrf_hash
    from hit;
$$;

grant create on schema auth to zeit_system;
alter function auth.session_resolve(bytea) owner to zeit_system;
revoke create on schema auth from zeit_system;
grant execute on function auth.session_resolve(bytea) to zeit_app;

alter table auth.sessions drop column enrollment_pending, drop column reauth_at;

drop table auth.mfa_challenges;
drop table auth.webauthn_challenges;
drop table auth.passkeys;
drop table auth.recovery_codes;
drop table auth.totp;
drop type auth.webauthn_purpose;
