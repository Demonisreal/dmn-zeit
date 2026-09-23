\restrict dbmate

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app;


--
-- Name: audit; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA audit;


--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: ops; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA ops;


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: absence_status; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.absence_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'withdrawn',
    'cancel_pending',
    'cancelled'
);


--
-- Name: absence_type; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.absence_type AS ENUM (
    'vacation',
    'sick',
    'time_off'
);


--
-- Name: correction_action; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.correction_action AS ENUM (
    'add',
    'change',
    'void'
);


--
-- Name: correction_status; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.correction_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'withdrawn'
);


--
-- Name: end_reason; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.end_reason AS ENUM (
    'break',
    'leave'
);


--
-- Name: entry_source; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.entry_source AS ENUM (
    'clock',
    'correction',
    'seed'
);


--
-- Name: federal_state; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.federal_state AS ENUM (
    'BW',
    'BY',
    'BE',
    'BB',
    'HB',
    'HH',
    'HE',
    'MV',
    'NI',
    'NW',
    'RP',
    'SL',
    'SN',
    'ST',
    'SH',
    'TH'
);


--
-- Name: flex_booking_type; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.flex_booking_type AS ENUM (
    'opening',
    'manual',
    'payout',
    'cap_forfeit'
);


--
-- Name: flex_cap_mode; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.flex_cap_mode AS ENUM (
    'none',
    'forfeit_at_close',
    'warn'
);


--
-- Name: month_closing_action; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.month_closing_action AS ENUM (
    'close',
    'reopen'
);


--
-- Name: notice_channel; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.notice_channel AS ENUM (
    'in_app',
    'email',
    'letter'
);


--
-- Name: tenant_kind; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.tenant_kind AS ENUM (
    'live',
    'sandbox'
);


--
-- Name: user_role; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.user_role AS ENUM (
    'employee',
    'team_lead',
    'hr',
    'admin'
);


--
-- Name: user_status; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.user_status AS ENUM (
    'invited',
    'active',
    'disabled',
    'demo'
);


--
-- Name: vacation_entry_type; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.vacation_entry_type AS ENUM (
    'entitlement',
    'adjustment',
    'taken',
    'refund_sick',
    'refund_cancel',
    'expiry',
    'manual'
);


--
-- Name: token_kind; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.token_kind AS ENUM (
    'invite',
    'password_reset'
);


