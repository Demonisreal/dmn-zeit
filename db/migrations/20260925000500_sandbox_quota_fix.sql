-- migrate:up
create or replace function audit.track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
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

create or replace trigger time_entries_sandbox_quota
  after insert on app.time_entries referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(20000);

create or replace trigger correction_requests_sandbox_quota
  after insert on app.correction_requests referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(200);

create or replace trigger absence_requests_sandbox_quota
  after insert on app.absence_requests referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(250);

create or replace trigger absence_days_sandbox_quota
  after insert on app.absence_days referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(1500);

create or replace trigger vacation_ledger_sandbox_quota
  after insert on app.vacation_ledger referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(400);

create or replace trigger flex_bookings_sandbox_quota
  after insert on app.flex_bookings referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(200);

create or replace trigger month_closings_sandbox_quota
  after insert on app.month_closings referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(60);

create or replace trigger employees_sandbox_quota
  after insert on app.employees referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(50);

create or replace trigger users_sandbox_quota
  after insert on app.users referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(60);

create or replace trigger contracts_sandbox_quota
  after insert on app.contracts referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(80);

create or replace trigger teams_sandbox_quota
  after insert on app.teams referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(20);

create or replace trigger work_models_sandbox_quota
  after insert on app.work_models referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(20);

-- migrate:down
create or replace trigger work_models_sandbox_quota
  after insert on app.work_models referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(20);

create or replace trigger teams_sandbox_quota
  after insert on app.teams referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(20);

create or replace trigger contracts_sandbox_quota
  after insert on app.contracts referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(80);

create or replace trigger users_sandbox_quota
  after insert on app.users referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(60);

create or replace trigger employees_sandbox_quota
  after insert on app.employees referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(50);

create or replace trigger month_closings_sandbox_quota
  after insert on app.month_closings referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(60);

create or replace trigger flex_bookings_sandbox_quota
  after insert on app.flex_bookings referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(200);

create or replace trigger vacation_ledger_sandbox_quota
  after insert on app.vacation_ledger referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(400);

create or replace trigger absence_days_sandbox_quota
  after insert on app.absence_days referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(1500);

create or replace trigger absence_requests_sandbox_quota
  after insert on app.absence_requests referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(250);

create or replace trigger correction_requests_sandbox_quota
  after insert on app.correction_requests referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(200);

create or replace trigger time_entries_sandbox_quota
  after insert on app.time_entries referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(20000);

create or replace function audit.track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
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

  if exists (
    select 1 from app.tenants t where t.id = tenant and t.kind = 'sandbox' and t.created_at = now()
  ) then
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
