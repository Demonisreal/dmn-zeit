-- migrate:up
-- the company story stays where it was, ops.sandbox_seed now wraps it and adds projects and the solo workspace
alter function ops.sandbox_seed(jsonb, text) rename to sandbox_seed_company;
revoke all on function ops.sandbox_seed_company(jsonb, text) from zeit_app;

-- clients, projects, rates and project time of one workspace, the ProjectBook of @zeit/demo-data
create function ops.sandbox_seed_book(p_tenant uuid, p_book jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_role text := current_setting('app.role', true);
begin
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

  -- guard_project_entry asks everyone below hr for a released project, the seed books for all of them
  perform set_config('app.role', 'admin', true);
  insert into app.project_entries (
    id, tenant_id, employee_id, project_id, task_id, started_at, ended_at, note, source
  )
  select x.id, p_tenant, x."employeeId", x."projectId", x."taskId", x."startedAt", x."endedAt", x.note, 'seed'
    from jsonb_to_recordset(p_book -> 'projectEntries')
      as x (id uuid, "employeeId" uuid, "projectId" uuid, "taskId" uuid, "startedAt" timestamptz,
            "endedAt" timestamptz, note text);
  perform set_config('app.role', coalesce(previous_role, ''), true);
end;
$$;

create function ops.sandbox_seed(p_plan jsonb, p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant constant uuid := (p_plan -> 'tenant' ->> 'id')::uuid;
  solo constant uuid := (p_plan -> 'solo' -> 'tenant' ->> 'id')::uuid;
  -- never taken from the plan, nobody gets a tenant into the group of another visitor
  pair constant uuid := gen_random_uuid();
begin
  perform ops.sandbox_seed_company(p_plan, p_locale);
  update app.tenants t set sandbox_group = pair where t.id = tenant;

  -- expires with the company, the purge takes both on the same run
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

-- the company and the solo workspace of one visitor are one sandbox for the switch
create or replace function ops.demo_switch_persona(
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
  -- null when the session is gone, the tenant is no live sandbox or the target lives outside its group
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

-- everyone ops.demo_switch_persona would switch to, zeit_app only sees its own tenant
create function ops.demo_personas()
returns table (
  user_id uuid,
  display_name text,
  role app.user_role,
  employee_id uuid,
  employee_name text,
  team_id uuid,
  team_name text,
  workspace app.workspace_kind
)
language sql
stable
security definer
set search_path = ''
as $$
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

grant insert on app.clients, app.projects, app.tasks, app.rates, app.project_entries to zeit_system;
grant select (tenant_id) on app.rates, app.project_entries to zeit_system;
grant update (sandbox_group) on app.tenants to zeit_system;

grant create on schema ops to zeit_system;
alter function ops.sandbox_seed_book(uuid, jsonb) owner to zeit_system;
alter function ops.sandbox_seed(jsonb, text) owner to zeit_system;
alter function ops.demo_personas() owner to zeit_system;
revoke create on schema ops from zeit_system;

revoke all on function
  ops.sandbox_seed_book(uuid, jsonb), ops.sandbox_seed(jsonb, text), ops.demo_personas()
from public;
grant execute on function ops.sandbox_seed(jsonb, text), ops.demo_personas() to zeit_app;

create trigger clients_sandbox_quota
  after insert on app.clients referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(50);

create trigger projects_sandbox_quota
  after insert on app.projects referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(100);

create trigger tasks_sandbox_quota
  after insert on app.tasks referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(300);

create trigger project_members_sandbox_quota
  after insert on app.project_members referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(1500);

create trigger rates_sandbox_quota
  after insert on app.rates referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(200);

-- the seed of 31 july books about 14000 of them
create trigger project_entries_sandbox_quota
  after insert on app.project_entries referencing new table as added
  for each statement when (current_user <> 'zeit_owner')
  execute function app.sandbox_quota(20000);

-- migrate:down
drop trigger project_entries_sandbox_quota on app.project_entries;
drop trigger rates_sandbox_quota on app.rates;
drop trigger project_members_sandbox_quota on app.project_members;
drop trigger tasks_sandbox_quota on app.tasks;
drop trigger projects_sandbox_quota on app.projects;
drop trigger clients_sandbox_quota on app.clients;

drop function ops.demo_personas();

create or replace function ops.demo_switch_persona(
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

drop function ops.sandbox_seed(jsonb, text);
drop function ops.sandbox_seed_book(uuid, jsonb);

revoke update (sandbox_group) on app.tenants from zeit_system;
revoke select (tenant_id) on app.rates, app.project_entries from zeit_system;
revoke insert on app.clients, app.projects, app.tasks, app.rates, app.project_entries from zeit_system;

alter function ops.sandbox_seed_company(jsonb, text) rename to sandbox_seed;
grant execute on function ops.sandbox_seed(jsonb, text) to zeit_app;
