-- migrate:up
create extension btree_gist with schema public;
create extension citext with schema public;

revoke all on schema public from public;
grant usage on schema public to zeit_app, zeit_system;

create schema app;
create schema auth;
create schema audit;
create schema ops;

grant usage on schema app, auth, audit, ops to zeit_app;
grant usage on schema app, auth, audit to zeit_system;

create type app.user_role as enum ('employee', 'team_lead', 'hr', 'admin');
create type app.user_status as enum ('invited', 'active', 'disabled', 'demo');
create type app.federal_state as enum (
  'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'
);
create type app.tenant_kind as enum ('live', 'sandbox');
create type app.flex_cap_mode as enum ('none', 'forfeit_at_close', 'warn');
create type auth.token_kind as enum ('invite', 'password_reset');

create function app.tenant_id()
returns uuid
language sql
stable
parallel safe
set search_path = ''
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create function app.user_id()
returns uuid
language sql
stable
parallel safe
set search_path = ''
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create function app.employee_id()
returns uuid
language sql
stable
parallel safe
set search_path = ''
as $$
  select nullif(current_setting('app.employee_id', true), '')::uuid
$$;

create function app.role()
returns app.user_role
language sql
stable
parallel safe
set search_path = ''
as $$
  select nullif(current_setting('app.role', true), '')::app.user_role
$$;

create function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table app.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  slug public.citext not null unique check (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  state app.federal_state not null,
  timezone text not null default 'Europe/Berlin' check (timezone = 'Europe/Berlin'),
  holiday_options text[] not null default '{}',
  half_days_dec24_31 boolean not null default false,
  flex_cap_plus_min integer check (flex_cap_plus_min >= 0),
  flex_cap_minus_min integer check (flex_cap_minus_min >= 0),
  flex_cap_mode app.flex_cap_mode not null default 'none',
  carryover_until text not null default '03-31' check (
    carryover_until ~ '^((0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-8])|(0[13-9]|1[0-2])-(29|30)|(0[13578]|1[02])-31)$'
  ),
  kind app.tenant_kind not null default 'live',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'sandbox') = (expires_at is not null))
);

create table app.users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  email public.citext not null unique check (email::text ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  display_name text not null check (btrim(display_name) <> ''),
  role app.user_role not null default 'employee',
  locale text not null default 'de' check (locale in ('de', 'en')),
  status app.user_status not null default 'invited',
  employee_id uuid unique,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table auth.credentials (
  user_id uuid primary key references app.users (id) on delete cascade,
  password_hash text not null check (password_hash like '$argon2id$%'),
  failed_count integer not null default 0 check (failed_count >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  csrf_hash bytea not null check (octet_length(csrf_hash) = 32),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (idle_expires_at <= absolute_expires_at)
);

create index sessions_user_idx on auth.sessions (user_id);
create index sessions_idle_expires_idx on auth.sessions (idle_expires_at);

create table auth.tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.users (id) on delete cascade,
  kind auth.token_kind not null,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create unique index tokens_open_idx on auth.tokens (user_id, kind) where used_at is null;
create index tokens_expires_idx on auth.tokens (expires_at);

create table ops.rate_limits (
  key text primary key,
  hits integer not null check (hits > 0),
  expires_at timestamptz not null,
  blocked_until timestamptz
);

create index rate_limits_expires_idx on ops.rate_limits (expires_at);

create table ops.demo_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  recipient public.citext not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index demo_outbox_tenant_idx on ops.demo_outbox (tenant_id, created_at desc);

create table audit.log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_role app.user_role,
  source text not null check (source in ('trigger', 'app')),
  action text not null,
  table_name text,
  row_id uuid,
  subject_employee_id uuid,
  diff jsonb,
  request_id uuid,
  ip inet,
  check (ip is null or source = 'app')
);

create index log_tenant_occurred_idx on audit.log (tenant_id, occurred_at desc);
create index log_tenant_row_idx on audit.log (tenant_id, table_name, row_id);
create index log_tenant_subject_idx on audit.log (tenant_id, subject_employee_id, occurred_at desc);

create trigger tenants_set_updated_at
  before update on app.tenants
  for each row execute function app.set_updated_at();

create trigger users_set_updated_at
  before update on app.users
  for each row execute function app.set_updated_at();

create trigger credentials_set_updated_at
  before update on auth.credentials
  for each row execute function app.set_updated_at();

create function app.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true) then
      return old;
    end if;
  end if;

  raise exception '%.% is append-only', tg_table_schema, tg_table_name using errcode = 'ZT002';
