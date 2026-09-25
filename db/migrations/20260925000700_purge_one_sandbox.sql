-- migrate:up
drop function ops.purge_expired_sandboxes();

create function ops.expired_sandboxes(p_limit integer)
returns table (id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
    from app.tenants t
   where t.kind = 'sandbox' and t.expires_at <= now()
   order by t.expires_at
   limit p_limit;
$$;

-- one sandbox per call: a full one can take most of the statement timeout, and a failure only rolls back itself
create function ops.purge_sandbox(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged boolean;
begin
  -- lifts app.reject_change for this tenant only, the journals and the trail go with it
  perform set_config('zeit.purge_tenant', p_id::text, true);
  delete from app.tenants t where t.id = p_id and t.kind = 'sandbox' and t.expires_at <= now();
  purged := found;
  if purged then
    delete from audit.log l where l.tenant_id = p_id;
  end if;

  perform set_config('zeit.purge_tenant', '', true);
  return purged;
end;
$$;

grant create on schema ops to zeit_system;
alter function ops.expired_sandboxes(integer) owner to zeit_system;
alter function ops.purge_sandbox(uuid) owner to zeit_system;
revoke create on schema ops from zeit_system;

revoke all on function ops.expired_sandboxes(integer), ops.purge_sandbox(uuid) from public;
grant execute on function ops.expired_sandboxes(integer), ops.purge_sandbox(uuid) to zeit_app;

-- migrate:down
drop function ops.purge_sandbox(uuid);
drop function ops.expired_sandboxes(integer);

create function ops.purge_expired_sandboxes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  sandbox uuid;
  purged integer := 0;
begin
  -- one sandbox takes about 0.4 s, ten stay inside the 15 s statement_timeout; the job repeats while it gets ten
  for sandbox in
    select t.id
      from app.tenants t
     where t.kind = 'sandbox' and t.expires_at <= now()
     order by t.expires_at
     limit 10
  loop
    -- lifts app.reject_change for this tenant only, the journals and the trail go with it
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
alter function ops.purge_expired_sandboxes() owner to zeit_system;
revoke create on schema ops from zeit_system;

revoke all on function ops.purge_expired_sandboxes() from public;
grant execute on function ops.purge_expired_sandboxes() to zeit_app;
