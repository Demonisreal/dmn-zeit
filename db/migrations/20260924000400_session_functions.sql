-- migrate:up
create function auth.sessions_list(p_user_id uuid)
returns table (id uuid, created_at timestamptz, last_seen_at timestamptz, ip inet, user_agent text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.created_at, s.last_seen_at, s.ip, s.user_agent
    from auth.sessions s
   where s.user_id = p_user_id
     and s.idle_expires_at > now()
     and s.absolute_expires_at > now()
   order by s.last_seen_at desc;
$$;

create function auth.session_revoke_by_id(p_user_id uuid, p_session_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id returning s.id
  )
  select exists (select 1 from gone);
$$;

create function auth.token_inspect(p_token_hash bytea, p_kind auth.token_kind)
returns table (user_id uuid, email text, display_name text, tenant_name text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, u.display_name, t.name, k.expires_at
    from auth.tokens k
    join app.users u on u.id = k.user_id
    join app.tenants t on t.id = u.tenant_id
   where k.token_hash = p_token_hash
     and k.kind = p_kind
     and k.used_at is null
     and k.expires_at > now();
$$;

create function ops.demo_switch_persona(
  p_session_token_hash bytea,
  p_target_user_id uuid,
  p_new_token_hash bytea,
  p_new_csrf_hash bytea
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  with old as (
    delete from auth.sessions s
     using app.users u, app.tenants t, app.users target
     where s.token_hash = p_session_token_hash
       and s.idle_expires_at > now()
       and s.absolute_expires_at > now()
       and u.id = s.user_id
       and t.id = u.tenant_id
       and t.kind = 'sandbox'
       and t.expires_at > now()
       and target.id = p_target_user_id
       and target.tenant_id = t.id
       and target.status in ('active', 'demo')
    returning target.id as user_id, s.ip, s.user_agent
  )
  insert into auth.sessions (
    user_id, token_hash, csrf_hash, idle_expires_at, absolute_expires_at, ip, user_agent
  )
  select old.user_id, p_new_token_hash, p_new_csrf_hash, now() + interval '12 hours',
         now() + interval '7 days', old.ip, old.user_agent
    from old
  returning id;
$$;

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

grant delete on app.tenants to zeit_system;
grant select, delete on audit.log to zeit_system;

grant create on schema auth, ops to zeit_system;
alter function auth.sessions_list(uuid) owner to zeit_system;
alter function auth.session_revoke_by_id(uuid, uuid) owner to zeit_system;
alter function auth.token_inspect(bytea, auth.token_kind) owner to zeit_system;
alter function ops.demo_switch_persona(bytea, uuid, bytea, bytea) owner to zeit_system;
alter function ops.purge_expired_sandboxes() owner to zeit_system;
revoke create on schema auth, ops from zeit_system;

revoke all on function
  auth.sessions_list(uuid),
  auth.session_revoke_by_id(uuid, uuid),
  auth.token_inspect(bytea, auth.token_kind),
  ops.demo_switch_persona(bytea, uuid, bytea, bytea),
  ops.purge_expired_sandboxes()
from public;

grant execute on function
  auth.sessions_list(uuid),
  auth.session_revoke_by_id(uuid, uuid),
  auth.token_inspect(bytea, auth.token_kind),
  ops.demo_switch_persona(bytea, uuid, bytea, bytea),
  ops.purge_expired_sandboxes()
to zeit_app;

-- migrate:down
drop function ops.purge_expired_sandboxes();
drop function ops.demo_switch_persona(bytea, uuid, bytea, bytea);
drop function auth.token_inspect(bytea, auth.token_kind);
drop function auth.session_revoke_by_id(uuid, uuid);
drop function auth.sessions_list(uuid);

revoke select, delete on audit.log from zeit_system;
revoke delete on app.tenants from zeit_system;
