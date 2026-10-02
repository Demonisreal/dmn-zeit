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
-- Name: invoice_format; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.invoice_format AS ENUM (
    'pdf',
    'zugferd',
    'xrechnung'
);


--
-- Name: invoice_kind; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.invoice_kind AS ENUM (
    'invoice',
    'cancellation'
);


--
-- Name: invoice_line_kind; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.invoice_line_kind AS ENUM (
    'time',
    'item'
);


--
-- Name: invoice_status; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.invoice_status AS ENUM (
    'draft',
    'issued',
    'paid',
    'cancelled'
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
-- Name: project_entry_source; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.project_entry_source AS ENUM (
    'timer',
    'manual',
    'seed'
);


--
-- Name: rounding_mode; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.rounding_mode AS ENUM (
    'up',
    'nearest',
    'down'
);


--
-- Name: tax_category; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.tax_category AS ENUM (
    'standard',
    'reduced',
    'exempt',
    'reverse_charge',
    'outside_scope',
    'small_business'
);


--
-- Name: tax_profile; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.tax_profile AS ENUM (
    'regular',
    'small_business'
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
-- Name: workspace_kind; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.workspace_kind AS ENUM (
    'company',
    'solo'
);


--
-- Name: token_kind; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.token_kind AS ENUM (
    'invite',
    'password_reset'
);


--
-- Name: webauthn_purpose; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.webauthn_purpose AS ENUM (
    'register',
    'login',
    'reauth'
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
  perform pg_advisory_xact_lock(hashtextextended('month_closings ' || new.tenant_id::text, 0));

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
-- Name: bookable(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.bookable(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
      from app.projects p
     where p.id = p_project_id
       and p.tenant_id = app.tenant_id()
       and p.archived_at is null
       and (p.open_to_all or exists (
         select 1
           from app.project_members m
          where m.project_id = p.id
            and m.employee_id = app.employee_id()
       ))
  )
$$;


--
-- Name: bookable_projects(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.bookable_projects() RETURNS TABLE(id uuid, project_name text, client_name text, billable boolean, rounding_increment_min smallint, rounding_mode app.rounding_mode, tasks jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p.id, p.name, c.name, p.billable, p.rounding_increment_min, p.rounding_mode,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'billable', t.billable) order by t.name)
             from app.tasks t
            where t.project_id = p.id
              and t.archived_at is null
         ), '[]')
    from app.projects p
    join app.clients c on c.id = p.client_id
   where p.tenant_id = app.tenant_id()
     and app.bookable(p.id)
   order by c.name, p.name;
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
-- Name: display_names(uuid[]); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.display_names(p_ids uuid[]) RETURNS TABLE(id uuid, display_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u.id, u.display_name
    from app.users u
   where u.id = any (p_ids)
     and u.tenant_id = app.tenant_id();
$$;


--
-- Name: employee_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.employee_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    AS $$
  select nullif(pg_catalog.current_setting('app.employee_id', true), '')::pg_catalog.uuid
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
-- Name: flex_checkpoint(uuid, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.flex_checkpoint(p_employee_id uuid, p_year integer) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  minutes integer;
begin
  if (p_employee_id = app.employee_id() or app.leads(p_employee_id) or app.role() >= 'hr') is not true then
    raise exception 'employee % is not visible', p_employee_id using errcode = 'insufficient_privilege';
  end if;

  select case when c.action = 'close' then
           (c.snapshot -> 'employees' -> p_employee_id::text ->> 'flexBalanceMinutes')::integer
         end
    into minutes
    from app.month_closings c
   where c.tenant_id = app.tenant_id()
     and c.month = make_date(p_year - 1, 12, 1)
   order by c.created_at desc
   limit 1;

  return minutes;
end;
$$;


--
-- Name: guard_billing_profile(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_billing_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  movable constant text[] := array['tax_profile', 'previous_year_revenue_cents', 'updated_at'];
begin
  if not exists (
    select 1 from app.tenants t where t.id in (new.tenant_id, old.tenant_id) and t.kind = 'sandbox'
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if exists (select 1 from app.billing_profiles p where p.tenant_id = new.tenant_id) then
      return new;
    end if;
    raise exception 'sandbox % only has the billing profile of its seed', new.tenant_id
      using errcode = 'insufficient_privilege';
  end if;

  if to_jsonb(new) - movable <> to_jsonb(old) - movable then
    raise exception 'a sandbox only switches tax profile and previous year revenue of its billing profile'
      using errcode = 'ZT002';
  end if;

  return new;
end;
$$;


--
-- Name: guard_invoice(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_invoice() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  movable constant text[] := array[
    'status', 'paid_on', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at', 'retain_until'
  ];
begin
  if tg_op = 'DELETE' then
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true)
      and current_user in ('zeit_system', 'zeit_owner') then
      return old;
    end if;
    if old.status = 'draft' then
      return old;
    end if;
    raise exception 'invoice % is %, only drafts are deleted', old.id, old.status using errcode = 'ZT002';
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  if to_jsonb(new) - movable <> to_jsonb(old) - movable then
    raise exception 'an issued invoice is fixed outside status, payment and cancellation' using errcode = 'ZT002';
  end if;

  if new.status is distinct from old.status
    and old.status::text || '>' || new.status::text <> all (
      array['issued>paid', 'paid>issued', 'issued>cancelled', 'paid>cancelled']
    )
  then
    raise exception 'invoice % cannot go from % to %', old.id, old.status, new.status using errcode = 'ZT003';
  end if;

  if new.status = 'cancelled' and not exists (
    select 1 from app.invoices c
     where c.tenant_id = new.tenant_id and c.refers_to_id = new.id and c.status <> 'draft'
  ) then
    raise exception 'invoice % has no issued cancellation yet', new.id using errcode = 'ZT003';
  end if;

  if (new.cancelled_at, new.cancelled_by, new.cancel_reason)
    is distinct from (old.cancelled_at, old.cancelled_by, old.cancel_reason)
    and (new.status <> 'cancelled' or old.status = 'cancelled')
  then
    raise exception 'invoice % gets its cancellation details from app.invoice_cancel only', old.id using errcode = 'ZT002';
  end if;

  if new.paid_on is distinct from old.paid_on then
    if old.status::text || '>' || new.status::text not in ('issued>paid', 'paid>issued') then
      raise exception 'paid_on of invoice % only moves with its payment status', old.id using errcode = 'ZT002';
    end if;
    if new.paid_on > (now() at time zone 'Europe/Berlin')::date then
      raise exception 'invoice % cannot be paid in the future', old.id using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: guard_invoice_child(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_invoice_child() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  held app.invoice_status;
  target record;
begin
  if tg_op <> 'INSERT' then
    select i.status into held
      from app.invoices i
     where i.tenant_id = old.tenant_id and i.id = old.invoice_id
       for share;
    if held <> 'draft' then
      raise exception '% belongs to an issued invoice', tg_table_name using errcode = 'ZT002';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  select i.status, i.kind, i.tax_profile, i.tax_treatment into target
    from app.invoices i
   where i.tenant_id = new.tenant_id and i.id = new.invoice_id
     for share;

  if found and target.status <> 'draft' then
    raise exception '% belongs to an issued invoice', tg_table_name using errcode = 'ZT002';
  end if;

  if tg_table_name = 'invoice_lines' then
    if target.tax_profile = 'small_business' and new.tax_category <> 'small_business' then
      raise exception 'a small-business invoice only takes small_business lines' using errcode = 'check_violation';
    elsif target.tax_profile = 'regular' and new.tax_category = 'small_business' then
      raise exception 'a regular invoice cannot take a small_business line' using errcode = 'check_violation';
    end if;

    if target.tax_treatment is not null and new.tax_category <> all (
      case when target.tax_treatment = 'standard'
        then array['standard', 'reduced', 'exempt']::app.tax_category[]
        else array[target.tax_treatment]
      end
    ) then
      raise exception 'a % invoice cannot take a % line', target.tax_treatment, new.tax_category
        using errcode = 'check_violation';
    end if;

    if target.kind = 'invoice' and new.tax_category = 'exempt' and new.exemption_reason is null then
      raise exception 'an exempt line needs an exemption reason' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: guard_invoice_document(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_invoice_document() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  new.sha256 := sha256(new.content);
  if not exists (
    select 1 from app.invoices i
     where i.tenant_id = new.tenant_id and i.id = new.invoice_id and i.status <> 'draft'
  ) then
    raise exception 'a document only attaches to an issued invoice' using errcode = 'ZT003';
  end if;
  return new;
end;
$$;


--
-- Name: guard_own_user(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_own_user() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  own constant text[] := array['display_name', 'locale', 'updated_at', 'last_login_at'];
begin
  if new.id = app.user_id()
    and to_jsonb(new) - own <> to_jsonb(old) - own
    and not (
      current_user = 'zeit_system'
      and old.status = 'invited'
      and new.status = 'active'
      and to_jsonb(new) - own - 'status' = to_jsonb(old) - own - 'status'
    )
  then
    raise exception 'only display name and locale can be changed on one''s own user'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;


--
-- Name: guard_project_entry(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_project_entry() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  bookkeeping constant text[] := array['updated_at', 'workday'];
  running constant text[] := array['ended_at', 'note', 'voided_at'];
begin
  if tg_op = 'DELETE' then
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true)
      and current_user in ('zeit_system', 'zeit_owner') then
      return old;
    end if;
    raise exception 'project entries are voided, never deleted' using errcode = 'ZT002';
  end if;

  if (tg_op = 'INSERT' and new.source = 'timer' and (new.started_at <> now() or new.ended_at is not null))
    or (tg_op = 'UPDATE' and old.ended_at is null
      and new.ended_at is distinct from old.ended_at and new.ended_at <> now())
  then
    raise exception 'timer entries start and end at now()' using errcode = 'check_violation';
  end if;

  if new.ended_at is not null and new.ended_at > now()
    and (tg_op = 'INSERT' or new.ended_at is distinct from old.ended_at)
  then
    raise exception 'a project entry cannot end in the future' using errcode = 'check_violation';
  end if;

  if new.source <> 'timer' and new.ended_at is not null and new.ended_at - new.started_at > interval '24 hours' then
    raise exception 'a manual or seeded entry cannot span more than 24 hours' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and old.source = 'timer' and new.source = old.source and old.ended_at is not null
    and (new.started_at is distinct from old.started_at or new.ended_at is distinct from old.ended_at)
  then
    new.source := 'manual';
  end if;

  if (
    (tg_op = 'INSERT' and new.billable is not null)
    or (tg_op = 'UPDATE' and new.billable is distinct from old.billable)
  ) and (app.role() >= 'hr') is not true then
    raise exception 'only hr sets whether a project entry is billable' using errcode = 'insufficient_privilege';
  end if;

  if (tg_op = 'INSERT' or new.project_id is distinct from old.project_id)
    and (app.role() >= 'hr') is not true
    and not app.bookable(new.project_id)
  then
    raise exception 'project % is not open for booking', new.project_id using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.invoice_id is distinct from old.invoice_id and (app.role() >= 'hr') is not true then
    raise exception 'only hr puts project entries on an invoice' using errcode = 'insufficient_privilege';
  end if;

  if old.invoice_id is not null
    and to_jsonb(new) - bookkeeping - 'invoice_id' <> to_jsonb(old) - bookkeeping - 'invoice_id' then
    raise exception 'project entry % is invoiced', old.id using errcode = 'ZT004';
  end if;

  if (new.id, new.tenant_id, new.employee_id, new.created_by, new.created_at)
    is distinct from (old.id, old.tenant_id, old.employee_id, old.created_by, old.created_at) then
    raise exception 'owner and origin of a project entry stay fixed' using errcode = 'ZT002';
  end if;

  if new.source is distinct from old.source and not (old.source = 'timer' and new.source = 'manual') then
    raise exception 'a project entry cannot change how it was booked' using errcode = 'ZT002';
  end if;

  if old.voided_at is not null and to_jsonb(new) - bookkeeping <> to_jsonb(old) - bookkeeping then
    raise exception 'a voided project entry stays as it is' using errcode = 'ZT002';
  end if;

  if old.ended_at is null and to_jsonb(new) - bookkeeping - running <> to_jsonb(old) - bookkeeping - running then
    raise exception 'a running project entry can only be stopped, noted or voided' using errcode = 'ZT002';
  end if;

  return new;
end;
$$;


--
-- Name: guard_project_entry_invoice(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_project_entry_invoice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  held app.invoice_status;
  target record;
begin
  if tg_op = 'UPDATE' and new.invoice_id is not distinct from old.invoice_id then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.invoice_id is not null then
    select i.status into held
      from app.invoices i
     where i.tenant_id = old.tenant_id and i.id = old.invoice_id
       for share;
    if held in ('issued', 'paid') then
      raise exception 'project entry % is invoiced', old.id using errcode = 'ZT004';
    end if;
  end if;

  if new.invoice_id is not null then
    select i.status, i.client_id into target
      from app.invoices i
     where i.tenant_id = new.tenant_id and i.id = new.invoice_id
       for share;
    if target.status is distinct from 'draft' then
      raise exception 'invoice % is not an open draft', new.invoice_id using errcode = 'ZT003';
    end if;
    if not exists (
      select 1 from app.projects p
       where p.tenant_id = new.tenant_id and p.id = new.project_id and p.client_id = target.client_id
    ) then
      raise exception 'project entry % is not for the client of invoice %', new.id, new.invoice_id
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
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

  if exists (
    select 1
      from app.users u
     where u.employee_id = new.employee_id
       and u.id in (new.decided_by, (to_jsonb(new) ->> 'certificate_confirmed_by')::uuid)
  ) then
    raise exception 'nobody decides on their own %', tg_table_name using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;


--
-- Name: guard_solo_members(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_solo_members() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: guard_tenant_delete(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_tenant_delete() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if old.kind <> 'sandbox' then
    raise exception 'tenant % is %, only sandboxes are deleted', old.id, old.kind using errcode = 'ZT002';
  end if;
  return old;
end;
$$;


--
-- Name: guard_tenant_retention(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.guard_tenant_retention() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if old.kind = 'live' and exists (
    select 1 from app.invoices i
     where i.tenant_id = old.id and i.status <> 'draft' and i.retain_until >= current_date
  ) then
    raise exception 'tenant % still keeps invoices under the retention period' , old.id using errcode = 'ZT002';
  end if;
  return old;
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
  fillable constant text[] := array['ended_at', 'end_reason', 'voided_at', 'voided_by_request_id', 'workday'];
begin
  if tg_op = 'DELETE' then
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true)
      and current_user in ('zeit_system', 'zeit_owner') then
      return old;
    end if;
    raise exception 'time entries are voided, never deleted' using errcode = 'ZT002';
  end if;

  if new.source = 'clock' and (
    (tg_op = 'INSERT' and (new.started_at <> now() or new.ended_at is not null))
    or (tg_op = 'UPDATE' and new.ended_at is distinct from old.ended_at and new.ended_at <> now())
  ) then
    raise exception 'clock entries start and end at now()' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and (
    to_jsonb(new) - fillable <> to_jsonb(old) - fillable
    or (old.ended_at is not null
      and (new.ended_at, new.end_reason) is distinct from (old.ended_at, old.end_reason)
      and (new.ended_at, old.end_reason, new.end_reason)
        is distinct from (old.ended_at, 'break'::app.end_reason, 'leave'::app.end_reason))
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: invoices; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    kind app.invoice_kind DEFAULT 'invoice'::app.invoice_kind NOT NULL,
    status app.invoice_status DEFAULT 'draft'::app.invoice_status NOT NULL,
    client_id uuid NOT NULL,
    refers_to_id uuid,
    number text,
    number_year smallint,
    number_seq integer,
    issue_date date,
    due_date date,
    service_from date NOT NULL,
    service_to date NOT NULL,
    payment_terms_days smallint NOT NULL,
    locale text DEFAULT 'de'::text NOT NULL,
    format app.invoice_format NOT NULL,
    tax_profile app.tax_profile NOT NULL,
    specimen boolean DEFAULT false NOT NULL,
    seller jsonb,
    buyer jsonb,
    intro_text text,
    closing_text text,
    net_cents bigint DEFAULT 0 NOT NULL,
    tax_cents bigint DEFAULT 0 NOT NULL,
    gross_cents bigint DEFAULT 0 NOT NULL,
    paid_on date,
    cancel_reason text,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    issued_at timestamp with time zone,
    issued_by uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    retain_until date GENERATED ALWAYS AS (make_date(((number_year)::integer + 8), 12, 31)) STORED,
    tax_treatment app.tax_category,
    CONSTRAINT invoices_cancellation_unpaid CHECK (((kind = 'invoice'::app.invoice_kind) OR (status <> 'paid'::app.invoice_status))),
    CONSTRAINT invoices_cancelled_at_status CHECK (((status = 'cancelled'::app.invoice_status) = (cancelled_at IS NOT NULL))),
    CONSTRAINT invoices_check CHECK (((status = 'draft'::app.invoice_status) = (number IS NULL))),
    CONSTRAINT invoices_check1 CHECK (((status = 'draft'::app.invoice_status) = (issue_date IS NULL))),
    CONSTRAINT invoices_check2 CHECK (((status = 'draft'::app.invoice_status) = (due_date IS NULL))),
    CONSTRAINT invoices_check3 CHECK (((status = 'draft'::app.invoice_status) = (issued_at IS NULL))),
    CONSTRAINT invoices_check4 CHECK (((kind = 'invoice'::app.invoice_kind) = (refers_to_id IS NULL))),
    CONSTRAINT invoices_check5 CHECK ((service_to >= service_from)),
    CONSTRAINT invoices_check6 CHECK (((status <> 'paid'::app.invoice_status) OR (paid_on IS NOT NULL))),
    CONSTRAINT invoices_check7 CHECK (((kind <> 'cancellation'::app.invoice_kind) OR (status <> 'cancelled'::app.invoice_status))),
    CONSTRAINT invoices_check8 CHECK (((cancelled_at IS NULL) = (cancelled_by IS NULL))),
    CONSTRAINT invoices_check9 CHECK (((cancelled_at IS NULL) OR (cancel_reason IS NOT NULL))),
    CONSTRAINT invoices_locale_check CHECK ((locale = ANY (ARRAY['de'::text, 'en'::text]))),
    CONSTRAINT invoices_paid_on_status CHECK (((paid_on IS NULL) OR (status = ANY (ARRAY['paid'::app.invoice_status, 'cancelled'::app.invoice_status])))),
    CONSTRAINT invoices_tax_treatment CHECK (((tax_treatment = ANY (ARRAY['standard'::app.tax_category, 'reverse_charge'::app.tax_category, 'outside_scope'::app.tax_category, 'small_business'::app.tax_category])) AND ((tax_treatment = 'small_business'::app.tax_category) = (tax_profile = 'small_business'::app.tax_profile))))
);

ALTER TABLE ONLY app.invoices FORCE ROW LEVEL SECURITY;


--
-- Name: invoice_cancel(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.invoice_cancel(p_invoice_id uuid, p_reason text) RETURNS app.invoices
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  original app.invoices;
  cancellation app.invoices;
  cancellation_id uuid;
  new_line_id uuid;
  src app.invoice_lines;
begin
  if (app.role() >= 'hr') is not true then
    raise exception 'only hr and admins cancel invoices' using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(p_reason)) < 10 then
    raise exception 'a cancellation needs a reason of at least 10 characters' using errcode = 'check_violation';
  end if;

  select * into original from app.invoices i where i.id = p_invoice_id and i.tenant_id = app.tenant_id() for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'ZT003';
  end if;
  if original.kind = 'cancellation' then
    raise exception 'a cancellation cannot itself be cancelled' using errcode = 'ZT003';
  end if;
  if original.status not in ('issued', 'paid') then
    raise exception 'invoice % is % and cannot be cancelled', p_invoice_id, original.status using errcode = 'ZT003';
  end if;
  if exists (select 1 from app.invoices c where c.tenant_id = app.tenant_id() and c.refers_to_id = original.id) then
    raise exception 'invoice % is already cancelled', p_invoice_id using errcode = 'ZT003';
  end if;

  insert into app.invoices (
    tenant_id, kind, client_id, refers_to_id, service_from, service_to, payment_terms_days,
    locale, format, tax_profile, tax_treatment, created_by
  ) values (
    original.tenant_id, 'cancellation', original.client_id, original.id, original.service_from,
    original.service_to, original.payment_terms_days, original.locale, original.format,
    original.tax_profile, original.tax_treatment, app.user_id()
  ) returning id into cancellation_id;

  for src in select * from app.invoice_lines where tenant_id = original.tenant_id and invoice_id = original.id
  loop
    insert into app.invoice_lines (
      tenant_id, invoice_id, client_id, position, kind, project_id, task_id, description,
      service_from, service_to, minutes, quantity_milli, unit, unit_price_cents, net_cents,
      tax_category, tax_rate_bp, exemption_reason, derivation
    ) values (
      src.tenant_id, cancellation_id, src.client_id, src.position, src.kind, src.project_id,
      src.task_id, src.description, src.service_from, src.service_to,
      case when src.minutes is null then null else 0 - src.minutes end,
      case when src.quantity_milli is null then null else 0 - src.quantity_milli end,
      src.unit, src.unit_price_cents, 0 - src.net_cents, src.tax_category, src.tax_rate_bp,
      src.exemption_reason, src.derivation
    ) returning id into new_line_id;

    insert into app.invoice_line_entries (tenant_id, invoice_id, line_id, entry_id)
    select tenant_id, cancellation_id, new_line_id, entry_id
      from app.invoice_line_entries
     where tenant_id = original.tenant_id and invoice_id = original.id and line_id = src.id;
  end loop;

  cancellation := app.issue_invoice(cancellation_id);

  update app.invoices set status = 'cancelled', cancelled_at = now(), cancelled_by = app.user_id(), cancel_reason = p_reason
   where id = original.id and tenant_id = original.tenant_id;

  update app.project_entries set invoice_id = null
   where tenant_id = original.tenant_id and invoice_id = original.id;

  return cancellation;
end;
$$;


--
-- Name: issue_invoice(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.issue_invoice(p_invoice_id uuid) RETURNS app.invoices
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  draft app.invoices;
  client app.clients;
  profile app.billing_profiles;
  tenant_kind app.tenant_kind;
  today date := (now() at time zone 'Europe/Berlin')::date;
  year_num smallint := extract(year from (now() at time zone 'Europe/Berlin'))::smallint;
  prefix text;
  seq integer;
  net_total bigint;
  tax_total bigint;
  reverse_charge boolean;
  v_seller jsonb;
  v_buyer jsonb;
begin
  if (app.role() >= 'hr') is not true then
    raise exception 'only hr and admins issue invoices' using errcode = 'insufficient_privilege';
  end if;

  select * into draft from app.invoices i where i.id = p_invoice_id and i.tenant_id = app.tenant_id() for update;
  if not found or draft.status <> 'draft' then
    raise exception 'invoice % is not an open draft', p_invoice_id using errcode = 'ZT003';
  end if;

  if draft.kind = 'invoice' and (
    select count(*) from app.invoice_line_entries e where e.tenant_id = draft.tenant_id and e.invoice_id = draft.id
  ) > 5000 then
    raise exception 'invoice % bills more than 5000 project entries', p_invoice_id using errcode = 'check_violation';
  end if;

  select t.kind into tenant_kind from app.tenants t where t.id = app.tenant_id();

  if tenant_kind = 'sandbox' and draft.kind = 'invoice' and (
    select count(*) from app.invoices i where i.tenant_id = app.tenant_id() and i.status <> 'draft'
  ) >= 30 then
    raise exception 'sandbox % has issued enough invoices for a demo', app.tenant_id() using errcode = 'ZT005';
  end if;

  select coalesce(sum(g.net_cents), 0), coalesce(sum(app.percent_of(g.net_cents::bigint, g.tax_rate_bp::integer)), 0),
         coalesce(bool_or(g.reverse_charge), false)
    into net_total, tax_total, reverse_charge
    from (
      select tax_rate_bp, sum(net_cents) as net_cents, bool_or(tax_category = 'reverse_charge') as reverse_charge
        from app.invoice_lines
       where tenant_id = app.tenant_id() and invoice_id = draft.id
       group by tax_rate_bp
    ) g;

  if draft.kind = 'invoice' and net_total + tax_total <= 0 then
    raise exception 'invoice % has no positive total', p_invoice_id using errcode = 'ZT003';
  end if;

  if draft.tax_treatment is not null and exists (
    select 1 from app.invoice_lines l
     where l.tenant_id = draft.tenant_id and l.invoice_id = draft.id
       and l.tax_category <> all (
         case when draft.tax_treatment = 'standard'
           then array['standard', 'reduced', 'exempt']::app.tax_category[]
           else array[draft.tax_treatment]
         end
       )
  ) then
    raise exception 'invoice % has lines outside its % treatment', p_invoice_id, draft.tax_treatment
      using errcode = 'check_violation';
  end if;

  select * into profile from app.billing_profiles p where p.tenant_id = app.tenant_id();
  if not found and tenant_kind <> 'sandbox' then
    raise exception 'tenant % has no billing profile yet', app.tenant_id() using errcode = 'ZT003';
  end if;
  prefix := case when tenant_kind = 'sandbox' then 'MUSTER-' else profile.invoice_prefix end;

  if draft.kind = 'invoice' and tenant_kind = 'live' and draft.tax_profile is distinct from profile.tax_profile then
    raise exception 'invoice % was drafted as %, the billing profile is % by now, refresh the draft first',
      p_invoice_id, draft.tax_profile, profile.tax_profile using errcode = 'ZT003';
  end if;

  if draft.kind = 'cancellation' then
    select o.seller - 'taxProfile', o.buyer into v_seller, v_buyer
      from app.invoices o
     where o.tenant_id = draft.tenant_id and o.id = draft.refers_to_id;
  else
    if profile.tenant_id is null then
      v_seller := jsonb_build_object(
        'legalName', 'Musterbetrieb Mira Beispiel', 'street', 'Musterstraße 1', 'postalCode', '10115',
        'city', 'Berlin', 'countryCode', 'DE', 'taxNumber', '000/000/00000', 'vatId', 'DE000000000',
        'iban', 'DE00500105170648489890', 'bic', 'MUSTERDEXXX', 'bankName', 'Musterbank',
        'contactName', 'Mira Beispiel', 'contactEmail', 'rechnung@musterbetrieb.example.test',
        'contactPhone', '030 000000', 'registerCourt', null, 'registerNumber', null
      );
    else
      v_seller := jsonb_build_object(
        'legalName', profile.legal_name, 'street', profile.street, 'postalCode', profile.postal_code,
        'city', profile.city, 'countryCode', profile.country_code, 'taxNumber', profile.tax_number,
        'vatId', profile.vat_id, 'iban', profile.iban, 'bic', profile.bic, 'bankName', profile.bank_name,
        'contactName', profile.contact_name, 'contactEmail', profile.contact_email,
        'contactPhone', profile.contact_phone, 'registerCourt', profile.register_court,
        'registerNumber', profile.register_number
      );
    end if;

    select * into client from app.clients c where c.tenant_id = app.tenant_id() and c.id = draft.client_id;

    if (draft.tax_treatment = 'reverse_charge'
        and (client.vat_id is null or client.country_code = 'DE' or not client.is_business))
      or (draft.tax_treatment = 'outside_scope' and client.country_code = 'DE') then
      raise exception 'invoice % was drafted as %, its client no longer fits that, refresh the draft first',
        p_invoice_id, draft.tax_treatment using errcode = 'ZT003';
    end if;

    v_buyer := jsonb_build_object(
      'name', client.name, 'street', client.street, 'postalCode', client.postal_code,
      'city', client.city, 'countryCode', client.country_code, 'isBusiness', client.is_business,
      'vatId', client.vat_id, 'email', client.email, 'buyerReference', client.buyer_reference,
      'number', client.number
    );

    if exists (
      select 1 from unnest(array['street', 'postalCode', 'city']) k where coalesce(btrim(v_seller ->> k), '') = ''
    ) then
      raise exception 'the seller address on invoice % is incomplete', p_invoice_id using errcode = 'ZT006';
    end if;

    if (reverse_charge or net_total + tax_total > 25000) and exists (
      select 1 from unnest(array['street', 'postalCode', 'city']) k where coalesce(btrim(v_buyer ->> k), '') = ''
    ) then
      raise exception 'the buyer address on invoice % is incomplete', p_invoice_id using errcode = 'ZT006';
    end if;
  end if;

  insert into app.invoice_counters as c (tenant_id, year, last_seq)
  values (app.tenant_id(), year_num, 1)
  on conflict (tenant_id, year) do update set last_seq = c.last_seq + 1
  returning c.last_seq into seq;

  update app.invoices i set
    status = 'issued',
    number = coalesce(nullif(rtrim(prefix, '-'), '') || '-', '') || year_num || '-'
      || (case when seq < 10000 then lpad(seq::text, 4, '0') else seq::text end),
    number_year = year_num,
    number_seq = seq,
    issue_date = today,
    due_date = today + i.payment_terms_days,
    net_cents = net_total,
    tax_cents = tax_total,
    gross_cents = net_total + tax_total,
    seller = v_seller,
    buyer = v_buyer,
    specimen = (tenant_kind = 'sandbox'),
    issued_at = now(),
    issued_by = app.user_id()
   where i.id = p_invoice_id and i.tenant_id = app.tenant_id() and i.status = 'draft'
  returning i.* into draft;

  if not found then
    raise exception 'invoice % is not an open draft', p_invoice_id using errcode = 'ZT003';
  end if;

  return draft;
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
-- Name: mark_specimen(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.mark_specimen() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  new.specimen := exists (select 1 from app.tenants t where t.id = new.tenant_id and t.kind = 'sandbox');
  return new;
end;
$$;


--
-- Name: month_snapshot(uuid, date); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.month_snapshot(p_employee_id uuid, p_month date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  figures jsonb;
begin
  if (p_employee_id = app.employee_id() or app.leads(p_employee_id) or app.role() >= 'hr') is not true then
    raise exception 'employee % is not visible', p_employee_id using errcode = 'insufficient_privilege';
  end if;

  select case when c.action = 'close' then c.snapshot -> 'employees' -> p_employee_id::text end
    into figures
    from app.month_closings c
   where c.tenant_id = app.tenant_id()
     and c.month = date_trunc('month', p_month)::date
   order by c.created_at desc
   limit 1;

  return figures;
end;
$$;


--
-- Name: percent_of(bigint, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.percent_of(cents bigint, basis_points integer) RETURNS bigint
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select app.round_div(cents * basis_points, 10000);
$$;


--
-- Name: project_budget_status(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.project_budget_status(p_project_id uuid) RETURNS TABLE(budget_minutes integer, used_minutes integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p.budget_minutes,
         coalesce((
           select sum(round(extract(epoch from (e.ended_at - e.started_at)) / 60))::integer
             from app.project_entries e
             left join app.tasks t on t.id = e.task_id
            where e.project_id = p.id
              and e.ended_at is not null
              and e.voided_at is null
              and coalesce(e.billable, t.billable, p.billable)
         ), 0)
    from app.projects p
   where p.id = p_project_id
     and p.tenant_id = app.tenant_id()
     and app.employee_id() is not null;
$$;


--
-- Name: project_labels(uuid[]); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.project_labels(p_ids uuid[]) RETURNS TABLE(id uuid, project_name text, client_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p.id,
         case when c.restricted_at is null or app.role() >= 'hr' then p.name else 'gesperrt' end,
         case when c.restricted_at is null or app.role() >= 'hr' then c.name else 'gesperrt' end
    from app.projects p
    join app.clients c on c.id = p.client_id
   where p.id = any (p_ids)
     and p.tenant_id = app.tenant_id();
$$;


--
-- Name: project_rounding(uuid[]); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.project_rounding(p_ids uuid[]) RETURNS TABLE(project_id uuid, increment_minutes smallint, increment_source text, mode app.rounding_mode, mode_source text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p.id,
         coalesce(p.rounding_increment_min, c.rounding_increment_min, b.rounding_increment_min, 15),
         case
           when p.rounding_increment_min is not null then 'project'
           when c.rounding_increment_min is not null then 'client'
           else 'tenant'
         end,
         coalesce(p.rounding_mode, c.rounding_mode, b.rounding_mode, 'up'::app.rounding_mode),
         case
           when p.rounding_mode is not null then 'project'
           when c.rounding_mode is not null then 'client'
           else 'tenant'
         end
    from app.projects p
    join app.clients c on c.id = p.client_id
    left join app.billing_profiles b on b.tenant_id = p.tenant_id
   where p.id = any (p_ids)
     and p.tenant_id = app.tenant_id();
$$;


--
-- Name: reject_change(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.reject_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true)
      and current_user in ('zeit_system', 'zeit_owner') then
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
    AS $$
  select nullif(pg_catalog.current_setting('app.role', true), '')::app.user_role
$$;


--
-- Name: round_div(bigint, bigint); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.round_div(num bigint, den bigint) RETURNS bigint
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
begin
  if 2 * abs(num % den) < abs(den) then
    return num / den;
  end if;
  return case when (num < 0) <> (den < 0) then num / den - 1 else num / den + 1 end;
end;
$$;


--
-- Name: sandbox_quota(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.sandbox_quota() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  cap constant integer := tg_argv[0];
  sandbox uuid;
  total integer;
begin
  for sandbox in
    select t.id from app.tenants t where t.kind = 'sandbox' and t.id in (select a.tenant_id from added a)
  loop
    execute format('select count(*) from %I.%I where tenant_id = $1', tg_table_schema, tg_table_name)
      into total using sandbox;
    if total > cap then
      raise exception 'sandbox % has more than % rows in %', sandbox, cap, tg_table_name
        using errcode = 'ZT005';
    end if;
  end loop;
  return null;
end;
$_$;


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
-- Name: store_invoice_document(uuid, text, bytea); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.store_invoice_document(p_invoice_id uuid, p_format text, p_content bytea) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  stored uuid;
  issued_format app.invoice_format;
  head bytea := substring(p_content for 5);
begin
  if (app.role() >= 'hr') is not true then
    raise exception 'only hr and admins store invoice documents' using errcode = 'insufficient_privilege';
  end if;

  select i.format into issued_format
    from app.invoices i
   where i.tenant_id = app.tenant_id() and i.id = p_invoice_id and i.status <> 'draft';
  if not found then
    raise exception 'a document only attaches to an issued invoice' using errcode = 'ZT003';
  end if;

  if p_format <> all (
    case issued_format
      when 'pdf' then array['pdf']
      when 'zugferd' then array['zugferd']
      else array['xrechnung_cii', 'pdf']
    end
  ) then
    raise exception 'a % invoice keeps no % document', issued_format, p_format using errcode = 'ZT003';
  end if;

  if p_format = 'xrechnung_cii' and substring(p_content for 3) = '\xefbbbf'::bytea then
    head := substring(p_content from 4 for 5);
  end if;

  if head <> (case when p_format = 'xrechnung_cii' then '<?xml'::bytea else '%PDF-'::bytea end) then
    raise exception 'the content is no % document', p_format using errcode = 'ZT003';
  end if;

  insert into app.invoice_documents (tenant_id, invoice_id, format, content, sha256, created_by)
  values (app.tenant_id(), p_invoice_id, p_format, p_content, sha256(p_content), app.user_id())
  on conflict (tenant_id, invoice_id, format) do nothing
  returning id into stored;

  return stored;
end;
$$;


--
-- Name: team_absence_days(date, date, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.team_absence_days(p_from date, p_to date, p_team_id uuid) RETURNS TABLE(employee_id uuid, display_name text, date date, portion numeric, type text, status text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: tenant_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.tenant_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    AS $$
  select nullif(pg_catalog.current_setting('app.tenant_id', true), '')::pg_catalog.uuid
$$;


--
-- Name: user_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.user_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    AS $$
  select nullif(pg_catalog.current_setting('app.user_id', true), '')::pg_catalog.uuid
$$;


--
-- Name: workspace(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.workspace() RETURNS app.workspace_kind
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  select t.workspace from app.tenants t where t.id = app.tenant_id()
$$;


--
-- Name: guard_log(); Type: FUNCTION; Schema: audit; Owner: -
--

CREATE FUNCTION audit.guard_log() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if to_jsonb(new) - 'ip' = to_jsonb(old) - 'ip' and new.ip = audit.ip_network(old.ip) then
    return new;
  end if;
  raise exception '%.% is append-only', tg_table_schema, tg_table_name using errcode = 'ZT002';
end;
$$;


--
-- Name: ip_network(inet); Type: FUNCTION; Schema: audit; Owner: -
--

CREATE FUNCTION audit.ip_network(p_ip inet) RETURNS inet
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
  select pg_catalog.network(pg_catalog.set_masklen(p_ip, case pg_catalog.family(p_ip) when 4 then 24 else 48 end))::inet
$$;


--
-- Name: track(); Type: FUNCTION; Schema: audit; Owner: -
--

CREATE FUNCTION audit.track() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  skipped constant text[] := case tg_table_name
    when 'invoices' then array['updated_at', 'last_login_at', 'seller', 'buyer']
    when 'invoice_documents' then array['updated_at', 'last_login_at', 'content']
    else array['updated_at', 'last_login_at']
  end;
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

  if tg_table_name = 'billing_profiles' then
    old_row := old_row || jsonb_strip_nulls(
      jsonb_build_object('iban', right(old_row ->> 'iban', 4), 'bic', right(old_row ->> 'bic', 4))
    );
    new_row := new_row || jsonb_strip_nulls(
      jsonb_build_object('iban', right(new_row ->> 'iban', 4), 'bic', right(new_row ->> 'bic', 4))
    );
  end if;

  latest := case when tg_op = 'DELETE' then old_row else new_row end;
  tenant := (case when tg_table_name = 'tenants' then latest ->> 'id' else latest ->> 'tenant_id' end)::uuid;

  if exists (
    select 1 from app.tenants t where t.id = tenant and t.kind = 'sandbox' and t.created_at = now()
  )
    and (tg_op <> 'UPDATE' or old_row ->> 'tenant_id' is not distinct from new_row ->> 'tenant_id')
  then
    return null;
  end if;

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
-- Name: enrollment_finish(uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.enrollment_finish(p_session_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: factors(uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.factors(p_user_id uuid) RETURNS TABLE(has_totp boolean, passkey_count integer, recovery_left integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from auth.totp t where t.user_id = p_user_id and t.confirmed_at is not null),
         (select count(*)::integer from auth.passkeys k where k.user_id = p_user_id),
         (select count(*)::integer from auth.recovery_codes c where c.user_id = p_user_id and c.used_at is null);
$$;


--
-- Name: invitation_accept(bytea, text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.invitation_accept(p_token_hash bytea, p_password_hash text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  account uuid;
  previous_user text := current_setting('app.user_id', true);
  previous_role text := current_setting('app.role', true);
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
    perform set_config('app.user_id', account::text, true),
            set_config('app.role', (select u.role::text from app.users u where u.id = account), true);
    perform auth.password_set(account, p_password_hash);
    perform set_config('app.user_id', coalesce(previous_user, ''), true),
            set_config('app.role', coalesce(previous_role, ''), true);
  end if;
  return account;
end;
$$;


--
-- Name: login_failed(uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.login_failed(p_user_id uuid) RETURNS timestamp with time zone
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update auth.credentials c
     set failed_count = case when c.last_failed_at > now() - interval '24 hours' then c.failed_count else 0 end + 1,
         last_failed_at = now(),
         locked_until = case
           when c.last_failed_at > now() - interval '24 hours' and c.failed_count >= 4
             then now() + interval '1 minute' * least(power(2, c.failed_count - 4), 15)
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
   where u.email operator(public.=) p_email::public.citext
     and u.status = 'active';
$$;


--
-- Name: mfa_challenge_attempt(bytea); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.mfa_challenge_attempt(p_token_hash bytea) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select a.user_id from auth.mfa_challenge_attempt_with_scope(p_token_hash) a;
$$;


--
-- Name: mfa_challenge_attempt_with_scope(bytea); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.mfa_challenge_attempt_with_scope(p_token_hash bytea) RETURNS TABLE(user_id uuid, tenant_id uuid, role app.user_role)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with counted as (
    update auth.mfa_challenges m set attempts = m.attempts + 1
     where m.token_hash = p_token_hash
       and m.expires_at > now()
       and m.attempts < 5
       and not exists (
         select 1 from auth.credentials c where c.user_id = m.user_id and c.locked_until > now()
       )
    returning m.user_id
  )
  select u.id, u.tenant_id, u.role
    from counted
    join app.users u on u.id = counted.user_id;
$$;


--
-- Name: mfa_challenge_consume(bytea); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.mfa_challenge_consume(p_token_hash bytea) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from auth.mfa_challenges m
   where m.token_hash = p_token_hash and m.expires_at > now()
  returning m.user_id;
$$;


--
-- Name: mfa_challenge_create(uuid, bytea); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.mfa_challenge_create(p_user_id uuid, p_token_hash bytea) RETURNS timestamp with time zone
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from auth.mfa_challenges m where m.user_id = p_user_id;
  insert into auth.mfa_challenges (token_hash, user_id)
  values (p_token_hash, p_user_id)
  returning expires_at;
$$;


--
-- Name: mfa_reset(uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.mfa_reset(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  delete from auth.credentials c where c.user_id = p_user_id;
end;
$$;


--
-- Name: passkey_add(bytea, bytea, bigint, text[], uuid, boolean, text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.passkey_add(p_credential_id bytea, p_public_key bytea, p_counter bigint, p_transports text[], p_aaguid uuid, p_backed_up boolean, p_name text) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into auth.passkeys (user_id, credential_id, public_key, counter, transports, aaguid, backed_up, name)
  values (
    app.user_id(), p_credential_id, p_public_key, p_counter, coalesce(p_transports, '{}'), p_aaguid,
    p_backed_up, p_name
  )
  returning id;
$$;


--
-- Name: passkey_find(bytea); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.passkey_find(p_credential_id bytea) RETURNS TABLE(id uuid, user_id uuid, public_key bytea, counter bigint, transports text[], tenant_id uuid, role app.user_role)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select k.id, k.user_id, k.public_key, k.counter, k.transports, u.tenant_id, u.role
    from auth.passkeys k
    join app.users u on u.id = k.user_id
   where k.credential_id = p_credential_id
     and u.status in ('active', 'demo');
$$;


--
-- Name: passkey_remove(uuid, uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.passkey_remove(p_user_id uuid, p_passkey_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with gone as (
    delete from auth.passkeys k where k.id = p_passkey_id and k.user_id = p_user_id returning k.id
  )
  select exists (select 1 from gone);
$$;


--
-- Name: passkey_rename(uuid, uuid, text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.passkey_rename(p_user_id uuid, p_passkey_id uuid, p_name text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with renamed as (
    update auth.passkeys k set name = p_name
     where k.id = p_passkey_id and k.user_id = p_user_id
    returning k.id
  )
  select exists (select 1 from renamed);
$$;


--
-- Name: passkey_touch(uuid, bigint, boolean); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.passkey_touch(p_passkey_id uuid, p_counter bigint, p_backed_up boolean) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with touched as (
    update auth.passkeys k
       set counter = p_counter, backed_up = p_backed_up, last_used_at = now()
     where k.id = p_passkey_id
       and (p_counter > k.counter or (p_counter = 0 and k.counter = 0))
    returning k.id
  )
  select exists (select 1 from touched);
$$;


--
-- Name: passkeys_list(uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.passkeys_list(p_user_id uuid) RETURNS TABLE(id uuid, credential_id bytea, name text, transports text[], backed_up boolean, created_at timestamp with time zone, last_used_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select k.id, k.credential_id, k.name, k.transports, k.backed_up, k.created_at, k.last_used_at
    from auth.passkeys k
   where k.user_id = p_user_id
   order by k.created_at;
$$;


--
-- Name: password_change(text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.password_change(p_password_hash text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  account uuid := app.user_id();
begin
  if account is null then
    raise exception 'nobody is signed in' using errcode = '28000';
  end if;

  perform auth.password_set(account, p_password_hash);
  delete from auth.sessions s where s.user_id = account;
  delete from auth.tokens t where t.user_id = account and t.kind = 'password_reset' and t.used_at is null;
end;
$$;


--
-- Name: password_rehash(uuid, text, text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.password_rehash(p_user_id uuid, p_old_hash text, p_new_hash text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with swapped as (
    update auth.credentials c set password_hash = p_new_hash
     where c.user_id = p_user_id and c.password_hash = p_old_hash
    returning c.user_id
  )
  select exists (select 1 from swapped);
$$;


--
-- Name: password_reset(bytea, text); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.password_reset(p_token_hash bytea, p_password_hash text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  delete from auth.webauthn_challenges w where w.expires_at <= now() or w.used_at is not null;
  delete from auth.mfa_challenges m where m.expires_at <= now();
$$;


--
-- Name: recovery_code_use(uuid, bytea); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.recovery_code_use(p_user_id uuid, p_code_hash bytea) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with used as (
    update auth.recovery_codes c set used_at = now()
     where c.user_id = p_user_id and c.code_hash = p_code_hash and c.used_at is null
    returning c.id
  )
  select exists (select 1 from used);
$$;


--
-- Name: recovery_codes_replace(bytea[]); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.recovery_codes_replace(p_code_hashes bytea[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from auth.recovery_codes c where c.user_id = app.user_id();
  insert into auth.recovery_codes (user_id, code_hash)
  select app.user_id(), h.code_hash from unnest(p_code_hashes) as h (code_hash);
$$;


--
-- Name: session_create(uuid, bytea, bytea, inet, text, boolean); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_create(p_user_id uuid, p_token_hash bytea, p_csrf_hash bytea, p_ip inet, p_user_agent text, p_bypass_lock boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

  if not p_bypass_lock
    and exists (select 1 from auth.credentials c where c.user_id = p_user_id and c.locked_until > now())
  then
    raise exception 'user % is locked', p_user_id using errcode = '28000';
  end if;

  update auth.credentials c set failed_count = 0, locked_until = null, last_failed_at = null
   where c.user_id = p_user_id
     and c.failed_count > 0
     and (c.locked_until is null or c.locked_until <= now());

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


--
-- Name: session_reauth(uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_reauth(p_session_id uuid) RETURNS timestamp with time zone
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update auth.sessions s set reauth_at = now() where s.id = p_session_id returning s.reauth_at;
$$;


--
-- Name: session_resolve(bytea); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_resolve(p_token_hash bytea) RETURNS TABLE(session_id uuid, user_id uuid, tenant_id uuid, role app.user_role, employee_id uuid, csrf_hash bytea, reauth_at timestamp with time zone, enrollment_pending boolean, workspace app.workspace_kind)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
-- Name: session_revoke_others(uuid, uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.session_revoke_others(p_user_id uuid, p_keep_session_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from auth.sessions s where s.user_id = p_user_id and s.id <> p_keep_session_id;
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
-- Name: token_issue(uuid, auth.token_kind, bytea); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.token_issue(p_user_id uuid, p_kind auth.token_kind, p_token_hash bytea) RETURNS timestamp with time zone
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into auth.tokens as t (user_id, kind, token_hash, expires_at)
  values (
    p_user_id, p_kind, p_token_hash,
    now() + case p_kind when 'invite' then interval '7 days' else interval '30 minutes' end
  )
  on conflict (user_id, kind) where used_at is null do update
    set token_hash = excluded.token_hash, expires_at = excluded.expires_at, created_at = now()
  returning t.expires_at;
$$;


--
-- Name: totp_begin(uuid, bytea, integer); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.totp_begin(p_user_id uuid, p_secret_enc bytea, p_key_version integer) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: totp_confirm(uuid, bigint, bytea[]); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.totp_confirm(p_user_id uuid, p_step bigint, p_code_hashes bytea[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update auth.totp t set confirmed_at = now(), last_used_step = p_step
   where t.user_id = p_user_id and t.confirmed_at is null;
  if not found then
    return false;
  end if;

  if p_code_hashes is not null then
    delete from auth.recovery_codes c where c.user_id = p_user_id;
    insert into auth.recovery_codes (user_id, code_hash)
    select p_user_id, h.code_hash from unnest(p_code_hashes) as h (code_hash);
  end if;
  return true;
end;
$$;


--
-- Name: totp_remove(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.totp_remove() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with gone as (delete from auth.totp t where t.user_id = app.user_id() returning t.user_id)
  select exists (select 1 from gone);
$$;


--
-- Name: totp_secret(uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.totp_secret(p_user_id uuid) RETURNS TABLE(secret_enc bytea, key_version smallint, confirmed boolean, last_used_step bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select t.secret_enc, t.key_version, t.confirmed_at is not null, t.last_used_step
    from auth.totp t
   where t.user_id = p_user_id;
$$;


--
-- Name: totp_use_step(uuid, bigint); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.totp_use_step(p_user_id uuid, p_step bigint) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with used as (
    update auth.totp t set last_used_step = p_step
     where t.user_id = p_user_id
       and t.confirmed_at is not null
       and p_step > coalesce(t.last_used_step, -1)
    returning t.user_id
  )
  select exists (select 1 from used);
$$;


--
-- Name: webauthn_challenge_consume(bytea, auth.webauthn_purpose, uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.webauthn_challenge_consume(p_challenge bytea, p_purpose auth.webauthn_purpose, p_user_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: webauthn_challenge_create(bytea, auth.webauthn_purpose, uuid); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.webauthn_challenge_create(p_challenge bytea, p_purpose auth.webauthn_purpose, p_user_id uuid) RETURNS timestamp with time zone
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into auth.webauthn_challenges (challenge, purpose, user_id)
  values (p_challenge, p_purpose, p_user_id)
  returning expires_at;
$$;


--
-- Name: active_tenants(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.active_tenants() RETURNS TABLE(id uuid, kind app.tenant_kind, workspace app.workspace_kind)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select t.id, t.kind, t.workspace
    from app.tenants t
   where t.expires_at is null or t.expires_at > now();
$$;


--
-- Name: audit_ip_retention(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.audit_ip_retention() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  cut integer;
begin
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


--
-- Name: demo_only(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.demo_only() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if current_setting('app.demo_mode', true) is distinct from 'true' then
    raise exception 'sandboxes are only seeded in the demo' using errcode = 'insufficient_privilege';
  end if;
end;
$$;


--
-- Name: demo_personas(); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.demo_personas() RETURNS TABLE(user_id uuid, display_name text, role app.user_role, employee_id uuid, employee_name text, team_id uuid, team_name text, workspace app.workspace_kind)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u.id, u.display_name, u.role, e.id, e.first_name || ' ' || e.last_name, tm.id, tm.name,
         t.workspace
    from app.tenants own
    join app.tenants t on t.id = own.id or t.sandbox_group = own.sandbox_group
    join app.users u on u.tenant_id = t.id
    left join app.employees e on e.id = u.employee_id
    left join app.teams tm on tm.id = e.team_id
   where own.id = app.tenant_id()
     and own.kind = 'sandbox'
     and t.kind = 'sandbox'
     and t.expires_at > now()
     and u.status in ('active', 'demo')
   order by u.role, u.display_name;
$$;


--
-- Name: demo_switch_persona(bytea, uuid, bytea, bytea); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.demo_switch_persona(p_session_token_hash bytea, p_target_user_id uuid, p_new_token_hash bytea, p_new_csrf_hash bytea) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with old as (
    delete from auth.sessions s
     using app.users u, app.tenants t, app.users target, app.tenants tt
     where s.token_hash = p_session_token_hash
       and s.idle_expires_at > now()
       and s.absolute_expires_at > now()
       and u.id = s.user_id
       and t.id = u.tenant_id
       and t.kind = 'sandbox'
       and t.expires_at > now()
       and target.id = p_target_user_id
       and target.status in ('active', 'demo')
       and tt.id = target.tenant_id
       and tt.kind = 'sandbox'
       and tt.expires_at > now()
       and (tt.id = t.id or tt.sandbox_group = t.sandbox_group)
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
-- Name: expired_sandboxes(integer); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.expired_sandboxes(p_limit integer) RETURNS TABLE(id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select t.id
    from app.tenants t
   where t.kind = 'sandbox' and t.expires_at <= now()
   order by t.expires_at
   limit p_limit;
$$;


--
-- Name: mfa_reset_operator(public.citext); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.mfa_reset_operator(p_email public.citext) RETURNS TABLE(user_id uuid, tenant_id uuid, display_name text, locale text, email public.citext)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: purge_sandbox(uuid); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.purge_sandbox(p_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  purged boolean;
begin
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


--
-- Name: sandbox_create(uuid, text, text, app.federal_state, integer, integer, app.flex_cap_mode); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.sandbox_create(p_id uuid, p_name text, p_slug text, p_state app.federal_state, p_flex_cap_plus_min integer, p_flex_cap_minus_min integer, p_flex_cap_mode app.flex_cap_mode) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select ops.demo_only();
  insert into app.tenants (
    id, name, slug, state, flex_cap_plus_min, flex_cap_minus_min, flex_cap_mode, kind, expires_at
  )
  values (
    p_id, p_name, p_slug, p_state, p_flex_cap_plus_min, p_flex_cap_minus_min, p_flex_cap_mode,
    'sandbox', now() + interval '24 hours'
  )
  returning id;
$$;


--
-- Name: sandbox_seed(jsonb, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.sandbox_seed(p_plan jsonb, p_locale text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  tenant constant uuid := (p_plan -> 'tenant' ->> 'id')::uuid;
  solo constant uuid := (p_plan -> 'solo' -> 'tenant' ->> 'id')::uuid;
  pair constant uuid := gen_random_uuid();
begin
  perform ops.sandbox_seed_company(p_plan, p_locale);
  update app.tenants t set sandbox_group = pair where t.id = tenant;

  insert into app.tenants (id, name, slug, state, workspace, kind, expires_at, sandbox_group)
  select solo, p_plan -> 'solo' -> 'tenant' ->> 'name', p_plan -> 'solo' -> 'tenant' ->> 'slug',
         (p_plan -> 'solo' -> 'tenant' ->> 'state')::app.federal_state, 'solo', 'sandbox', t.expires_at, pair
    from app.tenants t
   where t.id = tenant;

  insert into app.employees (id, tenant_id, personnel_no, first_name, last_name, entry_date)
  select x.id, solo, x."personnelNo", x."firstName", x."lastName", x."entryDate"
    from jsonb_to_record(p_plan -> 'solo' -> 'employee')
      as x (id uuid, "personnelNo" text, "firstName" text, "lastName" text, "entryDate" date);

  insert into app.users (id, tenant_id, email, display_name, role, locale, status, employee_id)
  select x.id, solo, x.email, x."displayName", 'admin', p_locale, 'demo',
         (p_plan -> 'solo' -> 'employee' ->> 'id')::uuid
    from jsonb_to_record(p_plan -> 'solo' -> 'user') as x (id uuid, email text, "displayName" text);

  perform ops.sandbox_seed_book(tenant, p_plan);
  perform ops.sandbox_seed_book(solo, p_plan -> 'solo');
end;
$$;


--
-- Name: sandbox_seed_book(uuid, jsonb); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.sandbox_seed_book(p_tenant uuid, p_book jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  previous_role text := current_setting('app.role', true);
begin
  perform ops.demo_only();

  insert into app.clients (
    id, tenant_id, number, name, street, postal_code, city, country_code, is_business, vat_id, email,
    buyer_reference, invoice_locale, payment_terms_days, rounding_increment_min, rounding_mode
  )
  select x.id, p_tenant, x.number, x.name, x.street, x."postalCode", x.city, x."countryCode",
         x."isBusiness", x."vatId", x.email, x."buyerReference", x."invoiceLocale", x."paymentTermsDays",
         x."roundingIncrementMin", x."roundingMode"
    from jsonb_to_recordset(p_book -> 'clients')
      as x (id uuid, number text, name text, street text, "postalCode" text, city text,
            "countryCode" text, "isBusiness" boolean, "vatId" text, email public.citext,
            "buyerReference" text, "invoiceLocale" text, "paymentTermsDays" smallint,
            "roundingIncrementMin" smallint, "roundingMode" app.rounding_mode);

  insert into app.projects (id, tenant_id, client_id, name, code, budget_minutes)
  select x.id, p_tenant, x."clientId", x.name, x.code, x."budgetMinutes"
    from jsonb_to_recordset(p_book -> 'projects')
      as x (id uuid, "clientId" uuid, name text, code text, "budgetMinutes" integer);

  insert into app.tasks (id, tenant_id, client_id, project_id, name)
  select x.id, p_tenant, x."clientId", x."projectId", x.name
    from jsonb_to_recordset(p_book -> 'tasks') as x (id uuid, "clientId" uuid, "projectId" uuid, name text);

  insert into app.rates (id, tenant_id, client_id, project_id, task_id, employee_id, valid_from, rate_cents)
  select x.id, p_tenant, x."clientId", x."projectId", x."taskId", x."employeeId", x."validFrom", x."rateCents"
    from jsonb_to_recordset(p_book -> 'rates')
      as x (id uuid, "clientId" uuid, "projectId" uuid, "taskId" uuid, "employeeId" uuid,
            "validFrom" date, "rateCents" bigint);

  insert into app.billing_profiles (
    tenant_id, legal_name, street, postal_code, city, country_code, tax_number, vat_id, tax_profile,
    previous_year_revenue_cents, iban, bic, bank_name, contact_name, contact_email, contact_phone,
    register_court, register_number, invoice_prefix, payment_terms_days, rounding_increment_min,
    rounding_mode, default_format
  )
  select p_tenant, x."legalName", x.street, x."postalCode", x.city, x."countryCode", x."taxNumber",
         x."vatId", x."taxProfile", x."previousYearRevenueCents", x.iban, x.bic, x."bankName",
         x."contactName", x."contactEmail", x."contactPhone", x."registerCourt", x."registerNumber",
         x."invoicePrefix", x."paymentTermsDays", x."roundingIncrementMin", x."roundingMode", x."defaultFormat"
    from jsonb_to_record(p_book -> 'billingProfile')
      as x ("legalName" text, street text, "postalCode" text, city text, "countryCode" char(2),
            "taxNumber" text, "vatId" text, "taxProfile" app.tax_profile, "previousYearRevenueCents" bigint,
            iban text, bic text, "bankName" text, "contactName" text, "contactEmail" public.citext,
            "contactPhone" text, "registerCourt" text, "registerNumber" text, "invoicePrefix" text,
            "paymentTermsDays" smallint, "roundingIncrementMin" smallint, "roundingMode" app.rounding_mode,
            "defaultFormat" app.invoice_format);

  insert into app.invoice_counters (tenant_id, year, last_seq)
  select p_tenant, x.year, x."lastSeq"
    from jsonb_to_recordset(p_book -> 'invoiceCounters') as x (year smallint, "lastSeq" integer);

  insert into app.invoices (
    id, tenant_id, kind, client_id, refers_to_id, service_from, service_to, payment_terms_days, locale,
    format, tax_profile, tax_treatment, intro_text, closing_text, created_by, created_at
  )
  select x.id, p_tenant, x.kind, x."clientId", x."refersToId", x."serviceFrom", x."serviceTo",
         x."paymentTermsDays", x.locale, x.format, x."taxProfile", x."taxTreatment", x."introText",
         x."closingText", x."createdBy", x."createdAt"
    from jsonb_to_recordset(p_book -> 'invoices')
      as x (id uuid, kind app.invoice_kind, "clientId" uuid, "refersToId" uuid, "serviceFrom" date,
            "serviceTo" date, "paymentTermsDays" smallint, locale text, format app.invoice_format,
            "taxProfile" app.tax_profile, "taxTreatment" app.tax_category, "introText" text,
            "closingText" text, "createdBy" uuid, "createdAt" timestamptz);

  perform set_config('app.role', 'admin', true);
  insert into app.project_entries (
    id, tenant_id, employee_id, project_id, task_id, started_at, ended_at, note, source, invoice_id
  )
  select x.id, p_tenant, x."employeeId", x."projectId", x."taskId", x."startedAt", x."endedAt", x.note, 'seed',
         x."invoiceId"
    from jsonb_to_recordset(p_book -> 'projectEntries')
      as x (id uuid, "employeeId" uuid, "projectId" uuid, "taskId" uuid, "startedAt" timestamptz,
            "endedAt" timestamptz, note text, "invoiceId" uuid);
  perform set_config('app.role', coalesce(previous_role, ''), true);

  insert into app.invoice_lines (
    id, tenant_id, invoice_id, client_id, position, kind, project_id, task_id, description, service_from,
    service_to, minutes, quantity_milli, unit, unit_price_cents, net_cents, tax_category, tax_rate_bp,
    exemption_reason, derivation
  )
  select l.id, p_tenant, i.id, i."clientId", l.position, l.kind, l."projectId", l."taskId", l.description,
         l."serviceFrom", l."serviceTo", l.minutes, l."quantityMilli", l.unit, l."unitPriceCents",
         l."netCents", l."taxCategory", l."taxRateBp", l."exemptionReason", l.derivation
    from jsonb_to_recordset(p_book -> 'invoices') as i (id uuid, "clientId" uuid, lines jsonb)
    cross join lateral jsonb_to_recordset(i.lines)
      as l (id uuid, position integer, kind app.invoice_line_kind, "projectId" uuid, "taskId" uuid,
            description text, "serviceFrom" date, "serviceTo" date, minutes integer, "quantityMilli" bigint,
            unit text, "unitPriceCents" bigint, "netCents" bigint, "taxCategory" app.tax_category,
            "taxRateBp" smallint, "exemptionReason" text, derivation jsonb);

  insert into app.invoice_line_entries (tenant_id, invoice_id, line_id, entry_id)
  select p_tenant, i.id, l.id, e.id::uuid
    from jsonb_to_recordset(p_book -> 'invoices') as i (id uuid, lines jsonb)
    cross join lateral jsonb_to_recordset(i.lines) as l (id uuid, "entryIds" jsonb)
    cross join lateral jsonb_array_elements_text(l."entryIds") as e (id);

  update app.invoices i set
    status = x.status,
    number = x.number,
    number_year = x."numberYear",
    number_seq = x."numberSeq",
    issue_date = x."issueDate",
    due_date = x."dueDate",
    net_cents = x."netCents",
    tax_cents = x."taxCents",
    gross_cents = x."grossCents",
    seller = x.seller,
    buyer = x.buyer,
    paid_on = x."paidOn",
    cancel_reason = x."cancelReason",
    cancelled_at = x."cancelledAt",
    cancelled_by = x."cancelledBy",
    issued_at = x."issuedAt",
    issued_by = x."issuedBy"
    from jsonb_to_recordset(p_book -> 'invoices')
      as x (id uuid, status app.invoice_status, number text, "numberYear" smallint, "numberSeq" integer,
            "issueDate" date, "dueDate" date, "netCents" bigint, "taxCents" bigint, "grossCents" bigint,
            seller jsonb, buyer jsonb, "paidOn" date, "cancelReason" text, "cancelledAt" timestamptz,
            "cancelledBy" uuid, "issuedAt" timestamptz, "issuedBy" uuid)
   where i.tenant_id = p_tenant and i.id = x.id and x.status <> 'draft';
end;
$$;


--
-- Name: sandbox_seed_company(jsonb, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.sandbox_seed_company(p_plan jsonb, p_locale text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  tenant constant uuid := (p_plan -> 'tenant' ->> 'id')::uuid;
  settled boolean;
begin
  perform ops.sandbox_create(
    tenant,
    p_plan -> 'tenant' ->> 'name',
    p_plan -> 'tenant' ->> 'slug',
    (p_plan -> 'tenant' ->> 'state')::app.federal_state,
    (p_plan -> 'tenant' ->> 'flexCapPlusMinutes')::integer,
    (p_plan -> 'tenant' ->> 'flexCapMinusMinutes')::integer,
    (p_plan -> 'tenant' ->> 'flexCapMode')::app.flex_cap_mode
  );

  insert into app.teams (id, tenant_id, name)
  select x.id, tenant, x.name
    from jsonb_to_recordset(p_plan -> 'teams') as x (id uuid, name text);

  insert into app.work_models (
    id, tenant_id, name, min_mon, min_tue, min_wed, min_thu, min_fri, min_sat, min_sun
  )
  select x.id, tenant, x.name, m.mon, m.tue, m.wed, m.thu, m.fri, m.sat, m.sun
    from jsonb_to_recordset(p_plan -> 'workModels') as x (id uuid, name text, minutes jsonb),
         jsonb_to_record(x.minutes) as m (
           mon smallint, tue smallint, wed smallint, thu smallint, fri smallint, sat smallint, sun smallint
         );

  insert into app.employees (id, tenant_id, personnel_no, first_name, last_name, team_id, entry_date, exit_date)
  select x.id, tenant, x."personnelNo", x."firstName", x."lastName", x."teamId", x."entryDate", x."exitDate"
    from jsonb_to_recordset(p_plan -> 'employees')
      as x (id uuid, "personnelNo" text, "firstName" text, "lastName" text, "teamId" uuid,
            "entryDate" date, "exitDate" date);

  insert into app.users (id, tenant_id, email, display_name, role, locale, status, employee_id)
  select x.id, tenant, x.email, x."displayName", x.role, p_locale, 'demo', x."employeeId"
    from jsonb_to_recordset(p_plan -> 'users')
      as x (id uuid, email text, "displayName" text, role app.user_role, "employeeId" uuid);

  insert into app.team_leads (tenant_id, team_id, user_id)
  select tenant, x.id, l.user_id::uuid
    from jsonb_to_recordset(p_plan -> 'teams') as x (id uuid, "leadUserIds" jsonb),
         jsonb_array_elements_text(x."leadUserIds") as l (user_id);

  insert into app.contracts (
    id, tenant_id, employee_id, valid_from, work_model_id,
    min_mon, min_tue, min_wed, min_thu, min_fri, min_sat, min_sun,
    vacation_days_year, vacation_basis_days
  )
  select x.id, tenant, x."employeeId", x."validFrom", x."workModelId",
         m.mon, m.tue, m.wed, m.thu, m.fri, m.sat, m.sun,
         x."vacationDaysYear", x."vacationBasisDays"
    from jsonb_to_recordset(p_plan -> 'contracts')
      as x (id uuid, "employeeId" uuid, "validFrom" date, "workModelId" uuid, minutes jsonb,
            "vacationDaysYear" numeric, "vacationBasisDays" smallint),
         jsonb_to_record(x.minutes) as m (
           mon smallint, tue smallint, wed smallint, thu smallint, fri smallint, sat smallint, sun smallint
         );

  insert into app.time_entries (id, tenant_id, employee_id, started_at, ended_at, end_reason, source)
  select x.id, tenant, x."employeeId", x."startedAt", x."endedAt", x."endReason", x.source
    from jsonb_to_recordset(p_plan -> 'entries')
      as x (id uuid, "employeeId" uuid, "startedAt" timestamptz, "endedAt" timestamptz,
            "endReason" app.end_reason, source app.entry_source);

  insert into app.correction_requests (
    id, tenant_id, employee_id, action, target_entry_id, new_started_at, new_ended_at,
    reason, requested_by, created_at
  )
  select x.id, tenant, x."employeeId", x.action, x."targetEntryId", x."newStartedAt", x."newEndedAt",
         x.reason, x."requestedBy", x."createdAt"
    from jsonb_to_recordset(p_plan -> 'corrections')
      as x (id uuid, "employeeId" uuid, action app.correction_action, "targetEntryId" uuid,
            "newStartedAt" timestamptz, "newEndedAt" timestamptz, reason text, "requestedBy" uuid,
            "createdAt" timestamptz);

  update app.correction_requests c
     set status = x.status, decided_by = x."decidedBy", decided_at = x."decidedAt"
    from jsonb_to_recordset(p_plan -> 'corrections')
      as x (id uuid, status app.correction_status, "decidedBy" uuid, "decidedAt" timestamptz)
   where c.tenant_id = tenant and c.id = x.id and x.status <> 'pending';

  foreach settled in array array[true, false] loop
    insert into app.absence_requests (
      id, tenant_id, employee_id, type, start_date, end_date, half_day_start, half_day_end,
      requested_by, certificate_confirmed_at, certificate_confirmed_by, created_at
    )
    select x.id, tenant, x."employeeId", x.type, x."startDate", x."endDate", x."halfDayStart",
           x."halfDayEnd", x."requestedBy", x."certificateConfirmedAt", x."certificateConfirmedBy",
           x."createdAt"
      from jsonb_to_recordset(p_plan -> 'absences')
        as x (id uuid, "employeeId" uuid, type app.absence_type, status app.absence_status,
              "startDate" date, "endDate" date, "halfDayStart" boolean, "halfDayEnd" boolean,
              "requestedBy" uuid, "certificateConfirmedAt" timestamptz, "certificateConfirmedBy" uuid,
              "createdAt" timestamptz)
     where (x.status in ('rejected', 'withdrawn', 'cancelled')) = settled;

    update app.absence_requests r
       set status = case when x.status in ('cancel_pending', 'cancelled') then 'approved' else x.status end,
           decided_by = x."decidedBy", decided_at = x."decidedAt", decision_note = x."decisionNote"
      from jsonb_to_recordset(p_plan -> 'absences')
        as x (id uuid, status app.absence_status, "decidedBy" uuid, "decidedAt" timestamptz,
              "decisionNote" text)
     where r.tenant_id = tenant and r.id = x.id and x.status <> 'pending'
       and (x.status in ('rejected', 'withdrawn', 'cancelled')) = settled;

    update app.absence_requests r
       set status = x.status
      from jsonb_to_recordset(p_plan -> 'absences') as x (id uuid, status app.absence_status)
     where r.tenant_id = tenant and r.id = x.id and x.status in ('cancel_pending', 'cancelled')
       and (x.status in ('rejected', 'withdrawn', 'cancelled')) = settled;
  end loop;

  insert into app.absence_days (
    id, tenant_id, employee_id, absence_id, date, portion, target_minutes, vacation_days,
    superseded_at, superseded_by
  )
  select x.id, tenant, x."employeeId", x."absenceId", x.date, x.portion, x."targetMinutes",
         x."vacationDays", x."supersededAt", x."supersededBy"
    from jsonb_to_recordset(p_plan -> 'absenceDays')
      as x (id uuid, "employeeId" uuid, "absenceId" uuid, date date, portion numeric,
            "targetMinutes" smallint, "vacationDays" numeric, "supersededAt" timestamptz,
            "supersededBy" uuid);

  insert into app.vacation_notices (
    id, tenant_id, employee_id, bucket_year, remaining_days, deadline, sent_at, sent_by,
    channel, text_version
  )
  select x.id, tenant, x."employeeId", x."bucketYear", x."remainingDays", x.deadline, x."sentAt",
         x."sentBy", x.channel, x."textVersion"
    from jsonb_to_recordset(p_plan -> 'vacationNotices')
      as x (id uuid, "employeeId" uuid, "bucketYear" smallint, "remainingDays" numeric,
            deadline date, "sentAt" timestamptz, "sentBy" uuid, channel app.notice_channel,
            "textVersion" text);

  insert into app.vacation_ledger (
    id, tenant_id, employee_id, bucket_year, entry_type, days, effective_date, absence_id,
    notice_id, reason, dedupe_key, created_by, created_at
  )
  select x.id, tenant, x."employeeId", x."bucketYear", x."entryType", x.days, x."effectiveDate",
         x."absenceId", x."noticeId", x.reason, x."dedupeKey", x."createdBy", x."createdAt"
    from jsonb_to_recordset(p_plan -> 'vacationLedger')
      as x (id uuid, "employeeId" uuid, "bucketYear" smallint, "entryType" app.vacation_entry_type,
            days numeric, "effectiveDate" date, "absenceId" uuid, "noticeId" uuid, reason text,
            "dedupeKey" text, "createdBy" uuid, "createdAt" timestamptz);

  insert into app.finding_acks (
    id, tenant_id, employee_id, work_date, rule_code, rule_version, note, created_by, created_at
  )
  select x.id, tenant, x."employeeId", x."workDate", x."ruleCode", x."ruleVersion", x.note,
         x."createdBy", x."createdAt"
    from jsonb_to_recordset(p_plan -> 'findingAcks')
      as x (id uuid, "employeeId" uuid, "workDate" date, "ruleCode" text, "ruleVersion" text,
            note text, "createdBy" uuid, "createdAt" timestamptz);

  insert into app.flex_bookings (
    id, tenant_id, employee_id, type, minutes, effective_date, reason, month_closing_id,
    created_by, created_at
  )
  select x.id, tenant, x."employeeId", x.type, x.minutes, x."effectiveDate", x.reason,
         x."monthClosingId", x."createdBy", x."createdAt"
    from jsonb_to_recordset(p_plan -> 'flexBookings')
      as x (id uuid, "employeeId" uuid, type app.flex_booking_type, minutes integer,
            "effectiveDate" date, reason text, "monthClosingId" uuid, "createdBy" uuid,
            "createdAt" timestamptz);

  for i in 0 .. jsonb_array_length(p_plan -> 'monthClosings') - 1 loop
    insert into app.month_closings (id, tenant_id, month, action, reason, snapshot, created_by, created_at)
    select x.id, tenant, x.month, x.action, x.reason, x.snapshot, x."createdBy", x."createdAt"
      from jsonb_to_record(p_plan -> 'monthClosings' -> i)
        as x (id uuid, month date, action app.month_closing_action, reason text, snapshot jsonb,
              "createdBy" uuid, "createdAt" timestamptz);
  end loop;
end;
$$;


--
-- Name: tenant_archive(uuid); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.tenant_archive(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: tenant_create(uuid, text, text, app.federal_state, text, text, bytea, app.workspace_kind, text, text); Type: FUNCTION; Schema: ops; Owner: -
--

CREATE FUNCTION ops.tenant_create(p_id uuid, p_name text, p_slug text, p_state app.federal_state, p_admin_email text, p_admin_name text, p_token_hash bytea, p_workspace app.workspace_kind DEFAULT 'company'::app.workspace_kind, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
    certificate_confirmed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT absence_requests_check CHECK ((end_date >= start_date)),
    CONSTRAINT absence_requests_check1 CHECK (((start_date < end_date) OR (NOT (half_day_start AND half_day_end)))),
    CONSTRAINT absence_requests_check2 CHECK (((status <> ALL (ARRAY['approved'::app.absence_status, 'rejected'::app.absence_status])) OR (decided_by IS NOT NULL) OR (type = 'sick'::app.absence_type))),
    CONSTRAINT absence_requests_check3 CHECK (((decided_by IS NULL) = (decided_at IS NULL))),
    CONSTRAINT absence_requests_check4 CHECK (((certificate_confirmed_at IS NULL) OR (type = 'sick'::app.absence_type))),
    CONSTRAINT absence_requests_check5 CHECK (((certificate_confirmed_at IS NULL) = (certificate_confirmed_by IS NULL)))
);

ALTER TABLE ONLY app.absence_requests FORCE ROW LEVEL SECURITY;


--
-- Name: billing_profiles; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.billing_profiles (
    tenant_id uuid NOT NULL,
    legal_name text NOT NULL,
    street text,
    postal_code text,
    city text,
    country_code character(2) DEFAULT 'DE'::bpchar NOT NULL,
    tax_number text,
    vat_id text,
    tax_profile app.tax_profile DEFAULT 'regular'::app.tax_profile NOT NULL,
    previous_year_revenue_cents bigint,
    iban text,
    bic text,
    bank_name text,
    contact_name text,
    contact_email public.citext,
    contact_phone text,
    register_court text,
    register_number text,
    invoice_prefix text DEFAULT ''::text NOT NULL,
    payment_terms_days smallint DEFAULT 14 NOT NULL,
    rounding_increment_min smallint DEFAULT 15 NOT NULL,
    rounding_mode app.rounding_mode DEFAULT 'up'::app.rounding_mode NOT NULL,
    default_format app.invoice_format DEFAULT 'pdf'::app.invoice_format NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_profiles_country_code_check CHECK ((country_code = 'DE'::bpchar)),
    CONSTRAINT billing_profiles_invoice_prefix_check CHECK ((invoice_prefix ~ '^[A-Z0-9-]{0,10}$'::text)),
    CONSTRAINT billing_profiles_legal_name_check CHECK ((btrim(legal_name) <> ''::text)),
    CONSTRAINT billing_profiles_payment_terms_days_check CHECK (((payment_terms_days >= 0) AND (payment_terms_days <= 120))),
    CONSTRAINT billing_profiles_rounding_increment_min_check CHECK ((rounding_increment_min = ANY (ARRAY[1, 5, 6, 10, 15, 30, 60]))),
    CONSTRAINT billing_profiles_vat_id_check CHECK ((vat_id ~ '^DE[0-9]{9}$'::text))
);

ALTER TABLE ONLY app.billing_profiles FORCE ROW LEVEL SECURITY;


--
-- Name: clients; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    number text,
    name text NOT NULL,
    street text,
    postal_code text,
    city text,
    country_code character(2) DEFAULT 'DE'::bpchar NOT NULL,
    is_business boolean DEFAULT true NOT NULL,
    vat_id text,
    email public.citext,
    buyer_reference text,
    invoice_locale text DEFAULT 'de'::text NOT NULL,
    payment_terms_days smallint,
    rounding_increment_min smallint,
    rounding_mode app.rounding_mode,
    archived_at timestamp with time zone,
    restricted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invoice_format app.invoice_format,
    CONSTRAINT clients_check CHECK (((restricted_at IS NULL) OR (archived_at IS NOT NULL))),
    CONSTRAINT clients_country_code_check CHECK ((country_code ~ '^[A-Z]{2}$'::text)),
    CONSTRAINT clients_invoice_locale_check CHECK ((invoice_locale = ANY (ARRAY['de'::text, 'en'::text]))),
    CONSTRAINT clients_name_check CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT clients_number_check CHECK ((btrim(number) <> ''::text)),
    CONSTRAINT clients_payment_terms_days_check CHECK (((payment_terms_days >= 0) AND (payment_terms_days <= 120))),
    CONSTRAINT clients_rounding_increment_min_check CHECK ((rounding_increment_min = ANY (ARRAY[1, 5, 6, 10, 15, 30, 60])))
);

ALTER TABLE ONLY app.clients FORCE ROW LEVEL SECURITY;


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
-- Name: invoice_counters; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.invoice_counters (
    tenant_id uuid NOT NULL,
    year smallint NOT NULL,
    last_seq integer NOT NULL,
    CONSTRAINT invoice_counters_last_seq_check CHECK ((last_seq > 0))
);

ALTER TABLE ONLY app.invoice_counters FORCE ROW LEVEL SECURITY;


--
-- Name: invoice_documents; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.invoice_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    format text NOT NULL,
    content bytea NOT NULL,
    sha256 bytea NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_documents_content_check CHECK (((octet_length(content) >= 1) AND (octet_length(content) <= 5242880))),
    CONSTRAINT invoice_documents_format_check CHECK ((format = ANY (ARRAY['pdf'::text, 'zugferd'::text, 'xrechnung_cii'::text, 'time_report_pdf'::text, 'time_report_csv'::text]))),
    CONSTRAINT invoice_documents_sha256_check CHECK ((octet_length(sha256) = 32))
);

ALTER TABLE ONLY app.invoice_documents FORCE ROW LEVEL SECURITY;


--
-- Name: invoice_line_entries; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.invoice_line_entries (
    tenant_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    line_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY app.invoice_line_entries FORCE ROW LEVEL SECURITY;


--
-- Name: invoice_lines; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.invoice_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    client_id uuid NOT NULL,
    "position" integer NOT NULL,
    kind app.invoice_line_kind NOT NULL,
    project_id uuid,
    task_id uuid,
    description text NOT NULL,
    service_from date,
    service_to date,
    minutes integer,
    quantity_milli bigint,
    unit text,
    unit_price_cents bigint NOT NULL,
    net_cents bigint NOT NULL,
    tax_category app.tax_category NOT NULL,
    tax_rate_bp smallint NOT NULL,
    derivation jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    exemption_reason text,
    CONSTRAINT invoice_lines_check CHECK (((kind = 'time'::app.invoice_line_kind) = (minutes IS NOT NULL))),
    CONSTRAINT invoice_lines_check1 CHECK (((kind = 'item'::app.invoice_line_kind) = (quantity_milli IS NOT NULL))),
    CONSTRAINT invoice_lines_check2 CHECK (((kind <> 'time'::app.invoice_line_kind) OR (project_id IS NOT NULL))),
    CONSTRAINT invoice_lines_check3 CHECK (((quantity_milli IS NULL) = (unit IS NULL))),
    CONSTRAINT invoice_lines_check4 CHECK (((tax_category = ANY (ARRAY['standard'::app.tax_category, 'reduced'::app.tax_category])) = (tax_rate_bp > 0))),
    CONSTRAINT invoice_lines_description_check CHECK ((btrim(description) <> ''::text)),
    CONSTRAINT invoice_lines_exemption_reason CHECK (((exemption_reason IS NULL) OR (tax_category = 'exempt'::app.tax_category))),
    CONSTRAINT invoice_lines_exemption_reason_text CHECK (((btrim(exemption_reason) <> ''::text) AND (char_length(exemption_reason) <= 200))),
    CONSTRAINT invoice_lines_minutes_range CHECK (((minutes >= '-10000000'::integer) AND (minutes <= 10000000))),
    CONSTRAINT invoice_lines_net_cents CHECK ((net_cents =
CASE kind
    WHEN 'time'::app.invoice_line_kind THEN app.round_div((minutes * unit_price_cents), (60)::bigint)
    ELSE app.round_div((quantity_milli * unit_price_cents), (1000)::bigint)
END)),
    CONSTRAINT invoice_lines_position_check CHECK (("position" > 0)),
    CONSTRAINT invoice_lines_price_range CHECK (((unit_price_cents >= '-1000000000'::integer) AND (unit_price_cents <= 1000000000))),
    CONSTRAINT invoice_lines_quantity_range CHECK (((quantity_milli >= '-1000000000'::integer) AND (quantity_milli <= 1000000000))),
    CONSTRAINT invoice_lines_tax_rate_bp_check CHECK (((tax_rate_bp >= 0) AND (tax_rate_bp <= 10000))),
    CONSTRAINT invoice_lines_unit_check CHECK ((unit = ANY (ARRAY['HUR'::text, 'DAY'::text, 'C62'::text, 'LS'::text])))
);

ALTER TABLE ONLY app.invoice_lines FORCE ROW LEVEL SECURITY;


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
-- Name: project_entries; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.project_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    project_id uuid NOT NULL,
    task_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    workday date GENERATED ALWAYS AS (((started_at AT TIME ZONE 'Europe/Berlin'::text))::date) STORED NOT NULL,
    note text,
    billable boolean,
    source app.project_entry_source NOT NULL,
    invoice_id uuid,
    voided_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_entries_check CHECK ((ended_at > started_at)),
    CONSTRAINT project_entries_check1 CHECK (((source <> 'manual'::app.project_entry_source) OR ((ended_at IS NOT NULL) AND (note IS NOT NULL)))),
    CONSTRAINT project_entries_check2 CHECK (((invoice_id IS NULL) OR ((ended_at IS NOT NULL) AND (voided_at IS NULL)))),
    CONSTRAINT project_entries_note_check CHECK ((btrim(note) <> ''::text))
);

ALTER TABLE ONLY app.project_entries FORCE ROW LEVEL SECURITY;


--
-- Name: project_members; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.project_members (
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY app.project_members FORCE ROW LEVEL SECURITY;


--
-- Name: projects; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    billable boolean DEFAULT true NOT NULL,
    budget_minutes integer,
    rounding_increment_min smallint,
    rounding_mode app.rounding_mode,
    open_to_all boolean DEFAULT true NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT projects_budget_minutes_check CHECK ((budget_minutes > 0)),
    CONSTRAINT projects_code_check CHECK ((btrim(code) <> ''::text)),
    CONSTRAINT projects_name_check CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT projects_rounding_increment_min_check CHECK ((rounding_increment_min = ANY (ARRAY[1, 5, 6, 10, 15, 30, 60])))
);

ALTER TABLE ONLY app.projects FORCE ROW LEVEL SECURITY;


--
-- Name: rates; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_id uuid,
    project_id uuid,
    task_id uuid,
    employee_id uuid,
    valid_from date NOT NULL,
    rate_cents bigint NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rates_check CHECK (((task_id IS NULL) OR (project_id IS NOT NULL))),
    CONSTRAINT rates_check1 CHECK (((project_id IS NULL) OR (client_id IS NOT NULL))),
    CONSTRAINT rates_rate_cents_check CHECK (((rate_cents >= 0) AND (rate_cents <= 10000000)))
);

ALTER TABLE ONLY app.rates FORCE ROW LEVEL SECURITY;


--
-- Name: tasks; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_id uuid NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    billable boolean,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasks_name_check CHECK ((btrim(name) <> ''::text))
);

ALTER TABLE ONLY app.tasks FORCE ROW LEVEL SECURITY;


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
    workspace app.workspace_kind DEFAULT 'company'::app.workspace_kind NOT NULL,
    sandbox_group uuid,
    CONSTRAINT tenants_carryover_until_check CHECK ((carryover_until ~ '^((0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-8])|(0[13-9]|1[0-2])-(29|30)|(0[13578]|1[02])-31)$'::text)),
    CONSTRAINT tenants_check CHECK (((kind = 'sandbox'::app.tenant_kind) = (expires_at IS NOT NULL))),
    CONSTRAINT tenants_flex_cap_minus_min_check CHECK ((flex_cap_minus_min >= 0)),
    CONSTRAINT tenants_flex_cap_plus_min_check CHECK ((flex_cap_plus_min >= 0)),
    CONSTRAINT tenants_holiday_options_check CHECK ((holiday_options <@ ARRAY['corpus_christi'::text, 'augsburg_peace'::text, 'assumption_day'::text])),
    CONSTRAINT tenants_name_check CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT tenants_sandbox_group_check CHECK (((sandbox_group IS NULL) OR (kind = 'sandbox'::app.tenant_kind))),
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
    CONSTRAINT log_source_check CHECK ((source = ANY (ARRAY['trigger'::text, 'app'::text, 'cli'::text])))
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
    last_failed_at timestamp with time zone,
    CONSTRAINT credentials_failed_count_check CHECK ((failed_count >= 0)),
    CONSTRAINT credentials_password_hash_check CHECK ((password_hash ~~ '$argon2id$%'::text))
);


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    token_hash bytea NOT NULL,
    user_id uuid NOT NULL,
    attempts smallint DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mfa_challenges_attempts_check CHECK (((attempts >= 0) AND (attempts <= 5))),
    CONSTRAINT mfa_challenges_token_hash_check CHECK ((octet_length(token_hash) = 32))
);


--
-- Name: passkeys; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.passkeys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    transports text[] DEFAULT '{}'::text[] NOT NULL,
    aaguid uuid,
    backed_up boolean DEFAULT false NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    CONSTRAINT passkeys_counter_check CHECK ((counter >= 0)),
    CONSTRAINT passkeys_credential_id_check CHECK (((octet_length(credential_id) >= 16) AND (octet_length(credential_id) <= 1023))),
    CONSTRAINT passkeys_name_check CHECK (((btrim(name) <> ''::text) AND (char_length(name) <= 80))),
    CONSTRAINT passkeys_public_key_check CHECK ((octet_length(public_key) > 0))
);


--
-- Name: recovery_codes; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.recovery_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code_hash bytea NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recovery_codes_code_hash_check CHECK ((octet_length(code_hash) = 32))
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
    reauth_at timestamp with time zone,
    enrollment_pending boolean DEFAULT false NOT NULL,
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
-- Name: totp; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.totp (
    user_id uuid NOT NULL,
    secret_enc bytea NOT NULL,
    key_version smallint NOT NULL,
    confirmed_at timestamp with time zone,
    last_used_step bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT totp_key_version_check CHECK ((key_version > 0)),
    CONSTRAINT totp_last_used_step_check CHECK ((last_used_step >= 0))
);


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge bytea NOT NULL,
    purpose auth.webauthn_purpose NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_check CHECK (((octet_length(challenge) >= 16) AND (octet_length(challenge) <= 64))),
    CONSTRAINT webauthn_challenges_check CHECK (((purpose = 'login'::auth.webauthn_purpose) = (user_id IS NULL)))
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

ALTER TABLE ONLY ops.demo_outbox FORCE ROW LEVEL SECURITY;


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
-- Name: absence_requests absence_requests_sick_no_overlap; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_requests
    ADD CONSTRAINT absence_requests_sick_no_overlap EXCLUDE USING gist (employee_id WITH =, daterange(start_date, end_date, '[]'::text) WITH &&) WHERE (((type = 'sick'::app.absence_type) AND (status = ANY (ARRAY['approved'::app.absence_status, 'cancel_pending'::app.absence_status]))));


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
-- Name: billing_profiles billing_profiles_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.billing_profiles
    ADD CONSTRAINT billing_profiles_pkey PRIMARY KEY (tenant_id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: clients clients_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.clients
    ADD CONSTRAINT clients_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: clients clients_tenant_id_number_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.clients
    ADD CONSTRAINT clients_tenant_id_number_key UNIQUE (tenant_id, number);


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
-- Name: invoice_counters invoice_counters_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_counters
    ADD CONSTRAINT invoice_counters_pkey PRIMARY KEY (tenant_id, year);


--
-- Name: invoice_documents invoice_documents_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_documents
    ADD CONSTRAINT invoice_documents_pkey PRIMARY KEY (id);


--
-- Name: invoice_documents invoice_documents_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_documents
    ADD CONSTRAINT invoice_documents_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: invoice_documents invoice_documents_tenant_id_invoice_id_format_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_documents
    ADD CONSTRAINT invoice_documents_tenant_id_invoice_id_format_key UNIQUE (tenant_id, invoice_id, format);


--
-- Name: invoice_line_entries invoice_line_entries_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_line_entries
    ADD CONSTRAINT invoice_line_entries_pkey PRIMARY KEY (line_id, entry_id);


--
-- Name: invoice_lines invoice_lines_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_pkey PRIMARY KEY (id);


--
-- Name: invoice_lines invoice_lines_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: invoice_lines invoice_lines_tenant_id_invoice_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_tenant_id_invoice_id_id_key UNIQUE (tenant_id, invoice_id, id);


--
-- Name: invoice_lines invoice_lines_tenant_id_invoice_id_position_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_tenant_id_invoice_id_position_key UNIQUE (tenant_id, invoice_id, "position") DEFERRABLE;


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_tenant_id_id_client_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_tenant_id_id_client_id_key UNIQUE (tenant_id, id, client_id);


--
-- Name: invoices invoices_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: invoices invoices_tenant_id_number_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_tenant_id_number_key UNIQUE (tenant_id, number);


--
-- Name: invoices invoices_tenant_id_number_year_number_seq_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_tenant_id_number_year_number_seq_key UNIQUE (tenant_id, number_year, number_seq);


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
-- Name: project_entries project_entries_no_overlap; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_entries
    ADD CONSTRAINT project_entries_no_overlap EXCLUDE USING gist (employee_id WITH =, tstzrange(started_at, ended_at, '[)'::text) WITH &&) WHERE ((voided_at IS NULL));


--
-- Name: project_entries project_entries_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_entries
    ADD CONSTRAINT project_entries_pkey PRIMARY KEY (id);


--
-- Name: project_entries project_entries_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_entries
    ADD CONSTRAINT project_entries_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: project_members project_members_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_members
    ADD CONSTRAINT project_members_pkey PRIMARY KEY (project_id, employee_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_tenant_id_client_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.projects
    ADD CONSTRAINT projects_tenant_id_client_id_id_key UNIQUE (tenant_id, client_id, id);


--
-- Name: projects projects_tenant_id_code_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.projects
    ADD CONSTRAINT projects_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: projects projects_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.projects
    ADD CONSTRAINT projects_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: rates rates_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.rates
    ADD CONSTRAINT rates_pkey PRIMARY KEY (id);


--
-- Name: rates rates_tenant_id_client_id_project_id_task_id_employee_id_va_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.rates
    ADD CONSTRAINT rates_tenant_id_client_id_project_id_task_id_employee_id_va_key UNIQUE NULLS NOT DISTINCT (tenant_id, client_id, project_id, task_id, employee_id, valid_from);


--
-- Name: rates rates_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.rates
    ADD CONSTRAINT rates_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_tenant_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.tasks
    ADD CONSTRAINT tasks_tenant_id_id_key UNIQUE (tenant_id, id);


--
-- Name: tasks tasks_tenant_id_project_id_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.tasks
    ADD CONSTRAINT tasks_tenant_id_project_id_id_key UNIQUE (tenant_id, project_id, id);


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
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (token_hash);


--
-- Name: passkeys passkeys_credential_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.passkeys
    ADD CONSTRAINT passkeys_credential_id_key UNIQUE (credential_id);


--
-- Name: passkeys passkeys_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.passkeys
    ADD CONSTRAINT passkeys_pkey PRIMARY KEY (id);


--
-- Name: recovery_codes recovery_codes_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.recovery_codes
    ADD CONSTRAINT recovery_codes_pkey PRIMARY KEY (id);


--
-- Name: recovery_codes recovery_codes_user_id_code_hash_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.recovery_codes
    ADD CONSTRAINT recovery_codes_user_id_code_hash_key UNIQUE (user_id, code_hash);


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
-- Name: totp totp_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.totp
    ADD CONSTRAINT totp_pkey PRIMARY KEY (user_id);


--
-- Name: webauthn_challenges webauthn_challenges_challenge_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_challenge_key UNIQUE (challenge);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


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
-- Name: invoice_line_entries_entry_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX invoice_line_entries_entry_idx ON app.invoice_line_entries USING btree (tenant_id, entry_id);


--
-- Name: invoice_line_entries_invoice_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX invoice_line_entries_invoice_idx ON app.invoice_line_entries USING btree (tenant_id, invoice_id);


--
-- Name: invoices_one_cancellation_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX invoices_one_cancellation_idx ON app.invoices USING btree (tenant_id, refers_to_id) WHERE (kind = 'cancellation'::app.invoice_kind);


--
-- Name: invoices_tenant_status_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX invoices_tenant_status_idx ON app.invoices USING btree (tenant_id, status);


--
-- Name: month_closings_month_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX month_closings_month_idx ON app.month_closings USING btree (tenant_id, month);


--
-- Name: project_entries_budget_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX project_entries_budget_idx ON app.project_entries USING btree (project_id) WHERE ((ended_at IS NOT NULL) AND (voided_at IS NULL));


--
-- Name: project_entries_employee_day_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX project_entries_employee_day_idx ON app.project_entries USING btree (tenant_id, employee_id, workday);


--
-- Name: project_entries_invoice_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX project_entries_invoice_idx ON app.project_entries USING btree (tenant_id, invoice_id) WHERE (invoice_id IS NOT NULL);


--
-- Name: project_entries_one_running_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX project_entries_one_running_idx ON app.project_entries USING btree (employee_id) WHERE ((ended_at IS NULL) AND (voided_at IS NULL));


--
-- Name: project_entries_unbilled_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX project_entries_unbilled_idx ON app.project_entries USING btree (tenant_id, project_id, workday) WHERE ((invoice_id IS NULL) AND (voided_at IS NULL) AND (ended_at IS NOT NULL));


--
-- Name: project_members_employee_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX project_members_employee_idx ON app.project_members USING btree (employee_id);


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
-- Name: log_ip_uncut_idx; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX log_ip_uncut_idx ON audit.log USING btree (occurred_at) WHERE (ip <> audit.ip_network(ip));


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
-- Name: mfa_challenges_user_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenges_user_idx ON auth.mfa_challenges USING btree (user_id);


--
-- Name: passkeys_user_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX passkeys_user_idx ON auth.passkeys USING btree (user_id);


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
-- Name: webauthn_challenges_expires_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_expires_idx ON auth.webauthn_challenges USING btree (expires_at);


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
-- Name: absence_days absence_days_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER absence_days_sandbox_quota AFTER INSERT ON app.absence_days REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('1500');


--
-- Name: absence_requests absence_requests_guard_status; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER absence_requests_guard_status BEFORE INSERT OR UPDATE ON app.absence_requests FOR EACH ROW EXECUTE FUNCTION app.guard_request_status();


--
-- Name: absence_requests absence_requests_period_lock; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER absence_requests_period_lock AFTER INSERT OR UPDATE OF status ON app.absence_requests FOR EACH ROW EXECUTE FUNCTION app.enforce_period_lock('start_date');


--
-- Name: absence_requests absence_requests_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER absence_requests_sandbox_quota AFTER INSERT ON app.absence_requests REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('250');


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
-- Name: billing_profiles audit_billing_profiles; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_billing_profiles AFTER INSERT OR DELETE OR UPDATE ON app.billing_profiles FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: clients audit_clients; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_clients AFTER INSERT OR DELETE OR UPDATE ON app.clients FOR EACH ROW EXECUTE FUNCTION audit.track();


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
-- Name: invoice_counters audit_invoice_counters; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_invoice_counters AFTER INSERT OR DELETE OR UPDATE ON app.invoice_counters FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: invoice_documents audit_invoice_documents; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_invoice_documents AFTER INSERT ON app.invoice_documents FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: invoice_line_entries audit_invoice_line_entries; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_invoice_line_entries AFTER INSERT OR DELETE OR UPDATE ON app.invoice_line_entries FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: invoice_lines audit_invoice_lines; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_invoice_lines AFTER INSERT OR DELETE OR UPDATE ON app.invoice_lines FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: invoices audit_invoices; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_invoices AFTER INSERT OR DELETE OR UPDATE ON app.invoices FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: month_closings audit_month_closings; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_month_closings AFTER INSERT OR DELETE OR UPDATE ON app.month_closings FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: project_entries audit_project_entries; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_project_entries AFTER INSERT OR DELETE OR UPDATE ON app.project_entries FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: project_members audit_project_members; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_project_members AFTER INSERT OR DELETE OR UPDATE ON app.project_members FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: projects audit_projects; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_projects AFTER INSERT OR DELETE OR UPDATE ON app.projects FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: rates audit_rates; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_rates AFTER INSERT OR DELETE OR UPDATE ON app.rates FOR EACH ROW EXECUTE FUNCTION audit.track();


--
-- Name: tasks audit_tasks; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER audit_tasks AFTER INSERT OR DELETE OR UPDATE ON app.tasks FOR EACH ROW EXECUTE FUNCTION audit.track();


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
-- Name: billing_profiles billing_profiles_guard; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER billing_profiles_guard BEFORE INSERT OR UPDATE ON app.billing_profiles FOR EACH ROW WHEN ((CURRENT_USER = 'zeit_app'::name)) EXECUTE FUNCTION app.guard_billing_profile();


--
-- Name: billing_profiles billing_profiles_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER billing_profiles_set_updated_at BEFORE UPDATE ON app.billing_profiles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: clients clients_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER clients_sandbox_quota AFTER INSERT ON app.clients REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('50');


--
-- Name: clients clients_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON app.clients FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: contracts contracts_check_start; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER contracts_check_start BEFORE INSERT ON app.contracts FOR EACH ROW EXECUTE FUNCTION app.check_contract_start();


--
-- Name: contracts contracts_period_lock; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER contracts_period_lock AFTER INSERT ON app.contracts FOR EACH ROW EXECUTE FUNCTION app.enforce_period_lock('valid_from');


--
-- Name: contracts contracts_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER contracts_sandbox_quota AFTER INSERT ON app.contracts REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('80');


--
-- Name: correction_requests correction_requests_guard_status; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER correction_requests_guard_status BEFORE INSERT OR UPDATE ON app.correction_requests FOR EACH ROW EXECUTE FUNCTION app.guard_request_status();


--
-- Name: correction_requests correction_requests_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER correction_requests_sandbox_quota AFTER INSERT ON app.correction_requests REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('200');


--
-- Name: correction_requests correction_requests_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER correction_requests_set_updated_at BEFORE UPDATE ON app.correction_requests FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: employees employees_guard_solo; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER employees_guard_solo BEFORE INSERT OR UPDATE ON app.employees FOR EACH ROW EXECUTE FUNCTION app.guard_solo_members();


--
-- Name: employees employees_inherit_closed_through; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER employees_inherit_closed_through BEFORE INSERT ON app.employees FOR EACH ROW EXECUTE FUNCTION app.inherit_closed_through();


--
-- Name: employees employees_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER employees_sandbox_quota AFTER INSERT ON app.employees REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('50');


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
-- Name: flex_bookings flex_bookings_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER flex_bookings_sandbox_quota AFTER INSERT ON app.flex_bookings REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('200');


--
-- Name: invoice_documents invoice_documents_append_only; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER invoice_documents_append_only BEFORE DELETE OR UPDATE ON app.invoice_documents FOR EACH ROW EXECUTE FUNCTION app.reject_change();


--
-- Name: invoice_documents invoice_documents_guard; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER invoice_documents_guard BEFORE INSERT ON app.invoice_documents FOR EACH ROW EXECUTE FUNCTION app.guard_invoice_document();


--
-- Name: invoice_documents invoice_documents_no_truncate; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER invoice_documents_no_truncate BEFORE TRUNCATE ON app.invoice_documents FOR EACH STATEMENT EXECUTE FUNCTION app.reject_change();


--
-- Name: invoice_line_entries invoice_line_entries_guard; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER invoice_line_entries_guard BEFORE INSERT OR DELETE OR UPDATE ON app.invoice_line_entries FOR EACH ROW EXECUTE FUNCTION app.guard_invoice_child();


--
-- Name: invoice_lines invoice_lines_guard; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER invoice_lines_guard BEFORE INSERT OR DELETE OR UPDATE ON app.invoice_lines FOR EACH ROW EXECUTE FUNCTION app.guard_invoice_child();


--
-- Name: invoice_lines invoice_lines_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER invoice_lines_sandbox_quota AFTER INSERT ON app.invoice_lines REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> ALL (ARRAY['zeit_system'::name, 'zeit_owner'::name]))) EXECUTE FUNCTION app.sandbox_quota('2000');


--
-- Name: invoices invoices_guard; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER invoices_guard BEFORE DELETE OR UPDATE ON app.invoices FOR EACH ROW EXECUTE FUNCTION app.guard_invoice();


--
-- Name: invoices invoices_mark_specimen; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER invoices_mark_specimen BEFORE INSERT ON app.invoices FOR EACH ROW EXECUTE FUNCTION app.mark_specimen();


--
-- Name: invoices invoices_no_truncate; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER invoices_no_truncate BEFORE TRUNCATE ON app.invoices FOR EACH STATEMENT EXECUTE FUNCTION app.reject_change();


--
-- Name: invoices invoices_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER invoices_sandbox_quota AFTER INSERT ON app.invoices REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> ALL (ARRAY['zeit_system'::name, 'zeit_owner'::name]))) EXECUTE FUNCTION app.sandbox_quota('80');


--
-- Name: invoices invoices_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON app.invoices FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


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
-- Name: month_closings month_closings_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER month_closings_sandbox_quota AFTER INSERT ON app.month_closings REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('60');


--
-- Name: project_entries project_entries_guard; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER project_entries_guard BEFORE INSERT OR DELETE OR UPDATE ON app.project_entries FOR EACH ROW EXECUTE FUNCTION app.guard_project_entry();


--
-- Name: project_entries project_entries_guard_invoice; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER project_entries_guard_invoice BEFORE INSERT OR UPDATE OF invoice_id ON app.project_entries FOR EACH ROW EXECUTE FUNCTION app.guard_project_entry_invoice();


--
-- Name: project_entries project_entries_no_truncate; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER project_entries_no_truncate BEFORE TRUNCATE ON app.project_entries FOR EACH STATEMENT EXECUTE FUNCTION app.reject_change();


--
-- Name: project_entries project_entries_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER project_entries_sandbox_quota AFTER INSERT ON app.project_entries REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('20000');


--
-- Name: project_entries project_entries_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER project_entries_set_updated_at BEFORE UPDATE ON app.project_entries FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: project_members project_members_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER project_members_sandbox_quota AFTER INSERT ON app.project_members REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('1500');


--
-- Name: projects projects_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER projects_sandbox_quota AFTER INSERT ON app.projects REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('100');


--
-- Name: projects projects_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON app.projects FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: rates rates_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER rates_sandbox_quota AFTER INSERT ON app.rates REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('200');


--
-- Name: tasks tasks_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER tasks_sandbox_quota AFTER INSERT ON app.tasks REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('300');


--
-- Name: tasks tasks_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON app.tasks FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: teams teams_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER teams_sandbox_quota AFTER INSERT ON app.teams REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('20');


--
-- Name: teams teams_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON app.teams FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: tenants tenants_guard_delete; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER tenants_guard_delete BEFORE DELETE ON app.tenants FOR EACH ROW EXECUTE FUNCTION app.guard_tenant_delete();


--
-- Name: tenants tenants_guard_retention; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER tenants_guard_retention BEFORE DELETE ON app.tenants FOR EACH ROW EXECUTE FUNCTION app.guard_tenant_retention();


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
-- Name: time_entries time_entries_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER time_entries_sandbox_quota AFTER INSERT ON app.time_entries REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('20000');


--
-- Name: users users_guard_own; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER users_guard_own BEFORE UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION app.guard_own_user();


--
-- Name: users users_guard_solo; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER users_guard_solo BEFORE INSERT OR UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION app.guard_solo_members();


--
-- Name: users users_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER users_sandbox_quota AFTER INSERT ON app.users REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('60');


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
-- Name: vacation_ledger vacation_ledger_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER vacation_ledger_sandbox_quota AFTER INSERT ON app.vacation_ledger REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('400');


--
-- Name: vacation_notices vacation_notices_append_only; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER vacation_notices_append_only BEFORE DELETE ON app.vacation_notices FOR EACH ROW EXECUTE FUNCTION app.reject_change();


--
-- Name: vacation_notices vacation_notices_no_truncate; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER vacation_notices_no_truncate BEFORE TRUNCATE ON app.vacation_notices FOR EACH STATEMENT EXECUTE FUNCTION app.reject_change();


--
-- Name: work_models work_models_sandbox_quota; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER work_models_sandbox_quota AFTER INSERT ON app.work_models REFERENCING NEW TABLE AS added FOR EACH STATEMENT WHEN ((CURRENT_USER <> 'zeit_owner'::name)) EXECUTE FUNCTION app.sandbox_quota('20');


--
-- Name: work_models work_models_set_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER work_models_set_updated_at BEFORE UPDATE ON app.work_models FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();


--
-- Name: log log_append_only; Type: TRIGGER; Schema: audit; Owner: -
--

CREATE TRIGGER log_append_only BEFORE DELETE ON audit.log FOR EACH ROW EXECUTE FUNCTION app.reject_change();


--
-- Name: log log_guard_update; Type: TRIGGER; Schema: audit; Owner: -
--

CREATE TRIGGER log_guard_update BEFORE UPDATE ON audit.log FOR EACH ROW EXECUTE FUNCTION audit.guard_log();


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
-- Name: absence_requests absence_requests_tenant_id_certificate_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.absence_requests
    ADD CONSTRAINT absence_requests_tenant_id_certificate_confirmed_by_fkey FOREIGN KEY (tenant_id, certificate_confirmed_by) REFERENCES app.users(tenant_id, id);


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
-- Name: billing_profiles billing_profiles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.billing_profiles
    ADD CONSTRAINT billing_profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: clients clients_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.clients
    ADD CONSTRAINT clients_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


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
-- Name: invoice_counters invoice_counters_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_counters
    ADD CONSTRAINT invoice_counters_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: invoice_documents invoice_documents_tenant_id_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_documents
    ADD CONSTRAINT invoice_documents_tenant_id_created_by_fkey FOREIGN KEY (tenant_id, created_by) REFERENCES app.users(tenant_id, id);


--
-- Name: invoice_documents invoice_documents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_documents
    ADD CONSTRAINT invoice_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: invoice_documents invoice_documents_tenant_id_invoice_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_documents
    ADD CONSTRAINT invoice_documents_tenant_id_invoice_id_fkey FOREIGN KEY (tenant_id, invoice_id) REFERENCES app.invoices(tenant_id, id) ON DELETE CASCADE;


--
-- Name: invoice_line_entries invoice_line_entries_tenant_id_entry_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_line_entries
    ADD CONSTRAINT invoice_line_entries_tenant_id_entry_id_fkey FOREIGN KEY (tenant_id, entry_id) REFERENCES app.project_entries(tenant_id, id);


--
-- Name: invoice_line_entries invoice_line_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_line_entries
    ADD CONSTRAINT invoice_line_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: invoice_line_entries invoice_line_entries_tenant_id_invoice_id_line_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_line_entries
    ADD CONSTRAINT invoice_line_entries_tenant_id_invoice_id_line_id_fkey FOREIGN KEY (tenant_id, invoice_id, line_id) REFERENCES app.invoice_lines(tenant_id, invoice_id, id) ON DELETE CASCADE;


--
-- Name: invoice_lines invoice_lines_tenant_id_client_id_project_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_tenant_id_client_id_project_id_fkey FOREIGN KEY (tenant_id, client_id, project_id) REFERENCES app.projects(tenant_id, client_id, id);


--
-- Name: invoice_lines invoice_lines_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: invoice_lines invoice_lines_tenant_id_invoice_id_client_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_tenant_id_invoice_id_client_id_fkey FOREIGN KEY (tenant_id, invoice_id, client_id) REFERENCES app.invoices(tenant_id, id, client_id) ON DELETE CASCADE;


--
-- Name: invoice_lines invoice_lines_tenant_id_project_id_task_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoice_lines
    ADD CONSTRAINT invoice_lines_tenant_id_project_id_task_id_fkey FOREIGN KEY (tenant_id, project_id, task_id) REFERENCES app.tasks(tenant_id, project_id, id);


--
-- Name: invoices invoices_tenant_id_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_tenant_id_cancelled_by_fkey FOREIGN KEY (tenant_id, cancelled_by) REFERENCES app.users(tenant_id, id);


--
-- Name: invoices invoices_tenant_id_client_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_tenant_id_client_id_fkey FOREIGN KEY (tenant_id, client_id) REFERENCES app.clients(tenant_id, id);


--
-- Name: invoices invoices_tenant_id_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_tenant_id_created_by_fkey FOREIGN KEY (tenant_id, created_by) REFERENCES app.users(tenant_id, id);


--
-- Name: invoices invoices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_tenant_id_issued_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_tenant_id_issued_by_fkey FOREIGN KEY (tenant_id, issued_by) REFERENCES app.users(tenant_id, id);


--
-- Name: invoices invoices_tenant_id_refers_to_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.invoices
    ADD CONSTRAINT invoices_tenant_id_refers_to_id_fkey FOREIGN KEY (tenant_id, refers_to_id) REFERENCES app.invoices(tenant_id, id);


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
-- Name: project_entries project_entries_invoice_fk; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_entries
    ADD CONSTRAINT project_entries_invoice_fk FOREIGN KEY (tenant_id, invoice_id) REFERENCES app.invoices(tenant_id, id) ON DELETE SET NULL (invoice_id);


--
-- Name: project_entries project_entries_tenant_id_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_entries
    ADD CONSTRAINT project_entries_tenant_id_created_by_fkey FOREIGN KEY (tenant_id, created_by) REFERENCES app.users(tenant_id, id);


--
-- Name: project_entries project_entries_tenant_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_entries
    ADD CONSTRAINT project_entries_tenant_id_employee_id_fkey FOREIGN KEY (tenant_id, employee_id) REFERENCES app.employees(tenant_id, id);


--
-- Name: project_entries project_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_entries
    ADD CONSTRAINT project_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: project_entries project_entries_tenant_id_project_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_entries
    ADD CONSTRAINT project_entries_tenant_id_project_id_fkey FOREIGN KEY (tenant_id, project_id) REFERENCES app.projects(tenant_id, id);


--
-- Name: project_entries project_entries_tenant_id_project_id_task_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_entries
    ADD CONSTRAINT project_entries_tenant_id_project_id_task_id_fkey FOREIGN KEY (tenant_id, project_id, task_id) REFERENCES app.tasks(tenant_id, project_id, id);


--
-- Name: project_members project_members_tenant_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_members
    ADD CONSTRAINT project_members_tenant_id_employee_id_fkey FOREIGN KEY (tenant_id, employee_id) REFERENCES app.employees(tenant_id, id) ON DELETE CASCADE;


--
-- Name: project_members project_members_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_members
    ADD CONSTRAINT project_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: project_members project_members_tenant_id_project_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.project_members
    ADD CONSTRAINT project_members_tenant_id_project_id_fkey FOREIGN KEY (tenant_id, project_id) REFERENCES app.projects(tenant_id, id) ON DELETE CASCADE;


--
-- Name: projects projects_tenant_id_client_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.projects
    ADD CONSTRAINT projects_tenant_id_client_id_fkey FOREIGN KEY (tenant_id, client_id) REFERENCES app.clients(tenant_id, id);


--
-- Name: projects projects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.projects
    ADD CONSTRAINT projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: rates rates_tenant_id_client_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.rates
    ADD CONSTRAINT rates_tenant_id_client_id_fkey FOREIGN KEY (tenant_id, client_id) REFERENCES app.clients(tenant_id, id);


--
-- Name: rates rates_tenant_id_client_id_project_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.rates
    ADD CONSTRAINT rates_tenant_id_client_id_project_id_fkey FOREIGN KEY (tenant_id, client_id, project_id) REFERENCES app.projects(tenant_id, client_id, id);


--
-- Name: rates rates_tenant_id_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.rates
    ADD CONSTRAINT rates_tenant_id_created_by_fkey FOREIGN KEY (tenant_id, created_by) REFERENCES app.users(tenant_id, id);


--
-- Name: rates rates_tenant_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.rates
    ADD CONSTRAINT rates_tenant_id_employee_id_fkey FOREIGN KEY (tenant_id, employee_id) REFERENCES app.employees(tenant_id, id);


--
-- Name: rates rates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.rates
    ADD CONSTRAINT rates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


--
-- Name: rates rates_tenant_id_project_id_task_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.rates
    ADD CONSTRAINT rates_tenant_id_project_id_task_id_fkey FOREIGN KEY (tenant_id, project_id, task_id) REFERENCES app.tasks(tenant_id, project_id, id);


--
-- Name: tasks tasks_tenant_id_client_id_project_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.tasks
    ADD CONSTRAINT tasks_tenant_id_client_id_project_id_fkey FOREIGN KEY (tenant_id, client_id, project_id) REFERENCES app.projects(tenant_id, client_id, id);


--
-- Name: tasks tasks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.tasks
    ADD CONSTRAINT tasks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;


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
-- Name: mfa_challenges mfa_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: passkeys passkeys_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.passkeys
    ADD CONSTRAINT passkeys_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: recovery_codes recovery_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.recovery_codes
    ADD CONSTRAINT recovery_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


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
-- Name: totp totp_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.totp
    ADD CONSTRAINT totp_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


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
-- Name: billing_profiles admins add billing profile; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "admins add billing profile" ON app.billing_profiles FOR INSERT TO zeit_app WITH CHECK ((( SELECT app.role() AS role) = 'admin'::app.user_role));


--
-- Name: tenants admins change the tenant; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "admins change the tenant" ON app.tenants FOR UPDATE TO zeit_app USING ((( SELECT app.role() AS role) = 'admin'::app.user_role));


--
-- Name: users admins manage users; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "admins manage users" ON app.users TO zeit_app USING ((( SELECT app.role() AS role) = 'admin'::app.user_role));


--
-- Name: billing_profiles admins update billing profile; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "admins update billing profile" ON app.billing_profiles FOR UPDATE TO zeit_app USING ((( SELECT app.role() AS role) = 'admin'::app.user_role)) WITH CHECK ((( SELECT app.role() AS role) = 'admin'::app.user_role));


--
-- Name: billing_profiles; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.billing_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: project_entries book own project entries; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "book own project entries" ON app.project_entries FOR INSERT TO zeit_app WITH CHECK (((employee_id = ( SELECT app.employee_id() AS employee_id)) AND (invoice_id IS NULL)));


--
-- Name: clients; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: absence_days company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.absence_days AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: absence_requests company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.absence_requests AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: contracts company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.contracts AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: correction_requests company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.correction_requests AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: finding_acks company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.finding_acks AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: flex_bookings company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.flex_bookings AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: month_closings company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.month_closings AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: team_leads company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.team_leads AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: teams company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.teams AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: time_entries company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.time_entries AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: vacation_ledger company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.vacation_ledger AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: vacation_notices company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.vacation_notices AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: work_models company workspace; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "company workspace" ON app.work_models AS RESTRICTIVE TO zeit_app USING ((( SELECT app.workspace() AS workspace) = 'company'::app.workspace_kind));


--
-- Name: contracts; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: correction_requests; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.correction_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: project_entries edit own project entries; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "edit own project entries" ON app.project_entries FOR UPDATE TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id))) WITH CHECK ((employee_id = ( SELECT app.employee_id() AS employee_id)));


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
-- Name: rates hr adds rates; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr adds rates" ON app.rates FOR INSERT TO zeit_app WITH CHECK ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


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
-- Name: clients hr manages clients; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages clients" ON app.clients TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


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
-- Name: invoice_line_entries hr manages invoice line entries; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages invoice line entries" ON app.invoice_line_entries TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: invoice_lines hr manages invoice lines; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages invoice lines" ON app.invoice_lines TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: invoices hr manages invoices; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages invoices" ON app.invoices TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: project_entries hr manages project entries; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages project entries" ON app.project_entries TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: project_members hr manages project members; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages project members" ON app.project_members TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: projects hr manages projects; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages projects" ON app.projects TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: tasks hr manages tasks; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr manages tasks" ON app.tasks TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


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
-- Name: billing_profiles hr reads billing profile; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr reads billing profile" ON app.billing_profiles FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: month_closings hr reads closings; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr reads closings" ON app.month_closings FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: contracts hr reads contracts; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr reads contracts" ON app.contracts FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: invoice_counters hr reads invoice counters; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr reads invoice counters" ON app.invoice_counters FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: invoice_documents hr reads invoice documents; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr reads invoice documents" ON app.invoice_documents FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: vacation_notices hr reads notices; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr reads notices" ON app.vacation_notices FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: rates hr reads rates; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr reads rates" ON app.rates FOR SELECT TO zeit_app USING ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: contracts hr removes future contracts; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr removes future contracts" ON app.contracts FOR DELETE TO zeit_app USING (((( SELECT app.role() AS role) >= 'hr'::app.user_role) AND (valid_from > ((now() AT TIME ZONE 'Europe/Berlin'::text))::date)));


--
-- Name: rates hr removes future rates; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr removes future rates" ON app.rates FOR DELETE TO zeit_app USING (((( SELECT app.role() AS role) >= 'hr'::app.user_role) AND (valid_from > ((now() AT TIME ZONE 'Europe/Berlin'::text))::date)));


--
-- Name: vacation_notices hr sends notices; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "hr sends notices" ON app.vacation_notices FOR INSERT TO zeit_app WITH CHECK ((( SELECT app.role() AS role) >= 'hr'::app.user_role));


--
-- Name: invoice_counters; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.invoice_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_documents; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.invoice_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_line_entries; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.invoice_line_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_lines; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.invoice_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: time_entries leads apply corrections; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads apply corrections" ON app.time_entries FOR INSERT TO zeit_app WITH CHECK (((source = 'correction'::app.entry_source) AND app.leads(employee_id)));


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
-- Name: project_entries leads read their team's project entries; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads read their team's project entries" ON app.project_entries FOR SELECT TO zeit_app USING (app.leads(employee_id));


--
-- Name: time_entries leads void entries; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "leads void entries" ON app.time_entries FOR UPDATE TO zeit_app USING (app.leads(employee_id));


--
-- Name: absence_days manage own absence days; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "manage own absence days" ON app.absence_days TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id)));


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
-- Name: project_entries; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.project_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: project_members; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.project_members ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: rates; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.rates ENABLE ROW LEVEL SECURITY;

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
-- Name: project_entries read own project entries; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "read own project entries" ON app.project_entries FOR SELECT TO zeit_app USING ((employee_id = ( SELECT app.employee_id() AS employee_id)));


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
-- Name: tasks; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.tasks ENABLE ROW LEVEL SECURITY;

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
-- Name: billing_profiles tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.billing_profiles AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: clients tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.clients AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


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
-- Name: invoice_counters tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.invoice_counters AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: invoice_documents tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.invoice_documents AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: invoice_line_entries tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.invoice_line_entries AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: invoice_lines tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.invoice_lines AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: invoices tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.invoices AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: month_closings tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.month_closings AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: project_entries tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.project_entries AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: project_members tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.project_members AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: projects tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.projects AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: rates tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.rates AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: tasks tenant fence; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "tenant fence" ON app.tasks AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


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

CREATE POLICY "hr and admins read the trail" ON audit.log FOR SELECT TO zeit_app USING (((( SELECT app.role() AS role) = 'admin'::app.user_role) OR ((( SELECT app.role() AS role) = 'hr'::app.user_role) AND (table_name <> ALL (ARRAY['invoices'::text, 'invoice_lines'::text, 'invoice_line_entries'::text, 'invoice_documents'::text, 'invoice_counters'::text, 'rates'::text, 'clients'::text, 'billing_profiles'::text])))));


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
-- Name: demo_outbox; Type: ROW SECURITY; Schema: ops; Owner: -
--

ALTER TABLE ops.demo_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: demo_outbox members read the outbox; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY "members read the outbox" ON ops.demo_outbox FOR SELECT TO zeit_app USING (true);


--
-- Name: demo_outbox tenant fence; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY "tenant fence" ON ops.demo_outbox AS RESTRICTIVE TO zeit_app USING ((tenant_id = ( SELECT app.tenant_id() AS tenant_id)));


--
-- Name: demo_outbox the app posts mail; Type: POLICY; Schema: ops; Owner: -
--

CREATE POLICY "the app posts mail" ON ops.demo_outbox FOR INSERT TO zeit_app WITH CHECK (true);


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
    ('20260924000400'),
    ('20260924000500'),
    ('20260924000600'),
    ('20260924000700'),
    ('20260924000800'),
    ('20260925000000'),
    ('20260925000100'),
    ('20260925000200'),
    ('20260925000300'),
    ('20260925000400'),
    ('20260925000500'),
    ('20260925000600'),
    ('20260925000700'),
    ('20260926000000'),
    ('20260926000100'),
    ('20260926000110'),
    ('20260926000120'),
    ('20260926000200'),
    ('20260926000900'),
    ('20260926000910'),
    ('20260926000920'),
    ('20260926000930'),
    ('20260926000940'),
    ('20260926000950'),
    ('20260926000960'),
    ('20260926000970'),
    ('20260926000980'),
    ('20260926001000'),
    ('20260926001100'),
    ('20260926001101'),
    ('20260926001102'),
    ('20260926001103'),
    ('20260926001104'),
    ('20260926001105'),
    ('20260926001106'),
    ('20260926001200'),
    ('20260926001300'),
    ('20260926001301'),
    ('20260926001302'),
    ('20260926001303'),
    ('20260926001304'),
    ('20260926001305'),
    ('20260926001306'),
    ('20260926001307'),
    ('20260926001308');
