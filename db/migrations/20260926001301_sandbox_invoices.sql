-- migrate:up
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

grant insert on app.billing_profiles to zeit_system;
grant insert (id, created_at) on app.invoices to zeit_system;
grant update (paid_on) on app.invoices to zeit_system;

-- migrate:down
revoke update (paid_on) on app.invoices from zeit_system;
revoke insert (id, created_at) on app.invoices from zeit_system;
revoke insert on app.billing_profiles from zeit_system;

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
