-- migrate:up
create type app.workspace_kind as enum ('company', 'solo');

alter table app.tenants
  add column workspace app.workspace_kind not null default 'company',
  add column sandbox_group uuid,
  add constraint tenants_sandbox_group_check check (sandbox_group is null or kind = 'sandbox');

alter table audit.log
  drop constraint log_source_check,
  add constraint log_source_check check (source in ('trigger', 'app', 'cli'));

create function app.workspace()
returns app.workspace_kind
language sql
stable
parallel safe
set search_path = ''
as $$
  select t.workspace from app.tenants t where t.id = app.tenant_id()
$$;

create policy "company workspace" on app.teams as restrictive to zeit_app
  using ((select app.workspace()) = 'company');
create policy "company workspace" on app.team_leads as restrictive to zeit_app
  using ((select app.workspace()) = 'company');
create policy "company workspace" on app.work_models as restrictive to zeit_app
  using ((select app.workspace()) = 'company');
create policy "company workspace" on app.contracts as restrictive to zeit_app
  using ((select app.workspace()) = 'company');
create policy "company workspace" on app.time_entries as restrictive to zeit_app
  using ((select app.workspace()) = 'company');
create policy "company workspace" on app.correction_requests as restrictive to zeit_app
  using ((select app.workspace()) = 'company');
create policy "company workspace" on app.finding_acks as restrictive to zeit_app
  using ((select app.workspace()) = 'company');
create policy "company workspace" on app.absence_requests as restrictive to zeit_app
  using ((select app.workspace()) = 'company');
create policy "company workspace" on app.absence_days as restrictive to zeit_app
  using ((select app.workspace()) = 'company');
create policy "company workspace" on app.vacation_notices as restrictive to zeit_app
  using ((select app.workspace()) = 'company');
create policy "company workspace" on app.vacation_ledger as restrictive to zeit_app
  using ((select app.workspace()) = 'company');
create policy "company workspace" on app.flex_bookings as restrictive to zeit_app
  using ((select app.workspace()) = 'company');
create policy "company workspace" on app.month_closings as restrictive to zeit_app
  using ((select app.workspace()) = 'company');

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
  enrollment_pending boolean,
  workspace app.workspace_kind
)
language sql
security definer
set search_path = ''
as $$
  with hit as (
    select s.id, s.last_seen_at, s.csrf_hash, s.reauth_at, s.enrollment_pending,
           u.id as user_id, u.tenant_id, u.role, u.employee_id, t.workspace
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
         hit.reauth_at, hit.enrollment_pending, hit.workspace
    from hit;
$$;

create function app.guard_solo_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from app.tenants t where t.id = new.tenant_id and t.workspace = 'solo') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('solo_members ' || new.tenant_id::text, 0));

  if tg_table_name = 'users' then
    if new.role <> 'admin' then
      raise exception 'the person of a solo workspace is its admin' using errcode = 'ZT003';
    end if;
    if exists (select 1 from app.users u where u.tenant_id = new.tenant_id and u.id <> new.id) then
      raise exception 'a solo workspace holds one % row', tg_table_name using errcode = 'ZT003';
    end if;
  elsif exists (select 1 from app.employees e where e.tenant_id = new.tenant_id and e.id <> new.id) then
    raise exception 'a solo workspace holds one % row', tg_table_name using errcode = 'ZT003';
  end if;

  return new;
end;
$$;

create trigger users_guard_solo
  before insert or update on app.users
  for each row execute function app.guard_solo_members();

create trigger employees_guard_solo
  before insert or update on app.employees
  for each row execute function app.guard_solo_members();

drop function ops.tenant_create(uuid, text, text, app.federal_state, text, text, bytea);

