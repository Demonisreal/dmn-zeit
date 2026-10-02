-- migrate:up
create function app.sandbox_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

grant select (tenant_id) on
  app.time_entries, app.vacation_ledger, app.flex_bookings, app.contracts, app.work_models
to zeit_system;

grant create on schema app to zeit_system;
alter function app.sandbox_quota() owner to zeit_system;
revoke create on schema app from zeit_system;
revoke all on function app.sandbox_quota() from public;

create trigger time_entries_sandbox_quota
  after insert on app.time_entries referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(20000);

create trigger correction_requests_sandbox_quota
  after insert on app.correction_requests referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(200);

create trigger absence_requests_sandbox_quota
  after insert on app.absence_requests referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(250);

create trigger absence_days_sandbox_quota
  after insert on app.absence_days referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(1500);

create trigger vacation_ledger_sandbox_quota
  after insert on app.vacation_ledger referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(400);

create trigger flex_bookings_sandbox_quota
  after insert on app.flex_bookings referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(200);

create trigger month_closings_sandbox_quota
  after insert on app.month_closings referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(60);

create trigger employees_sandbox_quota
  after insert on app.employees referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(50);

create trigger users_sandbox_quota
  after insert on app.users referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(60);

create trigger contracts_sandbox_quota
  after insert on app.contracts referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(80);

create trigger teams_sandbox_quota
  after insert on app.teams referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(20);

create trigger work_models_sandbox_quota
  after insert on app.work_models referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(20);

-- migrate:down
drop trigger work_models_sandbox_quota on app.work_models;
drop trigger teams_sandbox_quota on app.teams;
drop trigger contracts_sandbox_quota on app.contracts;
drop trigger users_sandbox_quota on app.users;
drop trigger employees_sandbox_quota on app.employees;
drop trigger month_closings_sandbox_quota on app.month_closings;
drop trigger flex_bookings_sandbox_quota on app.flex_bookings;
drop trigger vacation_ledger_sandbox_quota on app.vacation_ledger;
drop trigger absence_days_sandbox_quota on app.absence_days;
drop trigger absence_requests_sandbox_quota on app.absence_requests;
drop trigger correction_requests_sandbox_quota on app.correction_requests;
drop trigger time_entries_sandbox_quota on app.time_entries;

drop function app.sandbox_quota();

revoke select (tenant_id) on
  app.time_entries, app.vacation_ledger, app.flex_bookings, app.contracts, app.work_models
from zeit_system;
