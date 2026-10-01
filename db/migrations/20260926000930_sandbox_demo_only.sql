-- migrate:up
-- the api sets app.demo_mode per connection, 'true' under APP_MODE=demo and 'false' otherwise
create function ops.demo_only()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.demo_mode', true) is distinct from 'true' then
    raise exception 'sandboxes are only seeded in the demo' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- sandbox_seed and sandbox_seed_company start with sandbox_create, so these two guard all four
create or replace function ops.sandbox_create(
  p_id uuid,
  p_name text,
  p_slug text,
  p_state app.federal_state,
  p_flex_cap_plus_min integer,
  p_flex_cap_minus_min integer,
  p_flex_cap_mode app.flex_cap_mode
)
returns uuid
language sql
security definer
set search_path = ''
as $$
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

-- body copied from 20260926000120, a change there has to be repeated here
create or replace function ops.sandbox_seed_book(p_tenant uuid, p_book jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

grant create on schema ops to zeit_system;
alter function ops.demo_only() owner to zeit_system;
revoke create on schema ops from zeit_system;

-- migrate:down
create or replace function ops.sandbox_seed_book(p_tenant uuid, p_book jsonb)
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

create or replace function ops.sandbox_create(
  p_id uuid,
  p_name text,
  p_slug text,
  p_state app.federal_state,
  p_flex_cap_plus_min integer,
  p_flex_cap_minus_min integer,
  p_flex_cap_mode app.flex_cap_mode
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into app.tenants (
    id, name, slug, state, flex_cap_plus_min, flex_cap_minus_min, flex_cap_mode, kind, expires_at
  )
  values (
    p_id, p_name, p_slug, p_state, p_flex_cap_plus_min, p_flex_cap_minus_min, p_flex_cap_mode,
    'sandbox', now() + interval '24 hours'
  )
  returning id;
$$;

drop function ops.demo_only();