--
-- Name: apply_month_closing(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.apply_month_closing() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  balance bigint;
  previous date;
  through date;
begin
  -- two sessions closing the same tenant would otherwise both see the month as open
  perform pg_advisory_xact_lock(hashtextextended('month_closings ' || new.tenant_id::text, 0));

  -- closed means one close more than reopens; the new row is already counted here
  with months as (
    select c.month,
           count(*) filter (where c.action = 'close') - count(*) filter (where c.action = 'reopen') as closes
      from app.month_closings c
     where c.tenant_id = new.tenant_id
     group by c.month
  )
  select (select m.closes from months m where m.month = new.month),
         (select max(m.month) from months m where m.closes = 1 and m.month <> new.month)
    into balance, previous;

  if new.action = 'close' then
    if balance <> 1
      or previous <> (new.month - interval '1 month')::date
      or new.month >= date_trunc('month', now() at time zone 'Europe/Berlin') then
      raise exception 'month % is not the next one to close', new.month using errcode = 'ZT003';
    end if;
    through := (new.month + interval '1 month')::date - 1;
  else
    if balance <> 0 or previous > new.month then
      raise exception 'only the last closed month can be reopened' using errcode = 'ZT003';
    end if;
    through := (previous + interval '1 month')::date - 1;
  end if;

  update app.employees e set closed_through = through where e.tenant_id = new.tenant_id;
  return null;
end;
$$;


--
-- Name: check_contract_start(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.check_contract_start() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.valid_from < (select e.entry_date from app.employees e where e.id = new.employee_id) then
    raise exception 'contract starts before the entry date' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


--
-- Name: employee_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.employee_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select nullif(current_setting('app.employee_id', true), '')::uuid
$$;


--
-- Name: enforce_period_lock(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.enforce_period_lock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  affected date := to_jsonb(new) ->> tg_argv[0];
  locked date;
begin
  select e.closed_through into locked from app.employees e where e.id = new.employee_id;
  if affected <= locked then
    raise exception 'period up to % is closed', locked using errcode = 'ZT001';
  end if;
  return null;
end;
$$;


--
-- Name: guard_request_status(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_request_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    -- only a direct correction and a sick note skip the pending step
    if new.status::text <> 'pending' and not (
      new.status::text = 'approved'
      and (new.decided_by is not distinct from new.requested_by
        or to_jsonb(new) ->> 'type' is not distinct from 'sick')
    ) then
      raise exception 'a new % starts as pending', tg_table_name using errcode = 'ZT003';
    end if;
  elsif new.status is distinct from old.status
    and old.status::text || '>' || new.status::text <> all (array[
      'pending>approved', 'pending>rejected', 'pending>withdrawn',
      'approved>cancel_pending', 'approved>cancelled',
      'cancel_pending>approved', 'cancel_pending>cancelled'
    ]) then
    raise exception '% cannot go from % to %', tg_table_name, old.status, new.status
      using errcode = 'ZT003';
  end if;

  if exists (select 1 from app.users u where u.id = new.decided_by and u.employee_id = new.employee_id) then
    raise exception 'nobody decides on their own %', tg_table_name using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;


--
-- Name: guard_time_entry(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_time_entry() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: inherit_closed_through(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.inherit_closed_through() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  select (max(m.month) + interval '1 month')::date - 1
    into new.closed_through
    from (
      select c.month
        from app.month_closings c
       where c.tenant_id = new.tenant_id
       group by c.month
      having count(*) filter (where c.action = 'close') > count(*) filter (where c.action = 'reopen')
    ) m;
  return new;
end;
$$;


--
-- Name: leads(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.leads(p_employee_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select exists (
    select 1
      from app.employees e
      join app.team_leads l on l.team_id = e.team_id
     where e.id = p_employee_id
       and l.user_id = app.user_id()
  )
$$;


--
-- Name: reject_change(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.reject_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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


--
-- Name: role(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.role() RETURNS app.user_role
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select nullif(current_setting('app.role', true), '')::app.user_role
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: tenant_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.tenant_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;


--
-- Name: user_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.user_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;


--
-- Name: track(); Type: FUNCTION; Schema: audit; Owner: -
--

CREATE FUNCTION audit.track() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  -- bookkeeping columns alone are not worth a trail entry
  skipped constant text[] := array['updated_at', 'last_login_at'];
  old_row jsonb := '{}';
  new_row jsonb := '{}';
  latest jsonb;
  changed jsonb;
  tenant uuid;
begin
  if tg_op <> 'INSERT' then
    old_row := to_jsonb(old) - skipped;
  end if;
  if tg_op <> 'DELETE' then
    new_row := to_jsonb(new) - skipped;
  end if;
  latest := case when tg_op = 'DELETE' then old_row else new_row end;
  tenant := (case when tg_table_name = 'tenants' then latest ->> 'id' else latest ->> 'tenant_id' end)::uuid;

  -- rows cascading away with their tenant are the sandbox purge, which deletes the trail right after
  if tg_op = 'DELETE' and not exists (select 1 from app.tenants t where t.id = tenant) then
    return null;
  end if;

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
    tenant,
    app.user_id(),
    app.role(),
    'trigger',
    lower(tg_op),
    tg_table_name,
    (latest ->> 'id')::uuid,
    (case when tg_table_name = 'employees' then latest ->> 'id' else latest ->> 'employee_id' end)::uuid,
    changed,
    nullif(current_setting('app.request_id', true), '')::uuid
  );

  return null;
end;
$$;


--
-- Name: login_failed(uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.login_failed(p_user_id uuid) RETURNS timestamp with time zone
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- from the fifth miss in a row the account locks for 1, 2, 4 ... 64 minutes
  update auth.credentials c
     set failed_count = c.failed_count + 1,
         locked_until = case
           when c.failed_count >= 4 then now() + interval '1 minute' * power(2, least(c.failed_count - 4, 6))
         end
   where c.user_id = p_user_id
  returning c.locked_until;
$$;


--
-- Name: login_lookup(text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.login_lookup(p_email text) RETURNS TABLE(user_id uuid, tenant_id uuid, role app.user_role, status app.user_status, password_hash text, failed_count integer, locked_until timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u.id, u.tenant_id, u.role, u.status, c.password_hash, coalesce(c.failed_count, 0), c.locked_until
    from app.users u
    left join auth.credentials c on c.user_id = u.id
   -- search_path is empty, so the citext operator has to be named or = compares case-sensitively
   where u.email operator(public.=) p_email::public.citext
     and u.status in ('active', 'invited');
$$;


--
-- Name: password_set(uuid, text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.password_set(p_user_id uuid, p_password_hash text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into auth.credentials (user_id, password_hash)
  values (p_user_id, p_password_hash)
  on conflict (user_id) do update
    set password_hash = excluded.password_hash, failed_count = 0, locked_until = null;

  -- choosing a password is what turns an invitation into an account
  update app.users u set status = 'active' where u.id = p_user_id and u.status = 'invited';
$$;


--
-- Name: purge_expired(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.purge_expired() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from auth.sessions s where s.idle_expires_at <= now();
  delete from auth.tokens t where t.expires_at <= now();
$$;


--
-- Name: session_create(uuid, bytea, bytea, inet, text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_create(p_user_id uuid, p_token_hash bytea, p_csrf_hash bytea, p_ip inet, p_user_agent text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: session_resolve(bytea); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_resolve(p_token_hash bytea) RETURNS TABLE(session_id uuid, user_id uuid, tenant_id uuid, role app.user_role, employee_id uuid, csrf_hash bytea)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
    -- one write per session and minute keeps the idle window close enough without a write per request
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


--
-- Name: session_revoke(bytea); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_revoke(p_token_hash bytea) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from auth.sessions s where s.token_hash = p_token_hash;
$$;


--
-- Name: session_revoke_all(uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_revoke_all(p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from auth.sessions s where s.user_id = p_user_id;
$$;


--
-- Name: session_revoke_by_id(uuid, uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_revoke_by_id(p_user_id uuid, p_session_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with gone as (
    delete from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id returning s.id
  )
  select exists (select 1 from gone);
$$;


--
-- Name: sessions_list(uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.sessions_list(p_user_id uuid) RETURNS TABLE(id uuid, created_at timestamp with time zone, last_seen_at timestamp with time zone, ip inet, user_agent text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select s.id, s.created_at, s.last_seen_at, s.ip, s.user_agent
    from auth.sessions s
   where s.user_id = p_user_id
     and s.idle_expires_at > now()
     and s.absolute_expires_at > now()
   order by s.last_seen_at desc;
$$;


--
-- Name: token_consume(bytea, auth.token_kind); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.token_consume(p_token_hash bytea, p_kind auth.token_kind) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update auth.tokens t
     set used_at = now()
   where t.token_hash = p_token_hash
     and t.kind = p_kind
     and t.used_at is null
     and t.expires_at > now()
  returning t.user_id;
$$;


--
-- Name: token_inspect(bytea, auth.token_kind); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.token_inspect(p_token_hash bytea, p_kind auth.token_kind) RETURNS TABLE(user_id uuid, email text, display_name text, tenant_name text, expires_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u.id, u.email::text, u.display_name, t.name, k.expires_at
    from auth.tokens k
    join app.users u on u.id = k.user_id
    join app.tenants t on t.id = u.tenant_id
   where k.token_hash = p_token_hash
     and k.kind = p_kind
     and k.used_at is null
     and k.expires_at > now();
$$;


--
-- Name: token_issue(uuid, auth.token_kind, bytea, interval); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.token_issue(p_user_id uuid, p_kind auth.token_kind, p_token_hash bytea, p_ttl interval) RETURNS timestamp with time zone
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- the open token of the same kind is overwritten, so only the newest link works
  insert into auth.tokens as t (user_id, kind, token_hash, expires_at)
  values (p_user_id, p_kind, p_token_hash, now() + p_ttl)
  on conflict (user_id, kind) where used_at is null do update
    set token_hash = excluded.token_hash, expires_at = excluded.expires_at, created_at = now()
  returning t.expires_at;
$$;


--
-- Name: demo_switch_persona(bytea, uuid, bytea, bytea); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.demo_switch_persona(p_session_token_hash bytea, p_target_user_id uuid, p_new_token_hash bytea, p_new_csrf_hash bytea) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- null when the session is gone, the tenant is no live sandbox or the target lives elsewhere
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


--
-- Name: purge_expired_sandboxes(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.purge_expired_sandboxes() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  sandbox uuid;
  purged integer := 0;
begin
  for sandbox in
    select t.id from app.tenants t where t.kind = 'sandbox' and t.expires_at <= now()
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: absence_days; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.absence_days (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    absence_id uuid NOT NULL,
    date date NOT NULL,
    portion numeric(2,1) NOT NULL,
    target_minutes smallint NOT NULL,
    vacation_days numeric(4,2) DEFAULT 0 NOT NULL,
    superseded_at timestamp with time zone,
    superseded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT absence_days_check CHECK (((superseded_by IS NULL) OR (superseded_at IS NOT NULL))),
    CONSTRAINT absence_days_portion_check CHECK ((portion = ANY (ARRAY[0.5, (1)::numeric]))),
    CONSTRAINT absence_days_target_minutes_check CHECK (((target_minutes >= 0) AND (target_minutes <= 600))),
    CONSTRAINT absence_days_vacation_days_check CHECK ((vacation_days >= (0)::numeric))
);

ALTER TABLE ONLY app.absence_days FORCE ROW LEVEL SECURITY;


--
-- Name: absence_requests; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.absence_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    type app.absence_type NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    half_day_start boolean DEFAULT false NOT NULL,
    half_day_end boolean DEFAULT false NOT NULL,
    status app.absence_status DEFAULT 'pending'::app.absence_status NOT NULL,
    note text,
    requested_by uuid NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    decision_note text,
    certificate_confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT absence_requests_check CHECK ((end_date >= start_date)),
    CONSTRAINT absence_requests_check1 CHECK (((start_date < end_date) OR (NOT (half_day_start AND half_day_end)))),
    CONSTRAINT absence_requests_check2 CHECK (((status <> ALL (ARRAY['approved'::app.absence_status, 'rejected'::app.absence_status])) OR (decided_by IS NOT NULL) OR (type = 'sick'::app.absence_type))),
    CONSTRAINT absence_requests_check3 CHECK (((decided_by IS NULL) = (decided_at IS NULL))),
    CONSTRAINT absence_requests_check4 CHECK (((certificate_confirmed_at IS NULL) OR (type = 'sick'::app.absence_type)))
);

ALTER TABLE ONLY app.absence_requests FORCE ROW LEVEL SECURITY;


--
-- Name: contracts; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    valid_from date NOT NULL,
    work_model_id uuid NOT NULL,
    min_mon smallint NOT NULL,
    min_tue smallint NOT NULL,
    min_wed smallint NOT NULL,
    min_thu smallint NOT NULL,
    min_fri smallint NOT NULL,
    min_sat smallint NOT NULL,
    min_sun smallint NOT NULL,
    vacation_days_year numeric(4,1) NOT NULL,
    vacation_basis_days smallint NOT NULL,
    flex_cap_plus_min integer,
    flex_cap_minus_min integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contracts_flex_cap_minus_min_check CHECK ((flex_cap_minus_min >= 0)),
    CONSTRAINT contracts_flex_cap_plus_min_check CHECK ((flex_cap_plus_min >= 0)),
    CONSTRAINT contracts_min_fri_check CHECK (((min_fri >= 0) AND (min_fri <= 600))),
    CONSTRAINT contracts_min_mon_check CHECK (((min_mon >= 0) AND (min_mon <= 600))),
    CONSTRAINT contracts_min_sat_check CHECK (((min_sat >= 0) AND (min_sat <= 600))),
    CONSTRAINT contracts_min_sun_check CHECK (((min_sun >= 0) AND (min_sun <= 600))),
    CONSTRAINT contracts_min_thu_check CHECK (((min_thu >= 0) AND (min_thu <= 600))),
    CONSTRAINT contracts_min_tue_check CHECK (((min_tue >= 0) AND (min_tue <= 600))),
    CONSTRAINT contracts_min_wed_check CHECK (((min_wed >= 0) AND (min_wed <= 600))),
    CONSTRAINT contracts_vacation_basis_days_check CHECK (((vacation_basis_days >= 1) AND (vacation_basis_days <= 7))),
    CONSTRAINT contracts_vacation_days_year_check CHECK ((vacation_days_year >= (0)::numeric))
);

ALTER TABLE ONLY app.contracts FORCE ROW LEVEL SECURITY;


--
-- Name: correction_requests; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.correction_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    action app.correction_action NOT NULL,
    target_entry_id uuid,
    new_started_at timestamp with time zone,
    new_ended_at timestamp with time zone,
    reason text NOT NULL,
    status app.correction_status DEFAULT 'pending'::app.correction_status NOT NULL,
    requested_by uuid NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    decision_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT correction_requests_check CHECK (((action = 'add'::app.correction_action) = (target_entry_id IS NULL))),
    CONSTRAINT correction_requests_check1 CHECK (((action = 'void'::app.correction_action) = (new_started_at IS NULL))),
    CONSTRAINT correction_requests_check2 CHECK (((new_started_at IS NULL) = (new_ended_at IS NULL))),
    CONSTRAINT correction_requests_check3 CHECK ((new_ended_at > new_started_at)),
    CONSTRAINT correction_requests_check4 CHECK (((status = ANY (ARRAY['approved'::app.correction_status, 'rejected'::app.correction_status])) = (decided_by IS NOT NULL))),
    CONSTRAINT correction_requests_check5 CHECK (((decided_by IS NULL) = (decided_at IS NULL))),
    CONSTRAINT correction_requests_reason_check CHECK ((char_length(btrim(reason)) >= 10))
);

ALTER TABLE ONLY app.correction_requests FORCE ROW LEVEL SECURITY;


--
-- Name: employees; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    personnel_no text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    team_id uuid,
    entry_date date NOT NULL,
    exit_date date,
    closed_through date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employees_check CHECK ((exit_date >= entry_date)),
    CONSTRAINT employees_first_name_check CHECK ((btrim(first_name) <> ''::text)),
    CONSTRAINT employees_last_name_check CHECK ((btrim(last_name) <> ''::text)),
    CONSTRAINT employees_personnel_no_check CHECK ((btrim(personnel_no) <> ''::text))
);

ALTER TABLE ONLY app.employees FORCE ROW LEVEL SECURITY;


--
-- Name: finding_acks; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.finding_acks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    work_date date NOT NULL,
    rule_code text NOT NULL,
    rule_version text NOT NULL,
    note text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finding_acks_note_check CHECK ((btrim(note) <> ''::text)),
    CONSTRAINT finding_acks_rule_code_check CHECK ((rule_code ~ '^ARBZG_[0-9A-Z_]+$'::text)),
    CONSTRAINT finding_acks_rule_version_check CHECK ((btrim(rule_version) <> ''::text))
);

ALTER TABLE ONLY app.finding_acks FORCE ROW LEVEL SECURITY;


--
-- Name: flex_bookings; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.flex_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    type app.flex_booking_type NOT NULL,
    minutes integer NOT NULL,
    effective_date date NOT NULL,
    reason text NOT NULL,
    month_closing_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT flex_bookings_check CHECK (((type = 'cap_forfeit'::app.flex_booking_type) = (month_closing_id IS NOT NULL))),
    CONSTRAINT flex_bookings_check1 CHECK (((type <> 'payout'::app.flex_booking_type) OR (minutes < 0))),
    CONSTRAINT flex_bookings_minutes_check CHECK ((minutes <> 0)),
    CONSTRAINT flex_bookings_reason_check CHECK ((btrim(reason) <> ''::text))
);

ALTER TABLE ONLY app.flex_bookings FORCE ROW LEVEL SECURITY;


--
-- Name: month_closings; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.month_closings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    month date NOT NULL,
    action app.month_closing_action NOT NULL,
    reason text,
    snapshot jsonb,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT month_closings_check CHECK (((action = 'close'::app.month_closing_action) OR (reason IS NOT NULL))),
    CONSTRAINT month_closings_month_check CHECK ((EXTRACT(day FROM month) = (1)::numeric)),
    CONSTRAINT month_closings_reason_check CHECK ((btrim(reason) <> ''::text))
);

ALTER TABLE ONLY app.month_closings FORCE ROW LEVEL SECURITY;


--
-- Name: team_leads; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.team_leads (
    tenant_id uuid NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY app.team_leads FORCE ROW LEVEL SECURITY;


--
-- Name: teams; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT teams_name_check CHECK ((btrim(name) <> ''::text))
);

ALTER TABLE ONLY app.teams FORCE ROW LEVEL SECURITY;


--
-- Name: tenants; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug public.citext NOT NULL,
    state app.federal_state NOT NULL,
    timezone text DEFAULT 'Europe/Berlin'::text NOT NULL,
    holiday_options text[] DEFAULT '{}'::text[] NOT NULL,
    half_days_dec24_31 boolean DEFAULT false NOT NULL,
    flex_cap_plus_min integer,
    flex_cap_minus_min integer,
    flex_cap_mode app.flex_cap_mode DEFAULT 'none'::app.flex_cap_mode NOT NULL,
    carryover_until text DEFAULT '03-31'::text NOT NULL,
    kind app.tenant_kind DEFAULT 'live'::app.tenant_kind NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenants_carryover_until_check CHECK ((carryover_until ~ '^((0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-8])|(0[13-9]|1[0-2])-(29|30)|(0[13578]|1[02])-31)$'::text)),
    CONSTRAINT tenants_check CHECK (((kind = 'sandbox'::app.tenant_kind) = (expires_at IS NOT NULL))),
    CONSTRAINT tenants_flex_cap_minus_min_check CHECK ((flex_cap_minus_min >= 0)),
    CONSTRAINT tenants_flex_cap_plus_min_check CHECK ((flex_cap_plus_min >= 0)),
    CONSTRAINT tenants_name_check CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT tenants_slug_check CHECK (((slug)::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)),
    CONSTRAINT tenants_timezone_check CHECK ((timezone = 'Europe/Berlin'::text))
);

ALTER TABLE ONLY app.tenants FORCE ROW LEVEL SECURITY;


--
-- Name: time_entries; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.time_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    workday date GENERATED ALWAYS AS (((started_at AT TIME ZONE 'Europe/Berlin'::text))::date) STORED NOT NULL,
    end_reason app.end_reason,
    source app.entry_source NOT NULL,
    request_id uuid,
    voided_at timestamp with time zone,
    voided_by_request_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT time_entries_check CHECK ((ended_at > started_at)),
    CONSTRAINT time_entries_check1 CHECK (((end_reason IS NULL) OR (ended_at IS NOT NULL))),
    CONSTRAINT time_entries_check2 CHECK (((source = 'correction'::app.entry_source) = (request_id IS NOT NULL))),
    CONSTRAINT time_entries_check3 CHECK (((voided_at IS NULL) = (voided_by_request_id IS NULL)))
);

ALTER TABLE ONLY app.time_entries FORCE ROW LEVEL SECURITY;


--
-- Name: users; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email public.citext NOT NULL,
    display_name text NOT NULL,
    role app.user_role DEFAULT 'employee'::app.user_role NOT NULL,
    locale text DEFAULT 'de'::text NOT NULL,
    status app.user_status DEFAULT 'invited'::app.user_status NOT NULL,
    employee_id uuid,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_display_name_check CHECK ((btrim(display_name) <> ''::text)),
    CONSTRAINT users_email_check CHECK (((email)::text ~ '^[^@[:space:]]+@[^@[:space:]]+$'::text)),
    CONSTRAINT users_locale_check CHECK ((locale = ANY (ARRAY['de'::text, 'en'::text])))
);

ALTER TABLE ONLY app.users FORCE ROW LEVEL SECURITY;


--
-- Name: vacation_ledger; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.vacation_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    bucket_year smallint NOT NULL,
    entry_type app.vacation_entry_type NOT NULL,
    days numeric(5,2) NOT NULL,
    effective_date date NOT NULL,
    absence_id uuid,
    notice_id uuid,
    reason text,
    dedupe_key text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vacation_ledger_bucket_year_check CHECK (((bucket_year >= 2000) AND (bucket_year <= 2100))),
    CONSTRAINT vacation_ledger_check CHECK (
CASE entry_type
    WHEN 'entitlement'::app.vacation_entry_type THEN (days > (0)::numeric)
    WHEN 'refund_sick'::app.vacation_entry_type THEN (days > (0)::numeric)
    WHEN 'refund_cancel'::app.vacation_entry_type THEN (days > (0)::numeric)
    WHEN 'taken'::app.vacation_entry_type THEN (days < (0)::numeric)
    WHEN 'expiry'::app.vacation_entry_type THEN (days < (0)::numeric)
    ELSE true
END),
    CONSTRAINT vacation_ledger_check1 CHECK (((entry_type <> ALL (ARRAY['taken'::app.vacation_entry_type, 'refund_sick'::app.vacation_entry_type, 'refund_cancel'::app.vacation_entry_type])) OR (absence_id IS NOT NULL))),
    CONSTRAINT vacation_ledger_check2 CHECK (((entry_type <> 'expiry'::app.vacation_entry_type) OR (notice_id IS NOT NULL))),
    CONSTRAINT vacation_ledger_check3 CHECK (((entry_type <> ALL (ARRAY['adjustment'::app.vacation_entry_type, 'manual'::app.vacation_entry_type])) OR (reason IS NOT NULL))),
    CONSTRAINT vacation_ledger_days_check CHECK ((days <> (0)::numeric)),
    CONSTRAINT vacation_ledger_reason_check CHECK ((btrim(reason) <> ''::text))
);

ALTER TABLE ONLY app.vacation_ledger FORCE ROW LEVEL SECURITY;


--
-- Name: vacation_notices; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.vacation_notices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    bucket_year smallint NOT NULL,
    remaining_days numeric(5,2) NOT NULL,
    deadline date NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_by uuid NOT NULL,
    channel app.notice_channel NOT NULL,
    text_version text NOT NULL,
    acknowledged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vacation_notices_bucket_year_check CHECK (((bucket_year >= 2000) AND (bucket_year <= 2100))),
    CONSTRAINT vacation_notices_remaining_days_check CHECK ((remaining_days >= (0)::numeric)),
    CONSTRAINT vacation_notices_text_version_check CHECK ((btrim(text_version) <> ''::text))
);

ALTER TABLE ONLY app.vacation_notices FORCE ROW LEVEL SECURITY;


--
-- Name: work_models; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.work_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    min_mon smallint NOT NULL,
    min_tue smallint NOT NULL,
    min_wed smallint NOT NULL,
    min_thu smallint NOT NULL,
    min_fri smallint NOT NULL,
    min_sat smallint NOT NULL,
    min_sun smallint NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT work_models_min_fri_check CHECK (((min_fri >= 0) AND (min_fri <= 600))),
    CONSTRAINT work_models_min_mon_check CHECK (((min_mon >= 0) AND (min_mon <= 600))),
    CONSTRAINT work_models_min_sat_check CHECK (((min_sat >= 0) AND (min_sat <= 600))),
    CONSTRAINT work_models_min_sun_check CHECK (((min_sun >= 0) AND (min_sun <= 600))),
    CONSTRAINT work_models_min_thu_check CHECK (((min_thu >= 0) AND (min_thu <= 600))),
    CONSTRAINT work_models_min_tue_check CHECK (((min_tue >= 0) AND (min_tue <= 600))),
    CONSTRAINT work_models_min_wed_check CHECK (((min_wed >= 0) AND (min_wed <= 600))),
    CONSTRAINT work_models_name_check CHECK ((btrim(name) <> ''::text))
);

ALTER TABLE ONLY app.work_models FORCE ROW LEVEL SECURITY;


--
-- Name: log; Type: TABLE; Schema: audit; Owner: -
--

CREATE TABLE audit.log (
    id bigint NOT NULL,
    tenant_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_role app.user_role,
    source text NOT NULL,
    action text NOT NULL,
    table_name text,
    row_id uuid,
    subject_employee_id uuid,
    diff jsonb,
    request_id uuid,
    ip inet,
    CONSTRAINT log_check CHECK (((ip IS NULL) OR (source = 'app'::text))),
    CONSTRAINT log_source_check CHECK ((source = ANY (ARRAY['trigger'::text, 'app'::text])))
);

ALTER TABLE ONLY audit.log FORCE ROW LEVEL SECURITY;


--
-- Name: log_id_seq; Type: SEQUENCE; Schema: audit; Owner: -
--

ALTER TABLE audit.log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME audit.log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: credentials; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.credentials (
    user_id uuid NOT NULL,
    password_hash text NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT credentials_failed_count_check CHECK ((failed_count >= 0)),
    CONSTRAINT credentials_password_hash_check CHECK ((password_hash ~~ '$argon2id$%'::text))
);


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash bytea NOT NULL,
    csrf_hash bytea NOT NULL,
    idle_expires_at timestamp with time zone NOT NULL,
    absolute_expires_at timestamp with time zone NOT NULL,
    ip inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sessions_check CHECK ((idle_expires_at <= absolute_expires_at)),
    CONSTRAINT sessions_csrf_hash_check CHECK ((octet_length(csrf_hash) = 32)),
    CONSTRAINT sessions_token_hash_check CHECK ((octet_length(token_hash) = 32))
);


--
-- Name: tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind auth.token_kind NOT NULL,
    token_hash bytea NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tokens_check CHECK ((expires_at > created_at)),
    CONSTRAINT tokens_token_hash_check CHECK ((octet_length(token_hash) = 32))
);


--
-- Name: demo_outbox; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.demo_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    recipient public.citext NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limits; Type: TABLE; Schema: ops; Owner: -
--

CREATE TABLE ops.rate_limits (
    key text NOT NULL,
    hits integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    blocked_until timestamp with time zone,
    CONSTRAINT rate_limits_hits_check CHECK ((hits > 0))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: absence_days absence_days_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_days
    ADD CONSTRAINT absence_days_pkey PRIMARY KEY (id);


--
-- Name: absence_days absence_days_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_days
    ADD CONSTRAINT absence_days_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: absence_requests absence_requests_no_overlap; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_requests
    ADD CONSTRAINT absence_requests_no_overlap EXCLUDE USING gist (employee_id WITH =, daterange(start_date, end_date, '[]'::text) WITH &&) WHERE (((type <> 'sick'::app.absence_type) AND (status = ANY (ARRAY['pending'::app.absence_status, 'approved'::app.absence_status, 'cancel_pending'::app.absence_status]))));


--
-- Name: absence_requests absence_requests_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_requests
    ADD CONSTRAINT absence_requests_pkey PRIMARY KEY (id);


--
-- Name: absence_requests absence_requests_tenant_id_employee_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_requests
    ADD CONSTRAINT absence_requests_tenant_id_employee_id_id_key UNIQUE (tenant_id, employee_id, id);


--
-- Name: absence_requests absence_requests_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_requests
    ADD CONSTRAINT absence_requests_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_tenant_id_employee_id_valid_from_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contracts
    ADD CONSTRAINT contracts_tenant_id_employee_id_valid_from_key UNIQUE (tenant_id, employee_id, valid_from);


--
-- Name: contracts contracts_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contracts
    ADD CONSTRAINT contracts_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: correction_requests correction_requests_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.correction_requests
    ADD CONSTRAINT correction_requests_pkey PRIMARY KEY (id);


--
-- Name: correction_requests correction_requests_tenant_id_employee_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.correction_requests
    ADD CONSTRAINT correction_requests_tenant_id_employee_id_id_key UNIQUE (tenant_id, employee_id, id);


--
-- Name: correction_requests correction_requests_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.correction_requests
    ADD CONSTRAINT correction_requests_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: employees employees_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.employees
    ADD CONSTRAINT employees_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: employees employees_tenant_id_personnel_no_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.employees
    ADD CONSTRAINT employees_tenant_id_personnel_no_key UNIQUE (tenant_id, personnel_no);


--
-- Name: finding_acks finding_acks_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.finding_acks
    ADD CONSTRAINT finding_acks_pkey PRIMARY KEY (id);


--
-- Name: finding_acks finding_acks_tenant_id_employee_id_work_date_rule_code_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.finding_acks
    ADD CONSTRAINT finding_acks_tenant_id_employee_id_work_date_rule_code_key UNIQUE (tenant_id, employee_id, work_date, rule_code);


--
-- Name: finding_acks finding_acks_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.finding_acks
    ADD CONSTRAINT finding_acks_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: flex_bookings flex_bookings_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.flex_bookings
    ADD CONSTRAINT flex_bookings_pkey PRIMARY KEY (id);


--
-- Name: flex_bookings flex_bookings_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.flex_bookings
    ADD CONSTRAINT flex_bookings_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: flex_bookings flex_bookings_tenant_id_month_closing_id_employee_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.flex_bookings
    ADD CONSTRAINT flex_bookings_tenant_id_month_closing_id_employee_id_key UNIQUE (tenant_id, month_closing_id, employee_id);


--
-- Name: month_closings month_closings_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.month_closings
    ADD CONSTRAINT month_closings_pkey PRIMARY KEY (id);


--
-- Name: month_closings month_closings_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.month_closings
    ADD CONSTRAINT month_closings_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: team_leads team_leads_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.team_leads
    ADD CONSTRAINT team_leads_pkey PRIMARY KEY (team_id, user_id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: teams teams_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.teams
    ADD CONSTRAINT teams_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: time_entries time_entries_no_overlap; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.time_entries
    ADD CONSTRAINT time_entries_no_overlap EXCLUDE USING gist (employee_id WITH =, tstzrange(started_at, ended_at, '[)'::text) WITH &&) WHERE ((voided_at IS NULL));


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);


--
-- Name: time_entries time_entries_tenant_id_employee_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.time_entries
    ADD CONSTRAINT time_entries_tenant_id_employee_id_id_key UNIQUE (tenant_id, employee_id, id);


--
-- Name: time_entries time_entries_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.time_entries
    ADD CONSTRAINT time_entries_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_employee_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_employee_id_key UNIQUE (employee_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: vacation_ledger vacation_ledger_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_ledger
    ADD CONSTRAINT vacation_ledger_pkey PRIMARY KEY (id);


--
-- Name: vacation_ledger vacation_ledger_tenant_id_dedupe_key_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_ledger
    ADD CONSTRAINT vacation_ledger_tenant_id_dedupe_key_key UNIQUE (tenant_id, dedupe_key);


--
-- Name: vacation_ledger vacation_ledger_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_ledger
    ADD CONSTRAINT vacation_ledger_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: vacation_notices vacation_notices_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_notices
    ADD CONSTRAINT vacation_notices_pkey PRIMARY KEY (id);


--
-- Name: vacation_notices vacation_notices_tenant_id_employee_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_notices
    ADD CONSTRAINT vacation_notices_tenant_id_employee_id_id_key UNIQUE (tenant_id, employee_id, id);


--
-- Name: vacation_notices vacation_notices_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_notices
    ADD CONSTRAINT vacation_notices_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: work_models work_models_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.work_models
    ADD CONSTRAINT work_models_pkey PRIMARY KEY (id);


--
-- Name: work_models work_models_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.work_models
    ADD CONSTRAINT work_models_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: log log_pkey; Type: CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.log
    ADD CONSTRAINT log_pkey PRIMARY KEY (id);


--
-- Name: credentials credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.credentials
    ADD CONSTRAINT credentials_pkey PRIMARY KEY (user_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_hash_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: tokens tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.tokens
    ADD CONSTRAINT tokens_pkey PRIMARY KEY (id);


--
-- Name: tokens tokens_token_hash_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.tokens
    ADD CONSTRAINT tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: demo_outbox demo_outbox_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.demo_outbox
    ADD CONSTRAINT demo_outbox_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (key);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: absence_days_absence_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX absence_days_absence_idx ON app.absence_days USING btree (tenant_id, absence_id);


--
-- Name: absence_days_active_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX absence_days_active_idx ON app.absence_days USING btree (employee_id, date) WHERE (superseded_at IS NULL);


--
-- Name: absence_days_calendar_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX absence_days_calendar_idx ON app.absence_days USING btree (tenant_id, date) WHERE (superseded_at IS NULL);


--
-- Name: absence_requests_employee_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX absence_requests_employee_idx ON app.absence_requests USING btree (tenant_id, employee_id, start_date);


--
-- Name: absence_requests_open_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX absence_requests_open_idx ON app.absence_requests USING btree (tenant_id, created_at) WHERE (status = ANY (ARRAY['pending'::app.absence_status, 'cancel_pending'::app.absence_status]));


--
-- Name: correction_requests_employee_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX correction_requests_employee_idx ON app.correction_requests USING btree (tenant_id, employee_id, created_at);


--
-- Name: correction_requests_pending_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX correction_requests_pending_idx ON app.correction_requests USING btree (tenant_id, created_at) WHERE (status = 'pending'::app.correction_status);


--
-- Name: employees_team_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX employees_team_idx ON app.employees USING btree (tenant_id, team_id);


--
-- Name: flex_bookings_employee_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX flex_bookings_employee_idx ON app.flex_bookings USING btree (tenant_id, employee_id, effective_date);


--
-- Name: month_closings_month_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX month_closings_month_idx ON app.month_closings USING btree (tenant_id, month);


--
-- Name: team_leads_user_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX team_leads_user_idx ON app.team_leads USING btree (user_id);


--
-- Name: time_entries_employee_day_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX time_entries_employee_day_idx ON app.time_entries USING btree (tenant_id, employee_id, workday);


--
-- Name: time_entries_one_open_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX time_entries_one_open_idx ON app.time_entries USING btree (employee_id) WHERE ((ended_at IS NULL) AND (voided_at IS NULL));


--
-- Name: vacation_ledger_employee_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX vacation_ledger_employee_idx ON app.vacation_ledger USING btree (tenant_id, employee_id, bucket_year);


--
-- Name: log_tenant_occurred_idx; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX log_tenant_occurred_idx ON audit.log USING btree (tenant_id, occurred_at DESC);


--
-- Name: log_tenant_row_idx; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX log_tenant_row_idx ON audit.log USING btree (tenant_id, table_name, row_id);


--
-- Name: log_tenant_subject_idx; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX log_tenant_subject_idx ON audit.log USING btree (tenant_id, subject_employee_id, occurred_at DESC);


--
-- Name: sessions_idle_expires_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_idle_expires_idx ON auth.sessions USING btree (idle_expires_at);


--
-- Name: sessions_user_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_idx ON auth.sessions USING btree (user_id);


--
-- Name: tokens_expires_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX tokens_expires_idx ON auth.tokens USING btree (expires_at);


--
-- Name: tokens_open_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX tokens_open_idx ON auth.tokens USING btree (user_id, kind) WHERE (used_at IS NULL);


--
-- Name: demo_outbox_tenant_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX demo_outbox_tenant_idx ON ops.demo_outbox USING btree (tenant_id, created_at DESC);


--
-- Name: rate_limits_expires_idx; Type: INDEX; Schema: ops; Owner: -
--

CREATE INDEX rate_limits_expires_idx ON ops.rate_limits USING btree (expires_at);


--
-- Name: absence_days absence_days_period_lock; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER absence_days_period_lock AFTER INSERT OR UPDATE ON app.absence_days FOR EACH ROW EXECUTE FUNCTION app.enforce_period_lock('date');


--
-- Name: absence_requests absence_requests_guard_status; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER absence_requests_guard_status BEFORE INSERT OR UPDATE ON app.absence_requests FOR EACH ROW EXECUTE FUNCTION app.guard_request_status();


--
-- Name: absence_requests absence_requests_period_lock; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER absence_requests_period_lock AFTER INSERT OR UPDATE OF status ON app.absence_requests FOR EACH ROW EXECUTE FUNCTION app.enforce_period_lock('start_date');


--
-- Name: absence_requests absence_requests_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER absence_requests_set_updated_at BEFORE UPDATE ON app.absence_requests FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: absence_days audit_absence_days; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_absence_days AFTER INSERT OR DELETE OR UPDATE ON app.absence_days FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: absence_requests audit_absence_requests; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_absence_requests AFTER INSERT OR DELETE OR UPDATE ON app.absence_requests FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: contracts audit_contracts; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_contracts AFTER INSERT OR DELETE OR UPDATE ON app.contracts FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: correction_requests audit_correction_requests; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_correction_requests AFTER INSERT OR DELETE OR UPDATE ON app.correction_requests FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: employees audit_employees; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_employees AFTER INSERT OR DELETE OR UPDATE ON app.employees FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: finding_acks audit_finding_acks; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_finding_acks AFTER INSERT OR DELETE OR UPDATE ON app.finding_acks FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: flex_bookings audit_flex_bookings; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_flex_bookings AFTER INSERT OR DELETE OR UPDATE ON app.flex_bookings FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: month_closings audit_month_closings; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_month_closings AFTER INSERT OR DELETE OR UPDATE ON app.month_closings FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: team_leads audit_team_leads; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_team_leads AFTER INSERT OR DELETE OR UPDATE ON app.team_leads FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: teams audit_teams; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_teams AFTER INSERT OR DELETE OR UPDATE ON app.teams FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: tenants audit_tenants; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_tenants AFTER INSERT OR DELETE OR UPDATE ON app.tenants FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: time_entries audit_time_entries; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_time_entries AFTER INSERT OR DELETE OR UPDATE ON app.time_entries FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: users audit_users; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_users AFTER INSERT OR DELETE OR UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: vacation_ledger audit_vacation_ledger; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_vacation_ledger AFTER INSERT OR DELETE OR UPDATE ON app.vacation_ledger FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: vacation_notices audit_vacation_notices; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_vacation_notices AFTER INSERT OR DELETE OR UPDATE ON app.vacation_notices FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: work_models audit_work_models; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_work_models AFTER INSERT OR DELETE OR UPDATE ON app.work_models FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: contracts contracts_check_start; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER contracts_check_start BEFORE INSERT ON app.contracts FOR EACH ROW EXECUTE FUNCTION app.check_contract_start();


--
-- Name: contracts contracts_period_lock; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER contracts_period_lock AFTER INSERT ON app.contracts FOR EACH ROW EXECUTE FUNCTION app.enforce_period_lock('valid_from');


--
-- Name: correction_requests correction_requests_guard_status; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER correction_requests_guard_status BEFORE INSERT OR UPDATE ON app.correction_requests FOR EACH ROW EXECUTE FUNCTION app.guard_request_status();


--
-- Name: correction_requests correction_requests_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER correction_requests_set_updated_at BEFORE UPDATE ON app.correction_requests FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: employees employees_inherit_closed_through; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER employees_inherit_closed_through BEFORE INSERT ON app.employees FOR EACH ROW EXECUTE FUNCTION app.inherit_closed_through();


--
-- Name: employees employees_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER employees_set_updated_at BEFORE UPDATE ON app.employees FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: flex_bookings flex_bookings_append_only; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER flex_bookings_append_only BEFORE DELETE OR UPDATE ON app.flex_bookings FOR EACH ROW EXECUTE FUNCTION app.reject_change();


--
-- Name: flex_bookings flex_bookings_no_truncate; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER flex_bookings_no_truncate BEFORE TRUNCATE ON app.flex_bookings FOR EACH STATEMENT EXECUTE FUNCTION app.reject_change();


--
-- Name: flex_bookings flex_bookings_period_lock; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER flex_bookings_period_lock AFTER INSERT ON app.flex_bookings FOR EACH ROW EXECUTE FUNCTION app.enforce_period_lock('effective_date');


--
-- Name: month_closings month_closings_append_only; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER month_closings_append_only BEFORE DELETE OR UPDATE ON app.month_closings FOR EACH ROW EXECUTE FUNCTION app.reject_change();


--
-- Name: month_closings month_closings_apply; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER month_closings_apply AFTER INSERT ON app.month_closings FOR EACH ROW EXECUTE FUNCTION app.apply_month_closing();


--
-- Name: month_closings month_closings_no_truncate; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER month_closings_no_truncate BEFORE TRUNCATE ON app.month_closings FOR EACH STATEMENT EXECUTE FUNCTION app.reject_change();


--
-- Name: teams teams_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON app.teams FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: tenants tenants_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON app.tenants FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: time_entries time_entries_guard; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER time_entries_guard BEFORE INSERT OR DELETE OR UPDATE ON app.time_entries FOR EACH ROW EXECUTE FUNCTION app.guard_time_entry();


--
-- Name: time_entries time_entries_no_truncate; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER time_entries_no_truncate BEFORE TRUNCATE ON app.time_entries FOR EACH STATEMENT EXECUTE FUNCTION app.reject_change();


--
-- Name: time_entries time_entries_period_lock; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER time_entries_period_lock AFTER INSERT OR UPDATE ON app.time_entries FOR EACH ROW EXECUTE FUNCTION app.enforce_period_lock('workday');


--
-- Name: users users_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: vacation_ledger vacation_ledger_append_only; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER vacation_ledger_append_only BEFORE DELETE OR UPDATE ON app.vacation_ledger FOR EACH ROW EXECUTE FUNCTION app.reject_change();


--
-- Name: vacation_ledger vacation_ledger_no_truncate; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER vacation_ledger_no_truncate BEFORE TRUNCATE ON app.vacation_ledger FOR EACH STATEMENT EXECUTE FUNCTION app.reject_change();


--
-- Name: vacation_notices vacation_notices_append_only; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER vacation_notices_append_only BEFORE DELETE ON app.vacation_notices FOR EACH ROW EXECUTE FUNCTION app.reject_change();


--
-- Name: vacation_notices vacation_notices_no_truncate; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER vacation_notices_no_truncate BEFORE TRUNCATE ON app.vacation_notices FOR EACH STATEMENT EXECUTE FUNCTION app.reject_change();


--
-- Name: work_models work_models_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER work_models_set_updated_at BEFORE UPDATE ON app.work_models FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: log log_append_only; Type: TRIGGER; Schema: audit; Owner: -
--

CREATE TRIGGER log_append_only BEFORE DELETE OR UPDATE ON audit.log FOR EACH ROW EXECUTE FUNCTION app.reject_change();


--
-- Name: log log_no_truncate; Type: TRIGGER; Schema: audit; Owner: -
--

CREATE TRIGGER log_no_truncate BEFORE TRUNCATE ON audit.log FOR EACH STATEMENT EXECUTE FUNCTION app.reject_change();


--
-- Name: credentials credentials_set_updated_at; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER credentials_set_updated_at BEFORE UPDATE ON auth.credentials FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: absence_days absence_days_tenant_id_employee_id_absence_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_days
    ADD CONSTRAINT absence_days_tenant_id_employee_id_absence_id_fkey FOREIGN KEY (tenant_id, employee_id, absence_id) REFERENCES app.absence_requests(tenant_id, employee_id, id);


--
-- Name: absence_days absence_days_tenant_id_employee_id_superseded_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_days
    ADD CONSTRAINT absence_days_tenant_id_employee_id_superseded_by_fkey FOREIGN KEY (tenant_id, employee_id, superseded_by) REFERENCES app.absence_requests(tenant_id, employee_id, id);


--
-- Name: absence_days absence_days_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_days
    ADD CONSTRAINT absence_days_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: absence_requests absence_requests_tenant_id_decided_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_requests
    ADD CONSTRAINT absence_requests_tenant_id_decided_by_fkey FOREIGN KEY (tenant_id, decided_by) REFERENCES app.users(tenant_id, id);


--
-- Name: absence_requests absence_requests_tenant_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_requests
    ADD CONSTRAINT absence_requests_tenant_id_employee_id_fkey FOREIGN KEY (tenant_id, employee_id) REFERENCES app.employees(tenant_id, id);


--
-- Name: absence_requests absence_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_requests
    ADD CONSTRAINT absence_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: absence_requests absence_requests_tenant_id_requested_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_requests
    ADD CONSTRAINT absence_requests_tenant_id_requested_by_fkey FOREIGN KEY (tenant_id, requested_by) REFERENCES app.users(tenant_id, id);


--
-- Name: contracts contracts_tenant_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contracts
    ADD CONSTRAINT contracts_tenant_id_employee_id_fkey FOREIGN KEY (tenant_id, employee_id) REFERENCES app.employees(tenant_id, id);


--
-- Name: contracts contracts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contracts
    ADD CONSTRAINT contracts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: contracts contracts_tenant_id_work_model_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.contracts
    ADD CONSTRAINT contracts_tenant_id_work_model_id_fkey FOREIGN KEY (tenant_id, work_model_id) REFERENCES app.work_models(tenant_id, id);


--
-- Name: correction_requests correction_requests_tenant_id_decided_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.correction_requests
    ADD CONSTRAINT correction_requests_tenant_id_decided_by_fkey FOREIGN KEY (tenant_id, decided_by) REFERENCES app.users(tenant_id, id);


--
-- Name: correction_requests correction_requests_tenant_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.correction_requests
    ADD CONSTRAINT correction_requests_tenant_id_employee_id_fkey FOREIGN KEY (tenant_id, employee_id) REFERENCES app.employees(tenant_id, id);


--
-- Name: correction_requests correction_requests_tenant_id_employee_id_target_entry_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.correction_requests
    ADD CONSTRAINT correction_requests_tenant_id_employee_id_target_entry_id_fkey FOREIGN KEY (tenant_id, employee_id, target_entry_id) REFERENCES app.time_entries(tenant_id, employee_id, id);


--
-- Name: correction_requests correction_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.correction_requests
    ADD CONSTRAINT correction_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: correction_requests correction_requests_tenant_id_requested_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.correction_requests
    ADD CONSTRAINT correction_requests_tenant_id_requested_by_fkey FOREIGN KEY (tenant_id, requested_by) REFERENCES app.users(tenant_id, id);


--
-- Name: employees employees_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.employees
    ADD CONSTRAINT employees_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: employees employees_tenant_id_team_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.employees
    ADD CONSTRAINT employees_tenant_id_team_id_fkey FOREIGN KEY (tenant_id, team_id) REFERENCES app.teams(tenant_id, id);


--
-- Name: finding_acks finding_acks_tenant_id_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.finding_acks
    ADD CONSTRAINT finding_acks_tenant_id_created_by_fkey FOREIGN KEY (tenant_id, created_by) REFERENCES app.users(tenant_id, id);


--
-- Name: finding_acks finding_acks_tenant_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.finding_acks
    ADD CONSTRAINT finding_acks_tenant_id_employee_id_fkey FOREIGN KEY (tenant_id, employee_id) REFERENCES app.employees(tenant_id, id);


--
-- Name: finding_acks finding_acks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.finding_acks
    ADD CONSTRAINT finding_acks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: flex_bookings flex_bookings_tenant_id_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.flex_bookings
    ADD CONSTRAINT flex_bookings_tenant_id_created_by_fkey FOREIGN KEY (tenant_id, created_by) REFERENCES app.users(tenant_id, id);


--
-- Name: flex_bookings flex_bookings_tenant_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.flex_bookings
    ADD CONSTRAINT flex_bookings_tenant_id_employee_id_fkey FOREIGN KEY (tenant_id, employee_id) REFERENCES app.employees(tenant_id, id);


--
-- Name: flex_bookings flex_bookings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.flex_bookings
    ADD CONSTRAINT flex_bookings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: flex_bookings flex_bookings_tenant_id_month_closing_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.flex_bookings
    ADD CONSTRAINT flex_bookings_tenant_id_month_closing_id_fkey FOREIGN KEY (tenant_id, month_closing_id) REFERENCES app.month_closings(tenant_id, id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: month_closings month_closings_tenant_id_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.month_closings
    ADD CONSTRAINT month_closings_tenant_id_created_by_fkey FOREIGN KEY (tenant_id, created_by) REFERENCES app.users(tenant_id, id);


--
-- Name: month_closings month_closings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.month_closings
    ADD CONSTRAINT month_closings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: team_leads team_leads_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.team_leads
    ADD CONSTRAINT team_leads_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: team_leads team_leads_tenant_id_team_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.team_leads
    ADD CONSTRAINT team_leads_tenant_id_team_id_fkey FOREIGN KEY (tenant_id, team_id) REFERENCES app.teams(tenant_id, id) ON DELETE CASCADE;


--
-- Name: team_leads team_leads_tenant_id_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.team_leads
    ADD CONSTRAINT team_leads_tenant_id_user_id_fkey FOREIGN KEY (tenant_id, user_id) REFERENCES app.users(tenant_id, id) ON DELETE CASCADE;


--
-- Name: teams teams_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.teams
    ADD CONSTRAINT teams_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: time_entries time_entries_tenant_id_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.time_entries
    ADD CONSTRAINT time_entries_tenant_id_created_by_fkey FOREIGN KEY (tenant_id, created_by) REFERENCES app.users(tenant_id, id);


--
-- Name: time_entries time_entries_tenant_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.time_entries
    ADD CONSTRAINT time_entries_tenant_id_employee_id_fkey FOREIGN KEY (tenant_id, employee_id) REFERENCES app.employees(tenant_id, id);


--
-- Name: time_entries time_entries_tenant_id_employee_id_request_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.time_entries
    ADD CONSTRAINT time_entries_tenant_id_employee_id_request_id_fkey FOREIGN KEY (tenant_id, employee_id, request_id) REFERENCES app.correction_requests(tenant_id, employee_id, id);


--
-- Name: time_entries time_entries_tenant_id_employee_id_voided_by_request_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.time_entries
    ADD CONSTRAINT time_entries_tenant_id_employee_id_voided_by_request_id_fkey FOREIGN KEY (tenant_id, employee_id, voided_by_request_id) REFERENCES app.correction_requests(tenant_id, employee_id, id);


--
-- Name: time_entries time_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.time_entries
    ADD CONSTRAINT time_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: users users_employee_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_employee_fkey FOREIGN KEY (tenant_id, employee_id) REFERENCES app.employees(tenant_id, id);


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: vacation_ledger vacation_ledger_tenant_id_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_ledger
    ADD CONSTRAINT vacation_ledger_tenant_id_created_by_fkey FOREIGN KEY (tenant_id, created_by) REFERENCES app.users(tenant_id, id);


--
-- Name: vacation_ledger vacation_ledger_tenant_id_employee_id_absence_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_ledger
    ADD CONSTRAINT vacation_ledger_tenant_id_employee_id_absence_id_fkey FOREIGN KEY (tenant_id, employee_id, absence_id) REFERENCES app.absence_requests(tenant_id, employee_id, id);


--
-- Name: vacation_ledger vacation_ledger_tenant_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_ledger
    ADD CONSTRAINT vacation_ledger_tenant_id_employee_id_fkey FOREIGN KEY (tenant_id, employee_id) REFERENCES app.employees(tenant_id, id);


--
-- Name: vacation_ledger vacation_ledger_tenant_id_employee_id_notice_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_ledger
    ADD CONSTRAINT vacation_ledger_tenant_id_employee_id_notice_id_fkey FOREIGN KEY (tenant_id, employee_id, notice_id) REFERENCES app.vacation_notices(tenant_id, employee_id, id);


--
-- Name: vacation_ledger vacation_ledger_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_ledger
    ADD CONSTRAINT vacation_ledger_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: vacation_notices vacation_notices_tenant_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_notices
    ADD CONSTRAINT vacation_notices_tenant_id_employee_id_fkey FOREIGN KEY (tenant_id, employee_id) REFERENCES app.employees(tenant_id, id);


--
-- Name: vacation_notices vacation_notices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_notices
    ADD CONSTRAINT vacation_notices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: vacation_notices vacation_notices_tenant_id_sent_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.vacation_notices
    ADD CONSTRAINT vacation_notices_tenant_id_sent_by_fkey FOREIGN KEY (tenant_id, sent_by) REFERENCES app.users(tenant_id, id);


--
-- Name: work_models work_models_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.work_models
    ADD CONSTRAINT work_models_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: credentials credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.credentials
    ADD CONSTRAINT credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: tokens tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.tokens
    ADD CONSTRAINT tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: demo_outbox demo_outbox_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ops; Owner: -
--

ALTER TABLE ONLY ops.demo_outbox
    ADD CONSTRAINT demo_outbox_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: absence_days; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.absence_days ENABLE ROW LEVEL SECURITY;

--
-- Name: absence_requests; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.absence_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: vacation_notices acknowledge own notices; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "acknowledge own notices" ON app.vacation_notices FOR UPDATE TO zeit_app USING (((employee_id = ( SELECT app.employee_id() AS employee_id)) AND (acknowledged_at IS NULL))) WITH CHECK ((employee_id = ( SELECT app.employee_id() AS employee_id)));


--
-- Name: tenants admins change the tenant; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "admins change the tenant" ON app.tenants FOR UPDATE TO zeit_app USING ((( SELECT app.role() AS role) = 'admin'::app.user_role));


--
-- Name: tenants admins create the tenant; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "admins create the tenant" ON app.tenants FOR INSERT TO zeit_app WITH CHECK ((( SELECT app.role() AS role) = 'admin'::app.user_role));


--
-- Name: users admins manage users; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "admins manage users" ON app.users TO zeit_app USING ((( SELECT app.role() AS role) = 'admin'::app.user_role));


--
-- Name: contracts; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: correction_requests; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.correction_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: time_entries end own running entry; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "end own running entry" ON app.time_entries FOR UPDATE TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id))) WITH CHECK (((employee_id = ( SELECT app.employee_id() AS employee_id)) AND (voided_at IS NULL)));


--
-- Name: finding_acks; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.finding_acks ENABLE ROW LEVEL SECURITY;

--
-- Name: flex_bookings; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.flex_bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: contracts hr adds contracts; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr adds contracts" ON app.contracts FOR INSERT TO zeit_app WITH CHECK ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: users hr and admins read all users; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr and admins read all users" ON app.users FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: flex_bookings hr books flex time; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr books flex time" ON app.flex_bookings TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: vacation_ledger hr books vacation; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr books vacation" ON app.vacation_ledger TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: month_closings hr closes, admins reopen; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr closes, admins reopen" ON app.month_closings FOR INSERT TO zeit_app WITH CHECK (((( SELECT app.role() AS role) >= 'hr'::app.user_role) AND ((action = 'close'::app.month_closing_action) OR (( SELECT app.role() AS role) = 'admin'::app.user_role))));


--
-- Name: absence_days hr manages absence days; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages absence days" ON app.absence_days TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: absence_requests hr manages absences; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages absences" ON app.absence_requests TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: correction_requests hr manages corrections; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages corrections" ON app.correction_requests TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: employees hr manages employees; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages employees" ON app.employees TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: time_entries hr manages entries; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages entries" ON app.time_entries TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: finding_acks hr manages finding acks; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages finding acks" ON app.finding_acks TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: team_leads hr manages team leads; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages team leads" ON app.team_leads TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: teams hr manages teams; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages teams" ON app.teams TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: work_models hr manages work models; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages work models" ON app.work_models TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: contracts hr reads contracts; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr reads contracts" ON app.contracts FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: vacation_notices hr reads notices; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr reads notices" ON app.vacation_notices FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: contracts hr removes future contracts; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr removes future contracts" ON app.contracts FOR DELETE TO zeit_app USING (((( SELECT app.role() AS role) >= 'hr'::app.user_role) AND (valid_from > ((now() AT TIME ZONE 'Europe/Berlin'::text))::date)));


--
-- Name: vacation_notices hr sends notices; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr sends notices" ON app.vacation_notices FOR INSERT TO zeit_app WITH CHECK ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: time_entries leads apply corrections; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads apply corrections" ON app.time_entries FOR INSERT TO zeit_app WITH CHECK ((app.leads(employee_id) AND (source = 'correction'::app.entry_source)));


--
-- Name: vacation_ledger leads book their team's vacation; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads book their team's vacation" ON app.vacation_ledger TO zeit_app USING (app.leads(employee_id));


--
-- Name: correction_requests leads decide corrections; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads decide corrections" ON app.correction_requests FOR UPDATE TO zeit_app USING (app.leads(employee_id));


--
-- Name: absence_days leads manage their team's absence days; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads manage their team's absence days" ON app.absence_days TO zeit_app USING (app.leads(employee_id));


--
-- Name: absence_requests leads manage their team's absences; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads manage their team's absences" ON app.absence_requests TO zeit_app USING (app.leads(employee_id));


--
-- Name: finding_acks leads manage their team's finding acks; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads manage their team's finding acks" ON app.finding_acks TO zeit_app USING (app.leads(employee_id));


--
-- Name: employees leads read their team; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads read their team" ON app.employees FOR SELECT TO zeit_app USING (app.leads(id));


--
-- Name: contracts leads read their team's contracts; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads read their team's contracts" ON app.contracts FOR SELECT TO zeit_app USING (app.leads(employee_id));


--
-- Name: correction_requests leads read their team's corrections; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads read their team's corrections" ON app.correction_requests FOR SELECT TO zeit_app USING (app.leads(employee_id));


--
-- Name: time_entries leads read their team's entries; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads read their team's entries" ON app.time_entries FOR SELECT TO zeit_app USING (app.leads(employee_id));


--
-- Name: flex_bookings leads read their team's flex bookings; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads read their team's flex bookings" ON app.flex_bookings FOR SELECT TO zeit_app USING (app.leads(employee_id));


--
-- Name: vacation_notices leads read their team's notices; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads read their team's notices" ON app.vacation_notices FOR SELECT TO zeit_app USING (app.leads(employee_id));


--
-- Name: time_entries leads void entries; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads void entries" ON app.time_entries FOR UPDATE TO zeit_app USING (app.leads(employee_id));


--
-- Name: absence_days manage own absence days; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "manage own absence days" ON app.absence_days TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id)));


--
-- Name: month_closings members read closings; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "members read closings" ON app.month_closings FOR SELECT TO zeit_app USING (true);


--
-- Name: team_leads members read team leads; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "members read team leads" ON app.team_leads FOR SELECT TO zeit_app USING (true);


--
-- Name: teams members read teams; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "members read teams" ON app.teams FOR SELECT TO zeit_app USING (true);


--
-- Name: tenants members read their tenant; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "members read their tenant" ON app.tenants FOR SELECT TO zeit_app USING (true);


--
-- Name: work_models members read work models; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "members read work models" ON app.work_models FOR SELECT TO zeit_app USING (true);


--
-- Name: month_closings; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.month_closings ENABLE ROW LEVEL SECURITY;

--
-- Name: absence_requests read own absences; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "read own absences" ON app.absence_requests FOR SELECT TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id)));


--
-- Name: contracts read own contracts; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "read own contracts" ON app.contracts FOR SELECT TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id)));


--
-- Name: correction_requests read own corrections; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "read own corrections" ON app.correction_requests FOR SELECT TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id)));


