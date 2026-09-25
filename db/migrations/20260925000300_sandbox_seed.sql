-- migrate:up
create or replace function audit.track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

  -- the seed runs in the transaction that creates the sandbox; in here current_user is zeit_system for everyone
  if exists (
    select 1 from app.tenants t where t.id = tenant and t.kind = 'sandbox' and t.created_at = now()
  ) then
    return null;
  end if;

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

-- takes the DemoPlan of @zeit/demo-data as it is, the tenant it writes into is always a new one
create function ops.sandbox_seed(p_plan jsonb, p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  -- every persona speaks the language the visitor started the demo in
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

  -- guard_request_status only lets a request in as pending and then walks it along its transitions
  update app.correction_requests c
     set status = x.status, decided_by = x."decidedBy", decided_at = x."decidedAt"
    from jsonb_to_recordset(p_plan -> 'corrections')
      as x (id uuid, status app.correction_status, "decidedBy" uuid, "decidedAt" timestamptz)
   where c.tenant_id = tenant and c.id = x.id and x.status <> 'pending';

  -- settled ones first, the overlap constraints only see open and approved requests
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

    -- cancel_pending and cancelled go through approved first
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

  -- the cap_forfeit booking points at a closing that follows below, the foreign key is deferred
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

  -- one statement per month, apply_month_closing counts the rows of its own statement as closed
  for i in 0 .. jsonb_array_length(p_plan -> 'monthClosings') - 1 loop
    insert into app.month_closings (id, tenant_id, month, action, reason, snapshot, created_by, created_at)
    select x.id, tenant, x.month, x.action, x.reason, x.snapshot, x."createdBy", x."createdAt"
      from jsonb_to_record(p_plan -> 'monthClosings' -> i)
        as x (id uuid, month date, action app.month_closing_action, reason text, snapshot jsonb,
              "createdBy" uuid, "createdAt" timestamptz);
  end loop;
end;
$$;

grant insert on
  app.teams, app.work_models, app.employees, app.team_leads, app.contracts, app.time_entries,
  app.correction_requests, app.absence_requests, app.absence_days, app.vacation_notices,
  app.vacation_ledger, app.finding_acks, app.flex_bookings, app.month_closings
to zeit_system;
grant select (id, tenant_id), update (status, decided_by, decided_at) on app.correction_requests to zeit_system;
grant update (status, decided_by, decided_at, decision_note) on app.absence_requests to zeit_system;
-- for the call to ops.sandbox_create
grant usage on schema ops to zeit_system;

grant create on schema ops to zeit_system;
alter function ops.sandbox_seed(jsonb, text) owner to zeit_system;
revoke create on schema ops from zeit_system;

revoke all on function ops.sandbox_seed(jsonb, text) from public;
grant execute on function ops.sandbox_seed(jsonb, text) to zeit_app;

-- migrate:down
drop function ops.sandbox_seed(jsonb, text);

revoke usage on schema ops from zeit_system;
revoke update (status, decided_by, decided_at, decision_note) on app.absence_requests from zeit_system;
revoke select (id, tenant_id), update (status, decided_by, decided_at) on app.correction_requests from zeit_system;
revoke insert on
  app.teams, app.work_models, app.employees, app.team_leads, app.contracts, app.time_entries,
  app.correction_requests, app.absence_requests, app.absence_days, app.vacation_notices,
  app.vacation_ledger, app.finding_acks, app.flex_bookings, app.month_closings
from zeit_system;

create or replace function audit.track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
