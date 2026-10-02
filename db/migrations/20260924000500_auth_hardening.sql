-- migrate:up
alter default privileges for role zeit_owner revoke execute on functions from public;
revoke execute on all functions in schema app, auth, audit, ops from public;
grant execute on function app.tenant_id(), app.user_id(), app.employee_id(), app.role()
  to zeit_app, zeit_system;

alter table app.tenants add constraint tenants_holiday_options_check
  check (holiday_options <@ array['corpus_christi', 'augsburg_peace', 'assumption_day']);

alter table auth.credentials add column last_failed_at timestamptz;

create or replace function auth.login_lookup(p_email text)
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
     and u.status = 'active';
$$;

create or replace function auth.login_failed(p_user_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  update auth.credentials c
     set failed_count = s.misses,
         last_failed_at = now(),
         locked_until = case
           when s.misses >= 5 then now() + interval '1 minute' * power(2, least(s.misses - 5, 6))
         end
    from (
      select p.user_id,
             case when p.last_failed_at > now() - interval '24 hours' then p.failed_count else 0 end + 1 as misses
        from auth.credentials p
       where p.user_id = p_user_id
    ) s
   where c.user_id = s.user_id
  returning c.locked_until;
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

drop function auth.token_issue(uuid, auth.token_kind, bytea, interval);

create function auth.token_issue(p_user_id uuid, p_kind auth.token_kind, p_token_hash bytea)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  insert into auth.tokens as t (user_id, kind, token_hash, expires_at)
  values (
    p_user_id, p_kind, p_token_hash,
    now() + case p_kind when 'invite' then interval '7 days' else interval '30 minutes' end
  )
  on conflict (user_id, kind) where used_at is null do update
    set token_hash = excluded.token_hash, expires_at = excluded.expires_at, created_at = now()
  returning t.expires_at;
$$;

create function auth.invitation_accept(p_token_hash bytea, p_password_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid;
begin
  update auth.tokens t set used_at = now()
    from app.users u
   where t.token_hash = p_token_hash
     and t.kind = 'invite'
     and t.used_at is null
     and t.expires_at > now()
     and u.id = t.user_id
     and u.status = 'invited'
  returning t.user_id into account;

  if account is not null then
    perform auth.password_set(account, p_password_hash);
  end if;
  return account;
end;
$$;

create function auth.password_reset(p_token_hash bytea, p_password_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid;
begin
  update auth.tokens t set used_at = now()
    from app.users u
   where t.token_hash = p_token_hash
     and t.kind = 'password_reset'
     and t.used_at is null
     and t.expires_at > now()
     and u.id = t.user_id
     and u.status = 'active'
  returning t.user_id into account;

  if account is not null then
    perform auth.password_set(account, p_password_hash);
    delete from auth.sessions s where s.user_id = account;
  end if;
  return account;
end;
$$;

create function auth.password_change(p_password_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid := app.user_id();
begin
  if account is null then
    raise exception 'nobody is signed in' using errcode = '28000';
  end if;

  perform auth.password_set(account, p_password_hash);
  delete from auth.sessions s where s.user_id = account;
end;
$$;

revoke update on app.tenants, app.users from zeit_app;
grant update (
  name, state, holiday_options, half_days_dec24_31, flex_cap_plus_min, flex_cap_minus_min,
  flex_cap_mode, carryover_until
) on app.tenants to zeit_app;
grant update (display_name, locale, role, employee_id, status) on app.users to zeit_app;

create function app.guard_own_user()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  own constant text[] := array['display_name', 'locale', 'updated_at', 'last_login_at'];
begin
  if new.id = app.user_id() and to_jsonb(new) - own <> to_jsonb(old) - own then
    raise exception 'only display name and locale can be changed on one''s own user'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger users_guard_own
  before update on app.users
  for each row execute function app.guard_own_user();

create function app.display_names(p_ids uuid[])
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.display_name
    from app.users u
   where u.id = any (p_ids)
     and u.tenant_id = app.tenant_id();
$$;

create function app.team_absence_days(p_from date, p_to date, p_team_id uuid)
returns table (
  employee_id uuid,
  display_name text,
  date date,
  portion numeric,
  type text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  full_view boolean;
begin
  if p_to < p_from or p_to - p_from >= 62 then
    raise exception 'a calendar spans 1 to 62 days' using errcode = 'invalid_parameter_value';
  end if;

  select app.role() >= 'hr'
         or exists (select 1 from app.team_leads l where l.team_id = t.id and l.user_id = app.user_id())
    into full_view
    from app.teams t
   where t.id = p_team_id
     and t.tenant_id = app.tenant_id();

  if full_view is null or (not full_view and not exists (
    select 1 from app.employees e where e.id = app.employee_id() and e.team_id = p_team_id
  )) then
    raise exception 'team % is not visible', p_team_id using errcode = 'insufficient_privilege';
  end if;

  return query
    select e.id, e.first_name || ' ' || e.last_name, d.date, d.portion,
           case when full_view then r.type::text end,
           case when full_view then r.status::text end
      from app.absence_days d
      join app.absence_requests r on r.id = d.absence_id
      join app.employees e on e.id = d.employee_id
     where e.team_id = p_team_id
       and d.tenant_id = app.tenant_id()
       and d.superseded_at is null
       and d.date between p_from and p_to
       and r.status in ('pending', 'approved', 'cancel_pending')
     order by e.last_name, e.first_name, d.date;
end;
$$;

alter table ops.demo_outbox enable row level security, force row level security;

create policy "tenant fence" on ops.demo_outbox as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "members read the outbox" on ops.demo_outbox for select to zeit_app
  using (true);

create policy "the app posts mail" on ops.demo_outbox for insert to zeit_app
  with check (true);

grant select on app.teams, app.absence_requests, app.absence_days to zeit_system;

grant create on schema auth, app to zeit_system;
alter function auth.token_issue(uuid, auth.token_kind, bytea) owner to zeit_system;
alter function auth.invitation_accept(bytea, text) owner to zeit_system;
alter function auth.password_reset(bytea, text) owner to zeit_system;
alter function auth.password_change(text) owner to zeit_system;
alter function app.display_names(uuid[]) owner to zeit_system;
alter function app.team_absence_days(date, date, uuid) owner to zeit_system;
revoke create on schema auth, app from zeit_system;

revoke execute on function auth.password_set(uuid, text) from zeit_app;
grant execute on function
  auth.token_issue(uuid, auth.token_kind, bytea),
  auth.invitation_accept(bytea, text),
  auth.password_reset(bytea, text),
  auth.password_change(text),
  app.display_names(uuid[]),
  app.team_absence_days(date, date, uuid)
to zeit_app;

-- migrate:down
drop policy "the app posts mail" on ops.demo_outbox;
drop policy "members read the outbox" on ops.demo_outbox;
drop policy "tenant fence" on ops.demo_outbox;
alter table ops.demo_outbox no force row level security, disable row level security;

drop function app.team_absence_days(date, date, uuid);
drop function app.display_names(uuid[]);
revoke select on app.teams, app.absence_requests, app.absence_days from zeit_system;
drop trigger users_guard_own on app.users;
drop function app.guard_own_user();

revoke update (display_name, locale, role, employee_id, status) on app.users from zeit_app;
revoke update (
  name, state, holiday_options, half_days_dec24_31, flex_cap_plus_min, flex_cap_minus_min,
  flex_cap_mode, carryover_until
) on app.tenants from zeit_app;
grant update on app.tenants, app.users to zeit_app;

drop function auth.password_change(text);
drop function auth.password_reset(bytea, text);
drop function auth.invitation_accept(bytea, text);
drop function auth.token_issue(uuid, auth.token_kind, bytea);

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

grant create on schema auth to zeit_system;
alter function auth.token_issue(uuid, auth.token_kind, bytea, interval) owner to zeit_system;
revoke create on schema auth from zeit_system;
grant execute on function auth.token_issue(uuid, auth.token_kind, bytea, interval), auth.password_set(uuid, text)
  to zeit_app;

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

create or replace function auth.login_failed(p_user_id uuid)
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

create or replace function auth.login_lookup(p_email text)
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

alter table auth.credentials drop column last_failed_at;
alter table app.tenants drop constraint tenants_holiday_options_check;

revoke execute on function app.tenant_id(), app.user_id(), app.employee_id(), app.role()
  from zeit_app, zeit_system;
grant execute on function
  app.tenant_id(), app.user_id(), app.employee_id(), app.role(), app.set_updated_at(),
  app.reject_change(), app.check_contract_start(), app.guard_time_entry(), app.inherit_closed_through()
to public;
alter default privileges for role zeit_owner grant execute on functions to public;