--
-- Name: employees read own employee; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "read own employee" ON app.employees FOR SELECT TO zeit_app USING ((id = ( SELECT app.employee_id() AS employee_id)));


--
-- Name: time_entries read own entries; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "read own entries" ON app.time_entries FOR SELECT TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id)));


--
-- Name: finding_acks read own finding acks; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "read own finding acks" ON app.finding_acks FOR SELECT TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id)));


--
-- Name: flex_bookings read own flex bookings; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "read own flex bookings" ON app.flex_bookings FOR SELECT TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id)));


--
-- Name: vacation_ledger read own ledger; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "read own ledger" ON app.vacation_ledger FOR SELECT TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id)));


--
-- Name: vacation_notices read own notices; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "read own notices" ON app.vacation_notices FOR SELECT TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id)));


--
-- Name: users read own user; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "read own user" ON app.users FOR SELECT TO zeit_app USING ((id = ( SELECT app.user_id() AS user_id)));


--
-- Name: absence_requests request own absences; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "request own absences" ON app.absence_requests FOR INSERT TO zeit_app WITH CHECK (((employee_id = ( SELECT app.employee_id() AS employee_id)) AND (requested_by = ( SELECT app.user_id() AS user_id)) AND ((status = 'pending'::app.absence_status) OR (type = 'sick'::app.absence_type))));


