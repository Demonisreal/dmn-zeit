-- migrate:up
create table app.teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table app.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  personnel_no text not null check (btrim(personnel_no) <> ''),
  first_name text not null check (btrim(first_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  team_id uuid,
  entry_date date not null,
  exit_date date,
  closed_through date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, personnel_no),
  foreign key (tenant_id, team_id) references app.teams (tenant_id, id),
  check (exit_date >= entry_date)
);

create index employees_team_idx on app.employees (tenant_id, team_id);

alter table app.users add constraint users_employee_fkey
  foreign key (tenant_id, employee_id) references app.employees (tenant_id, id);

create table app.team_leads (
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  team_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id),
  foreign key (tenant_id, team_id) references app.teams (tenant_id, id) on delete cascade,
  foreign key (tenant_id, user_id) references app.users (tenant_id, id) on delete cascade
);

create index team_leads_user_idx on app.team_leads (user_id);

create table app.work_models (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  min_mon smallint not null check (min_mon between 0 and 600),
  min_tue smallint not null check (min_tue between 0 and 600),
  min_wed smallint not null check (min_wed between 0 and 600),
  min_thu smallint not null check (min_thu between 0 and 600),
  min_fri smallint not null check (min_fri between 0 and 600),
  min_sat smallint not null check (min_sat between 0 and 600),
  min_sun smallint not null check (min_sun between 0 and 600),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table app.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  employee_id uuid not null,
  valid_from date not null,
  work_model_id uuid not null,
  min_mon smallint not null check (min_mon between 0 and 600),
  min_tue smallint not null check (min_tue between 0 and 600),
  min_wed smallint not null check (min_wed between 0 and 600),
  min_thu smallint not null check (min_thu between 0 and 600),
  min_fri smallint not null check (min_fri between 0 and 600),
  min_sat smallint not null check (min_sat between 0 and 600),
  min_sun smallint not null check (min_sun between 0 and 600),
  vacation_days_year numeric(4,1) not null check (vacation_days_year >= 0),
  vacation_basis_days smallint not null check (vacation_basis_days between 1 and 7),
  flex_cap_plus_min integer check (flex_cap_plus_min >= 0),
  flex_cap_minus_min integer check (flex_cap_minus_min >= 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, employee_id, valid_from),
  foreign key (tenant_id, employee_id) references app.employees (tenant_id, id),
  foreign key (tenant_id, work_model_id) references app.work_models (tenant_id, id)
);

create function app.leads(p_employee_id uuid)
returns boolean
language sql
stable
parallel safe
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from app.employees e
      join app.team_leads l on l.team_id = e.team_id
     where e.id = p_employee_id
       and l.user_id = app.user_id()
  )
$$;

create function app.enforce_period_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

create function app.check_contract_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.valid_from < (select e.entry_date from app.employees e where e.id = new.employee_id) then
    raise exception 'contract starts before the entry date' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

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

create trigger teams_set_updated_at
  before update on app.teams
  for each row execute function app.set_updated_at();

create trigger employees_set_updated_at
  before update on app.employees
  for each row execute function app.set_updated_at();

create trigger work_models_set_updated_at
  before update on app.work_models
  for each row execute function app.set_updated_at();

create trigger contracts_check_start
  before insert on app.contracts
  for each row execute function app.check_contract_start();

create trigger contracts_period_lock
  after insert on app.contracts
  for each row execute function app.enforce_period_lock('valid_from');

create trigger audit_teams
  after insert or update or delete on app.teams
  for each row execute function audit.track();

create trigger audit_employees
  after insert or update or delete on app.employees
  for each row execute function audit.track();

create trigger audit_team_leads
  after insert or update or delete on app.team_leads
  for each row execute function audit.track();

create trigger audit_work_models
  after insert or update or delete on app.work_models
  for each row execute function audit.track();

create trigger audit_contracts
  after insert or update or delete on app.contracts
  for each row execute function audit.track();

alter table app.teams enable row level security, force row level security;
alter table app.employees enable row level security, force row level security;
alter table app.team_leads enable row level security, force row level security;
alter table app.work_models enable row level security, force row level security;
alter table app.contracts enable row level security, force row level security;

create policy "tenant fence" on app.teams as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "members read teams" on app.teams for select to zeit_app
  using (true);

create policy "hr manages teams" on app.teams for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.employees as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "read own employee" on app.employees for select to zeit_app
  using (id = (select app.employee_id()));

create policy "leads read their team" on app.employees for select to zeit_app
  using (app.leads(id));

create policy "hr manages employees" on app.employees for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.team_leads as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "members read team leads" on app.team_leads for select to zeit_app
  using (true);

create policy "hr manages team leads" on app.team_leads for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.work_models as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "members read work models" on app.work_models for select to zeit_app
  using (true);

create policy "hr manages work models" on app.work_models for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.contracts as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "read own contracts" on app.contracts for select to zeit_app
  using (employee_id = (select app.employee_id()));

create policy "leads read their team's contracts" on app.contracts for select to zeit_app
  using (app.leads(employee_id));

create policy "hr reads contracts" on app.contracts for select to zeit_app
  using ((select app.role()) >= 'hr');

create policy "hr adds contracts" on app.contracts for insert to zeit_app
  with check ((select app.role()) >= 'hr');

create policy "hr removes future contracts" on app.contracts for delete to zeit_app
  using ((select app.role()) >= 'hr' and valid_from > (now() at time zone 'Europe/Berlin')::date);

grant select, insert, update on app.teams, app.work_models to zeit_app;
grant select, insert, delete on app.team_leads, app.contracts to zeit_app;
grant select on app.employees to zeit_app;
grant insert (id, tenant_id, personnel_no, first_name, last_name, team_id, entry_date, exit_date)
  on app.employees to zeit_app;
grant update (personnel_no, first_name, last_name, team_id, exit_date) on app.employees to zeit_app;

grant select on app.employees, app.team_leads to zeit_system;

grant create on schema app to zeit_system;
alter function app.leads(uuid) owner to zeit_system;
alter function app.enforce_period_lock() owner to zeit_system;
revoke create on schema app from zeit_system;

revoke all on function app.leads(uuid), app.enforce_period_lock() from public;
grant execute on function app.leads(uuid) to zeit_app;

-- migrate:down
drop table app.contracts;
drop table app.work_models;
drop table app.team_leads;
alter table app.users drop constraint users_employee_fkey;
drop table app.employees;
drop table app.teams;

drop function app.check_contract_start();
drop function app.enforce_period_lock();
drop function app.leads(uuid);

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
begin
  if tg_op <> 'INSERT' then
    old_row := to_jsonb(old) - skipped;
  end if;
  if tg_op <> 'DELETE' then
    new_row := to_jsonb(new) - skipped;
  end if;
  latest := case when tg_op = 'DELETE' then old_row else new_row end;

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
    (case when tg_table_name = 'tenants' then latest ->> 'id' else latest ->> 'tenant_id' end)::uuid,
    app.user_id(),
    app.role(),
    'trigger',
    lower(tg_op),
    tg_table_name,
    (latest ->> 'id')::uuid,
    (latest ->> 'employee_id')::uuid,
    changed,
    nullif(current_setting('app.request_id', true), '')::uuid
  );

  return null;
end;
$$;