end;
$$;

create trigger log_append_only
  before update or delete on audit.log
  for each row execute function app.reject_change();

create trigger log_no_truncate
  before truncate on audit.log
  for each statement execute function app.reject_change();

create function audit.track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  skipped constant text[] := array['updated_at', 'last_login_at'];
  old_row jsonb := '{}';
  new_row jsonb := '{}';
  latest jsonb;
  changed jsonb;
begin
  if tg_op <> 'INSERT' then
    old_row := to_jsonb(old) - skipped;
  end if;
  if tg_op <> 'DELETE' then
    new_row := to_jsonb(new) - skipped;
  end if;
  latest := case when tg_op = 'DELETE' then old_row else new_row end;

  select coalesce(jsonb_object_agg(k.key, jsonb_build_array(old_row -> k.key, new_row -> k.key)), '{}')
    into changed
    from jsonb_object_keys(old_row || new_row) as k (key)
   where old_row -> k.key is distinct from new_row -> k.key;

  if changed = '{}' then
    return null;
  end if;

  insert into audit.log (
    tenant_id, actor_user_id, actor_role, source, action, table_name, row_id,
    subject_employee_id, diff, request_id
  )
  values (
    (case when tg_table_name = 'tenants' then latest ->> 'id' else latest ->> 'tenant_id' end)::uuid,
    app.user_id(),
    app.role(),
    'trigger',
    lower(tg_op),
    tg_table_name,
    (latest ->> 'id')::uuid,
    (latest ->> 'employee_id')::uuid,
    changed,
    nullif(current_setting('app.request_id', true), '')::uuid
  );

  return null;
end;
$$;

create trigger audit_tenants
  after insert or update or delete on app.tenants
  for each row execute function audit.track();

create trigger audit_users
  after insert or update or delete on app.users
  for each row execute function audit.track();

alter table app.tenants enable row level security, force row level security;
alter table app.users enable row level security, force row level security;
alter table audit.log enable row level security, force row level security;

create policy "tenant fence" on app.tenants as restrictive to zeit_app
  using (id = (select app.tenant_id()));

create policy "members read their tenant" on app.tenants for select to zeit_app
  using (true);

create policy "admins create the tenant" on app.tenants for insert to zeit_app
  with check ((select app.role()) = 'admin');

create policy "admins change the tenant" on app.tenants for update to zeit_app
  using ((select app.role()) = 'admin');

create policy "tenant fence" on app.users as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "read own user" on app.users for select to zeit_app
  using (id = (select app.user_id()));

create policy "hr and admins read all users" on app.users for select to zeit_app
  using ((select app.role()) >= 'hr');

create policy "update own user" on app.users for update to zeit_app
  using (id = (select app.user_id()))
  with check (
    id = (select app.user_id())
    and role = (select app.role())
    and employee_id is not distinct from (select app.employee_id())
  );

create policy "admins manage users" on app.users for all to zeit_app
  using ((select app.role()) = 'admin');

create policy "tenant fence" on audit.log as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "hr and admins read the trail" on audit.log for select to zeit_app
  using ((select app.role()) >= 'hr');

create policy "read own trail" on audit.log for select to zeit_app
  using (subject_employee_id = (select app.employee_id()) or actor_user_id = (select app.user_id()));

create policy "append app events" on audit.log for insert to zeit_app
  with check (
    source = 'app'
    and actor_user_id is not distinct from (select app.user_id())
    and actor_role is not distinct from (select app.role())
  );