--
-- Name: correction_requests request own corrections; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "request own corrections" ON app.correction_requests FOR INSERT TO zeit_app WITH CHECK (((employee_id = ( SELECT app.employee_id() AS employee_id)) AND (requested_by = ( SELECT app.user_id() AS user_id)) AND (status = 'pending'::app.correction_status)));


--
-- Name: time_entries stamp own entries; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "stamp own entries" ON app.time_entries FOR INSERT TO zeit_app WITH CHECK (((employee_id = ( SELECT app.employee_id() AS employee_id)) AND (source = 'clock'::app.entry_source)));


--
-- Name: team_leads; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.team_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: absence_days tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.absence_days AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: absence_requests tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.absence_requests AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: contracts tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.contracts AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: correction_requests tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.correction_requests AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: employees tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.employees AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: finding_acks tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.finding_acks AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: flex_bookings tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.flex_bookings AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: month_closings tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.month_closings AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: team_leads tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.team_leads AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: teams tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.teams AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: tenants tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.tenants AS RESTRICTIVE TO zeit_app USING ((id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: time_entries tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.time_entries AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: users tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.users AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: vacation_ledger tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.vacation_ledger AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: vacation_notices tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.vacation_notices AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: work_models tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.work_models AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: tenants; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: time_entries; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.time_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: users update own user; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "update own user" ON app.users FOR UPDATE TO zeit_app USING ((id = ( SELECT app.user_id() AS user_id))) WITH CHECK (((id = ( SELECT app.user_id() AS user_id)) AND (role = ( SELECT app.role() AS role)) AND (NOT (employee_id IS DISTINCT FROM ( SELECT app.employee_id() AS employee_id)))));


--
-- Name: users; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;

--
-- Name: vacation_ledger; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.vacation_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: vacation_notices; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.vacation_notices ENABLE ROW LEVEL SECURITY;

--
-- Name: absence_requests withdraw or cancel own absences; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "withdraw or cancel own absences" ON app.absence_requests FOR UPDATE TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id))) WITH CHECK (((employee_id = ( SELECT app.employee_id() AS employee_id)) AND (status = ANY (ARRAY['withdrawn'::app.absence_status, 'cancel_pending'::app.absence_status]))));


