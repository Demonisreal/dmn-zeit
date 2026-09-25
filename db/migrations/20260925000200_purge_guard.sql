-- migrate:up
create or replace function app.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- the sandbox purge is the only one allowed to delete, and only rows of the tenant it purges
  if tg_op = 'DELETE' then
    -- any role may set zeit.purge_tenant; the purge deletes as zeit_system, its cascades run as the table owner
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true)
      and current_user in ('zeit_system', 'zeit_owner') then
      return old;
    end if;
  end if;

  raise exception '%.% is append-only', tg_table_schema, tg_table_name using errcode = 'ZT002';
end;
$$;

create or replace function app.guard_time_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- workday is generated and still null in a before trigger
  fillable constant text[] := array['ended_at', 'end_reason', 'voided_at', 'voided_by_request_id', 'workday'];
begin
  if tg_op = 'DELETE' then
    -- same rule as app.reject_change
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true)
      and current_user in ('zeit_system', 'zeit_owner') then
      return old;
    end if;
    raise exception 'time entries are voided, never deleted' using errcode = 'ZT002';
  end if;

  -- a stamp takes the clock of the database, never a time sent by the client
  if new.source = 'clock' and (
    (tg_op = 'INSERT' and (new.started_at <> now() or new.ended_at is not null))
    or (tg_op = 'UPDATE' and new.ended_at is distinct from old.ended_at and new.ended_at <> now())
  ) then
    raise exception 'clock entries start and end at now()' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and (
    to_jsonb(new) - fillable <> to_jsonb(old) - fillable
    or (old.ended_at is not null
      and (new.ended_at, new.end_reason) is distinct from (old.ended_at, old.end_reason))
    or (old.voided_at is not null
      and (new.voided_at, new.voided_by_request_id) is distinct from (old.voided_at, old.voided_by_request_id))
  ) then
    raise exception 'a time entry can only be ended and voided, each once' using errcode = 'ZT002';
  end if;

  return new;
end;
$$;

-- every foreign key on app.tenants cascades, a live tenant would take its journals along
create function app.guard_tenant_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.kind <> 'sandbox' then
    raise exception 'tenant % is %, only sandboxes are deleted', old.id, old.kind using errcode = 'ZT002';
  end if;
  return old;
end;
$$;

create trigger tenants_guard_delete
  before delete on app.tenants
  for each row execute function app.guard_tenant_delete();

-- the api creates sandboxes through ops.sandbox_create, live tenants come from the cli as zeit_owner
revoke insert on app.tenants from zeit_app;
drop policy "admins create the tenant" on app.tenants;

create function ops.sandbox_create(
  p_id uuid,
  p_name text,
  p_slug text,
  p_state app.federal_state,
  p_flex_cap_plus_min integer,
  p_flex_cap_minus_min integer,
  p_flex_cap_mode app.flex_cap_mode
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into app.tenants (
    id, name, slug, state, flex_cap_plus_min, flex_cap_minus_min, flex_cap_mode, kind, expires_at
  )
  values (
    p_id, p_name, p_slug, p_state, p_flex_cap_plus_min, p_flex_cap_minus_min, p_flex_cap_mode,
    'sandbox', now() + interval '24 hours'
  )
  returning id;
$$;

-- force rls leaves zeit_owner without any row, so the cli goes through here
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

grant insert on app.tenants, app.users to zeit_system;

grant create on schema ops to zeit_system;
alter function ops.sandbox_create(uuid, text, text, app.federal_state, integer, integer, app.flex_cap_mode)
  owner to zeit_system;
alter function ops.tenant_create(uuid, text, text, app.federal_state, text, text, bytea)
  owner to zeit_system;
revoke create on schema ops from zeit_system;

revoke all on function
  ops.sandbox_create(uuid, text, text, app.federal_state, integer, integer, app.flex_cap_mode),
  ops.tenant_create(uuid, text, text, app.federal_state, text, text, bytea)
from public;
grant execute on function
  ops.sandbox_create(uuid, text, text, app.federal_state, integer, integer, app.flex_cap_mode)
to zeit_app;
grant execute on function ops.tenant_create(uuid, text, text, app.federal_state, text, text, bytea)
to zeit_owner;

-- migrate:down
drop function ops.tenant_create(uuid, text, text, app.federal_state, text, text, bytea);
drop function ops.sandbox_create(uuid, text, text, app.federal_state, integer, integer, app.flex_cap_mode);
revoke insert on app.tenants, app.users from zeit_system;

-- the cli and the demo sandbox insert a tenant while the context already carries its new id
create policy "admins create the tenant" on app.tenants for insert to zeit_app
  with check ((select app.role()) = 'admin');
grant insert on app.tenants to zeit_app;

drop trigger tenants_guard_delete on app.tenants;
drop function app.guard_tenant_delete();

create or replace function app.guard_time_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- workday is generated and still null in a before trigger
  fillable constant text[] := array['ended_at', 'end_reason', 'voided_at', 'voided_by_request_id', 'workday'];
begin
  if tg_op = 'DELETE' then
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true) then
      return old;
    end if;
    raise exception 'time entries are voided, never deleted' using errcode = 'ZT002';
  end if;

  -- a stamp takes the clock of the database, never a time sent by the client
  if new.source = 'clock' and (
    (tg_op = 'INSERT' and (new.started_at <> now() or new.ended_at is not null))
    or (tg_op = 'UPDATE' and new.ended_at is distinct from old.ended_at and new.ended_at <> now())
  ) then
    raise exception 'clock entries start and end at now()' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and (
    to_jsonb(new) - fillable <> to_jsonb(old) - fillable
    or (old.ended_at is not null
      and (new.ended_at, new.end_reason) is distinct from (old.ended_at, old.end_reason))
    or (old.voided_at is not null
      and (new.voided_at, new.voided_by_request_id) is distinct from (old.voided_at, old.voided_by_request_id))
  ) then
    raise exception 'a time entry can only be ended and voided, each once' using errcode = 'ZT002';
  end if;

  return new;
end;
$$;

create or replace function app.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- the sandbox purge is the only one allowed to delete, and only rows of the tenant it purges
  if tg_op = 'DELETE' then
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true) then
      return old;
    end if;
  end if;

  raise exception '%.% is append-only', tg_table_schema, tg_table_name using errcode = 'ZT002';
end;
$$;