create function auth.login_lookup(p_email text)
returns table (
  user_id uuid,
  tenant_id uuid,
  role app.user_role,
  status app.user_status,
  password_hash text,
  failed_count integer,
  locked_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.tenant_id, u.role, u.status, c.password_hash, coalesce(c.failed_count, 0), c.locked_until
    from app.users u
    left join auth.credentials c on c.user_id = u.id
   where u.email operator(public.=) p_email::public.citext
     and u.status in ('active', 'invited');
$$;

create function auth.login_failed(p_user_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  update auth.credentials c
     set failed_count = c.failed_count + 1,
         locked_until = case
           when c.failed_count >= 4 then now() + interval '1 minute' * power(2, least(c.failed_count - 4, 6))
         end
   where c.user_id = p_user_id
  returning c.locked_until;
$$;

create function auth.password_set(p_user_id uuid, p_password_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into auth.credentials (user_id, password_hash)
  values (p_user_id, p_password_hash)
  on conflict (user_id) do update
    set password_hash = excluded.password_hash, failed_count = 0, locked_until = null;

  update app.users u set status = 'active' where u.id = p_user_id and u.status = 'invited';
$$;

create function auth.session_create(
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

  update auth.credentials c set failed_count = 0, locked_until = null
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

create function auth.session_revoke(p_token_hash bytea)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions s where s.token_hash = p_token_hash;
$$;

create function auth.session_revoke_all(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions s where s.user_id = p_user_id;
$$;

create function auth.token_issue(p_user_id uuid, p_kind auth.token_kind, p_token_hash bytea, p_ttl interval)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  insert into auth.tokens as t (user_id, kind, token_hash, expires_at)
  values (p_user_id, p_kind, p_token_hash, now() + p_ttl)
  on conflict (user_id, kind) where used_at is null do update
    set token_hash = excluded.token_hash, expires_at = excluded.expires_at, created_at = now()
  returning t.expires_at;
$$;

create function auth.token_consume(p_token_hash bytea, p_kind auth.token_kind)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update auth.tokens t
     set used_at = now()
   where t.token_hash = p_token_hash
     and t.kind = p_kind
     and t.used_at is null
     and t.expires_at > now()
  returning t.user_id;
$$;

create function auth.purge_expired()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions s where s.idle_expires_at <= now();
  delete from auth.tokens t where t.expires_at <= now();
$$;

grant select, insert, update on app.tenants, app.users to zeit_app;
grant select, insert on audit.log to zeit_app;
grant select, insert, update, delete on ops.rate_limits to zeit_app;
grant select, insert on ops.demo_outbox to zeit_app;

grant select on app.tenants to zeit_system;
grant select, update (status, last_login_at) on app.users to zeit_system;
grant select, insert, update on auth.credentials to zeit_system;
grant select, insert, update, delete on auth.sessions, auth.tokens to zeit_system;
grant insert on audit.log to zeit_system;

grant create on schema auth, audit to zeit_system;
alter function audit.track() owner to zeit_system;
alter function auth.login_lookup(text) owner to zeit_system;
alter function auth.login_failed(uuid) owner to zeit_system;
alter function auth.password_set(uuid, text) owner to zeit_system;
alter function auth.session_create(uuid, bytea, bytea, inet, text) owner to zeit_system;
alter function auth.session_resolve(bytea) owner to zeit_system;
alter function auth.session_revoke(bytea) owner to zeit_system;
alter function auth.session_revoke_all(uuid) owner to zeit_system;
alter function auth.token_issue(uuid, auth.token_kind, bytea, interval) owner to zeit_system;
alter function auth.token_consume(bytea, auth.token_kind) owner to zeit_system;
alter function auth.purge_expired() owner to zeit_system;
revoke create on schema auth, audit from zeit_system;

revoke all on function audit.track() from public;
revoke all on all functions in schema auth from public;
grant execute on all functions in schema auth to zeit_app;

-- migrate:down
drop function auth.purge_expired();
drop function auth.token_consume(bytea, auth.token_kind);
drop function auth.token_issue(uuid, auth.token_kind, bytea, interval);
drop function auth.session_revoke_all(uuid);
drop function auth.session_revoke(bytea);
drop function auth.session_resolve(bytea);
drop function auth.session_create(uuid, bytea, bytea, inet, text);
drop function auth.password_set(uuid, text);
drop function auth.login_failed(uuid);
drop function auth.login_lookup(text);

drop table audit.log;
drop table ops.demo_outbox;
drop table ops.rate_limits;
drop table auth.tokens;
drop table auth.sessions;
drop table auth.credentials;
drop table app.users;
drop table app.tenants;

drop function audit.track();
drop function app.reject_change();
drop function app.set_updated_at();
drop function app.role();
drop function app.employee_id();
drop function app.user_id();
drop function app.tenant_id();

drop type auth.token_kind;
drop type app.flex_cap_mode;
drop type app.tenant_kind;
drop type app.federal_state;
drop type app.user_status;
drop type app.user_role;

drop schema ops;
drop schema audit;
drop schema auth;
drop schema app;

revoke usage on schema public from zeit_app, zeit_system;
grant usage on schema public to public;

drop extension citext;
drop extension btree_gist;
