-- migrate:up
create or replace function app.tenant_id()
returns uuid
language sql
stable
parallel safe
as $$
  select nullif(pg_catalog.current_setting('app.tenant_id', true), '')::pg_catalog.uuid
$$;

create or replace function app.user_id()
returns uuid
language sql
stable
parallel safe
as $$
  select nullif(pg_catalog.current_setting('app.user_id', true), '')::pg_catalog.uuid
$$;

create or replace function app.employee_id()
returns uuid
language sql
stable
parallel safe
as $$
  select nullif(pg_catalog.current_setting('app.employee_id', true), '')::pg_catalog.uuid
$$;

create or replace function app.role()
returns app.user_role
language sql
stable
parallel safe
as $$
  select nullif(pg_catalog.current_setting('app.role', true), '')::app.user_role
$$;

alter policy "leads apply corrections" on app.time_entries
  with check (source = 'correction' and app.leads(employee_id));

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

create or replace function ops.purge_expired_sandboxes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  sandbox uuid;
  purged integer := 0;
begin
  for sandbox in
    select t.id
      from app.tenants t
     where t.kind = 'sandbox' and t.expires_at <= now()
     order by t.expires_at
     limit 10
  loop
    perform set_config('zeit.purge_tenant', sandbox::text, true);
    delete from app.tenants t where t.id = sandbox;
    delete from audit.log l where l.tenant_id = sandbox;
    purged := purged + 1;
  end loop;

  perform set_config('zeit.purge_tenant', '', true);
  return purged;
end;
$$;

grant create on schema ops to zeit_system;
alter function ops.active_tenants() owner to zeit_system;
revoke create on schema ops from zeit_system;

grant execute on function ops.active_tenants() to zeit_app;

-- migrate:down
drop function ops.active_tenants();

create or replace function ops.purge_expired_sandboxes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  sandbox uuid;
  purged integer := 0;
begin
  for sandbox in
    select t.id from app.tenants t where t.kind = 'sandbox' and t.expires_at <= now()
  loop
    perform set_config('zeit.purge_tenant', sandbox::text, true);
    delete from app.tenants t where t.id = sandbox;
    delete from audit.log l where l.tenant_id = sandbox;
    purged := purged + 1;
  end loop;

  perform set_config('zeit.purge_tenant', '', true);
  return purged;
end;
$$;

alter policy "leads apply corrections" on app.time_entries
  with check (app.leads(employee_id) and source = 'correction');

create or replace function app.role()
returns app.user_role
language sql
stable
parallel safe
set search_path = ''
as $$
  select nullif(current_setting('app.role', true), '')::app.user_role
$$;

create or replace function app.employee_id()
returns uuid
language sql
stable
parallel safe
set search_path = ''
as $$
  select nullif(current_setting('app.employee_id', true), '')::uuid
$$;

create or replace function app.user_id()
returns uuid
language sql
stable
parallel safe
set search_path = ''
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app.tenant_id()
returns uuid
language sql
stable
parallel safe
set search_path = ''
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;
