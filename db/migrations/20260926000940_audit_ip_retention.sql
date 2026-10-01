-- migrate:up
-- cut rather than hmac: the network still points at abuse, a hash over 2^32 ipv4 addresses is quickly reversed
create function audit.ip_network(p_ip inet)
returns inet
language sql
immutable
parallel safe
as $$
  select pg_catalog.network(pg_catalog.set_masklen(p_ip, case pg_catalog.family(p_ip) when 4 then 24 else 48 end))::inet
$$;

create function audit.guard_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- the one update allowed: the address cut down to its network, everything else untouched
  if to_jsonb(new) - 'ip' = to_jsonb(old) - 'ip' and new.ip = audit.ip_network(old.ip) then
    return new;
  end if;
  raise exception '%.% is append-only', tg_table_schema, tg_table_name using errcode = 'ZT002';
end;
$$;

-- app.reject_change keeps the deletes, the sandbox purge still goes through it
drop trigger log_append_only on audit.log;
create trigger log_append_only
  before delete on audit.log
  for each row execute function app.reject_change();
create trigger log_guard_update
  before update on audit.log
  for each row execute function audit.guard_log();

-- only rows still carrying a full address, so the hourly run stays small once it has caught up
create index log_ip_uncut_idx on audit.log (occurred_at)
  where ip <> audit.ip_network(ip);

-- the cleanup job (apps/api/src/jobs/cleanup.job.ts) calls this hourly next to auth.purge_expired
create function ops.audit_ip_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cut integer;
begin
  -- a second container running the job at the same time just skips
  if not pg_try_advisory_xact_lock(hashtext('zeit:audit-ip-retention')) then
    return 0;
  end if;

  update audit.log l set ip = audit.ip_network(l.ip)
   where l.occurred_at < now() - interval '30 days'
     and l.ip <> audit.ip_network(l.ip);
  get diagnostics cut = row_count;
  return cut;
end;
$$;

grant update (ip) on audit.log to zeit_system;
grant execute on function audit.ip_network(inet) to zeit_app, zeit_system;

grant create on schema ops to zeit_system;
alter function ops.audit_ip_retention() owner to zeit_system;
revoke create on schema ops from zeit_system;
grant execute on function ops.audit_ip_retention() to zeit_app;

-- migrate:down
drop function ops.audit_ip_retention();
revoke update (ip) on audit.log from zeit_system;
drop index audit.log_ip_uncut_idx;

drop trigger log_guard_update on audit.log;
drop trigger log_append_only on audit.log;
create trigger log_append_only
  before update or delete on audit.log
  for each row execute function app.reject_change();

drop function audit.guard_log();
drop function audit.ip_network(inet);