--
-- Name: correction_requests withdraw own corrections; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "withdraw own corrections" ON app.correction_requests FOR UPDATE TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id))) WITH CHECK (((employee_id = ( SELECT app.employee_id() AS employee_id)) AND (status = 'withdrawn'::app.correction_status)));


--
-- Name: work_models; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.work_models ENABLE ROW LEVEL SECURITY;

--
-- Name: log append app events; Type: POLICY; Schema: audit; Owner: -
--

CREATE POLICY "append app events" ON audit.log FOR INSERT TO zeit_app WITH CHECK (((source = 'app'::text) AND (NOT (actor_user_id IS DISTINCT FROM ( SELECT app.user_id() AS user_id))) AND (NOT (actor_role IS DISTINCT FROM ( SELECT app.role() AS role)))));


--
-- Name: log hr and admins read the trail; Type: POLICY; Schema: audit; Owner: -
--

CREATE POLICY "hr and admins read the trail" ON audit.log FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: log; Type: ROW SECURITY; Schema: audit; Owner: -
--

ALTER TABLE audit.log ENABLE ROW LEVEL SECURITY;

--
-- Name: log read own trail; Type: POLICY; Schema: audit; Owner: -
--

CREATE POLICY "read own trail" ON audit.log FOR SELECT TO zeit_app USING (((subject_employee_id = ( SELECT app.employee_id() AS employee_id)) OR (actor_user_id = ( SELECT app.user_id() AS user_id))));


--
-- Name: log tenant fence; Type: POLICY; Schema: audit; Owner: -
--

CREATE POLICY "tenant fence" ON audit.log AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20260923000000'),
    ('20260924000000'),
    ('20260924000100'),
    ('20260924000200'),
    ('20260924000300'),
    ('20260924000400');