create function ops.tenant_create(
  p_id uuid,
  p_name text,
  p_slug text,
  p_state app.federal_state,
  p_admin_email text,
  p_admin_name text,
  p_token_hash bytea,
  p_workspace app.workspace_kind default 'company',
  p_first_name text default null,
  p_last_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid;
  person uuid;
begin
  if p_workspace = 'solo' and (p_first_name is null or p_last_name is null) then
    raise exception 'a solo workspace needs first and last name of its person' using errcode = 'ZT003';
  end if;

  insert into app.tenants (id, name, slug, state, workspace)
  values (p_id, p_name, p_slug, p_state, p_workspace);

  if p_workspace = 'solo' then
    insert into app.employees (tenant_id, personnel_no, first_name, last_name, entry_date)
    values (p_id, '1', p_first_name, p_last_name, (now() at time zone 'Europe/Berlin')::date)
    returning id into person;
  end if;

  insert into app.users (tenant_id, email, display_name, role, employee_id)
  values (p_id, p_admin_email, p_admin_name, 'admin', person)
  returning id into admin;

  perform auth.token_issue(admin, 'invite', p_token_hash);
end;
$$;

drop function ops.active_tenants();

create function ops.active_tenants()
returns table (id uuid, kind app.tenant_kind, workspace app.workspace_kind)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.kind, t.workspace
    from app.tenants t
   where t.expires_at is null or t.expires_at > now();
$$;

create function ops.mfa_reset_operator(p_email public.citext)
returns table (user_id uuid, tenant_id uuid, display_name text, locale text, email public.citext)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target app.users;
  previous_tenant text := current_setting('app.tenant_id', true);
  previous_user text := current_setting('app.user_id', true);
  previous_role text := current_setting('app.role', true);
begin
  select * into target from app.users u where u.email operator(public.=) p_email;
  if not found then
    return;
  end if;

  perform set_config('app.tenant_id', target.tenant_id::text, true),
          set_config('app.user_id', '', true),
          set_config('app.role', 'admin', true);
  perform auth.mfa_reset(target.id);
  perform set_config('app.tenant_id', coalesce(previous_tenant, ''), true),
          set_config('app.user_id', coalesce(previous_user, ''), true),
          set_config('app.role', coalesce(previous_role, ''), true);

  insert into audit.log (
    tenant_id, actor_user_id, actor_role, source, action, table_name, row_id, subject_employee_id, request_id
  )
  values (
    target.tenant_id, null, 'admin', 'cli', 'mfa.reset', 'users', target.id, target.employee_id,
    gen_random_uuid()
  );

  return query select target.id, target.tenant_id, target.display_name, target.locale, target.email;
end;
$$;

create function ops.tenant_archive(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app.users u set status = 'disabled'
   where u.tenant_id = p_id and u.status <> 'disabled';
  if not found then
    return;
  end if;

  delete from auth.sessions s
   using app.users u
   where s.user_id = u.id and u.tenant_id = p_id;

  insert into audit.log (tenant_id, actor_user_id, actor_role, source, action, table_name, row_id, request_id)
  values (p_id, null, 'admin', 'cli', 'tenant.archived', 'tenants', p_id, gen_random_uuid());
end;
$$;

grant create on schema app, auth, ops to zeit_system;
alter function auth.session_resolve(bytea) owner to zeit_system;
alter function app.guard_solo_members() owner to zeit_system;
alter function ops.tenant_create(
  uuid, text, text, app.federal_state, text, text, bytea, app.workspace_kind, text, text
) owner to zeit_system;
alter function ops.active_tenants() owner to zeit_system;
alter function ops.mfa_reset_operator(public.citext) owner to zeit_system;
alter function ops.tenant_archive(uuid) owner to zeit_system;
revoke create on schema app, auth, ops from zeit_system;

revoke all on function
  app.guard_solo_members(),
  ops.tenant_create(uuid, text, text, app.federal_state, text, text, bytea, app.workspace_kind, text, text),
  ops.mfa_reset_operator(public.citext),
  ops.tenant_archive(uuid)
from public;
grant execute on function app.workspace() to zeit_app;
grant execute on function auth.session_resolve(bytea) to zeit_app;
grant execute on function ops.active_tenants() to zeit_app;
grant execute on function
  ops.tenant_create(uuid, text, text, app.federal_state, text, text, bytea, app.workspace_kind, text, text),
  ops.mfa_reset_operator(public.citext),
  ops.tenant_archive(uuid)
to zeit_owner;

-- migrate:down
drop function ops.tenant_archive(uuid);
drop function ops.mfa_reset_operator(public.citext);

drop function ops.active_tenants();

create function ops.active_tenants()
returns table (id uuid, kind app.tenant_kind)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.kind
    from app.tenants t
   where t.expires_at is null or t.expires_at > now();
$$;

drop function ops.tenant_create(
  uuid, text, text, app.federal_state, text, text, bytea, app.workspace_kind, text, text
);

create function ops.tenant_create(
  p_id uuid,
  p_name text,
  p_slug text,
  p_state app.federal_state,
  p_admin_email text,
  p_admin_name text,
  p_token_hash bytea
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid;
begin
  insert into app.tenants (id, name, slug, state) values (p_id, p_name, p_slug, p_state);

  insert into app.users (tenant_id, email, display_name, role)
  values (p_id, p_admin_email, p_admin_name, 'admin')
  returning id into admin;

  perform auth.token_issue(admin, 'invite', p_token_hash);
end;
$$;

grant create on schema ops to zeit_system;
alter function ops.active_tenants() owner to zeit_system;
alter function ops.tenant_create(uuid, text, text, app.federal_state, text, text, bytea)
  owner to zeit_system;
revoke create on schema ops from zeit_system;

revoke all on function ops.tenant_create(uuid, text, text, app.federal_state, text, text, bytea)
from public;
grant execute on function ops.active_tenants() to zeit_app;
grant execute on function ops.tenant_create(uuid, text, text, app.federal_state, text, text, bytea)
to zeit_owner;

drop trigger employees_guard_solo on app.employees;
drop trigger users_guard_solo on app.users;
drop function app.guard_solo_members();

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

grant create on schema auth to zeit_system;
alter function auth.session_resolve(bytea) owner to zeit_system;
revoke create on schema auth from zeit_system;
grant execute on function auth.session_resolve(bytea) to zeit_app;

drop policy "company workspace" on app.month_closings;
drop policy "company workspace" on app.flex_bookings;
drop policy "company workspace" on app.vacation_ledger;
drop policy "company workspace" on app.vacation_notices;
drop policy "company workspace" on app.absence_days;
drop policy "company workspace" on app.absence_requests;
drop policy "company workspace" on app.finding_acks;
drop policy "company workspace" on app.correction_requests;
drop policy "company workspace" on app.time_entries;
drop policy "company workspace" on app.contracts;
drop policy "company workspace" on app.work_models;
drop policy "company workspace" on app.team_leads;
drop policy "company workspace" on app.teams;

drop function app.workspace();

alter table audit.log
  drop constraint log_source_check,
  add constraint log_source_check check (source in ('trigger', 'app'));

alter table app.tenants
  drop constraint tenants_sandbox_group_check,
  drop column sandbox_group,
  drop column workspace;

drop type app.workspace_kind;
