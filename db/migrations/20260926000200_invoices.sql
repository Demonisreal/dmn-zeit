-- migrate:up
create type app.tax_profile as enum ('regular', 'small_business');
create type app.tax_category as enum (
  'standard', 'reduced', 'exempt', 'reverse_charge', 'outside_scope', 'small_business'
);
create type app.invoice_kind as enum ('invoice', 'cancellation');
create type app.invoice_status as enum ('draft', 'issued', 'paid', 'cancelled');
create type app.invoice_format as enum ('pdf', 'zugferd', 'xrechnung');
create type app.invoice_line_kind as enum ('time', 'item');

alter table app.clients add column invoice_format app.invoice_format;
grant update (invoice_format) on app.clients to zeit_app;

create table app.billing_profiles (
  tenant_id uuid primary key references app.tenants (id) on delete cascade,
  legal_name text not null check (btrim(legal_name) <> ''),
  street text,
  postal_code text,
  city text,
  country_code char(2) not null default 'DE' check (country_code = 'DE'),
  tax_number text,
  vat_id text check (vat_id ~ '^DE[0-9]{9}$'),
  tax_profile app.tax_profile not null default 'regular',
  previous_year_revenue_cents bigint,
  iban text,
  bic text,
  bank_name text,
  contact_name text,
  contact_email public.citext,
  contact_phone text,
  -- only entered merchants (§ 37a hgb) have one, most freelancers leave both blank
  register_court text,
  register_number text,
  invoice_prefix text not null default '' check (invoice_prefix ~ '^[A-Z0-9-]{0,10}$'),
  payment_terms_days smallint not null default 14 check (payment_terms_days between 0 and 120),
  rounding_increment_min smallint not null default 15 check (rounding_increment_min in (1, 5, 6, 10, 15, 30, 60)),
  rounding_mode app.rounding_mode not null default 'up',
  default_format app.invoice_format not null default 'pdf',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.invoice_counters (
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  year smallint not null,
  last_seq integer not null check (last_seq > 0),
  primary key (tenant_id, year)
);

create table app.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  kind app.invoice_kind not null default 'invoice',
  status app.invoice_status not null default 'draft',
  client_id uuid not null,
  refers_to_id uuid,
  number text,
  number_year smallint,
  number_seq integer,
  issue_date date,
  due_date date,
  service_from date not null,
  service_to date not null,
  payment_terms_days smallint not null,
  locale text not null default 'de' check (locale in ('de', 'en')),
  format app.invoice_format not null,
  tax_profile app.tax_profile not null,
  -- true only for invoices issued inside a sandbox tenant, never settable from outside app.issue_invoice
  specimen boolean not null default false,
  seller jsonb,
  buyer jsonb,
  intro_text text,
  closing_text text,
  net_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  gross_cents bigint not null default 0,
  paid_on date,
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  issued_at timestamptz,
  issued_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- eight years from the end of the year of issue (§ 257 hgb, § 147 ao), null while still a draft
  retain_until date generated always as (make_date(number_year::integer + 8, 12, 31)) stored,
  unique (tenant_id, id),
  unique (tenant_id, id, client_id),
  unique (tenant_id, number),
  unique (tenant_id, number_year, number_seq),
  foreign key (tenant_id, client_id) references app.clients (tenant_id, id),
  foreign key (tenant_id, refers_to_id) references app.invoices (tenant_id, id),
  foreign key (tenant_id, created_by) references app.users (tenant_id, id),
  foreign key (tenant_id, issued_by) references app.users (tenant_id, id),
  foreign key (tenant_id, cancelled_by) references app.users (tenant_id, id),
  check ((status = 'draft') = (number is null)),
  check ((status = 'draft') = (issue_date is null)),
  check ((status = 'draft') = (due_date is null)),
  check ((status = 'draft') = (issued_at is null)),
  check ((kind = 'invoice') = (refers_to_id is null)),
  check (service_to >= service_from),
  check (status <> 'paid' or paid_on is not null),
  -- a cancellation is never itself cancelled (R-08), it can only sit at issued or paid
  check (kind <> 'cancellation' or status <> 'cancelled'),
  check ((cancelled_at is null) = (cancelled_by is null)),
  check (cancelled_at is null or cancel_reason is not null)
);

create index invoices_tenant_status_idx on app.invoices (tenant_id, status);

-- at most one cancellation per invoice (R-08)
create unique index invoices_one_cancellation_idx on app.invoices (tenant_id, refers_to_id)
  where kind = 'cancellation';

create table app.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  invoice_id uuid not null,
  client_id uuid not null,
  position integer not null check (position > 0),
  kind app.invoice_line_kind not null,
  project_id uuid,
  task_id uuid,
  description text not null check (btrim(description) <> ''),
  service_from date,
  service_to date,
  minutes integer,
  quantity_milli bigint,
  unit text check (unit in ('HUR', 'DAY', 'C62', 'LS')),
  unit_price_cents bigint not null,
  net_cents bigint not null,
  tax_category app.tax_category not null,
  tax_rate_bp smallint not null check (tax_rate_bp between 0 and 10000),
  -- how the line was built: cell keys, rounding, resolved rate, exactly like rules.linesFromCells
  derivation jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, invoice_id, id),
  unique (tenant_id, invoice_id, position) deferrable initially immediate,
  foreign key (tenant_id, invoice_id, client_id) references app.invoices (tenant_id, id, client_id) on delete cascade,
  foreign key (tenant_id, client_id, project_id) references app.projects (tenant_id, client_id, id),
  foreign key (tenant_id, project_id, task_id) references app.tasks (tenant_id, project_id, id),
  check ((kind = 'time') = (minutes is not null)),
  check ((kind = 'item') = (quantity_milli is not null)),
  check (kind <> 'time' or project_id is not null),
  check ((quantity_milli is null) = (unit is null)),
  check ((tax_category in ('standard', 'reduced')) = (tax_rate_bp > 0))
);

create table app.invoice_line_entries (
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  invoice_id uuid not null,
  line_id uuid not null,
  entry_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (line_id, entry_id),
  foreign key (tenant_id, invoice_id, line_id) references app.invoice_lines (tenant_id, invoice_id, id) on delete cascade,
  foreign key (tenant_id, entry_id) references app.project_entries (tenant_id, id)
);

create table app.invoice_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  invoice_id uuid not null,
  format text not null check (format in ('pdf', 'zugferd', 'xrechnung_cii', 'time_report_pdf', 'time_report_csv')),
  content bytea not null check (octet_length(content) between 1 and 5242880),
  sha256 bytea not null check (octet_length(sha256) = 32),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, invoice_id, format),
  foreign key (tenant_id, invoice_id) references app.invoices (tenant_id, id) on delete cascade,
  foreign key (tenant_id, created_by) references app.users (tenant_id, id)
);

-- a deleted draft frees its bookings, an issued invoice keeps them locked (R-09)
alter table app.project_entries add constraint project_entries_invoice_fk
  foreign key (tenant_id, invoice_id) references app.invoices (tenant_id, id) on delete set null (invoice_id);

-- supports app.project_budget_status, which sums ended, unvoided entries per project regardless of billing
create index project_entries_budget_idx on app.project_entries (project_id)
  where ended_at is not null and voided_at is null;

-- closes a gap left open in stage 10c (bedrohungsmodell-rechnungen.md, T-04): a manual or seed entry
-- could still be booked with started_at/ended_at in the future, same errcode as the timer check above it
create or replace function app.guard_project_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- workday is generated and still null in a before trigger
  bookkeeping constant text[] := array['updated_at', 'workday'];
  running constant text[] := array['ended_at', 'note', 'voided_at'];
begin
  if tg_op = 'DELETE' then
    -- same rule as app.reject_change
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true)
      and current_user in ('zeit_system', 'zeit_owner') then
      return old;
    end if;
    raise exception 'project entries are voided, never deleted' using errcode = 'ZT002';
  end if;

  -- the timer takes the clock of the database, never a time sent by the client
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

  -- the release is checked on the way onto a project only, a note on an archived one stays editable
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

  if (new.id, new.tenant_id, new.employee_id, new.source, new.created_by, new.created_at)
    is distinct from (old.id, old.tenant_id, old.employee_id, old.source, old.created_by, old.created_at) then
    raise exception 'owner and origin of a project entry stay fixed' using errcode = 'ZT002';
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

create function app.round_div(num bigint, den bigint)
returns bigint
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
begin
  -- half away from zero, so a cancellation rounds as the exact mirror image of its invoice
  if 2 * abs(num % den) < abs(den) then
    return num / den;
  end if;
  return case when (num < 0) <> (den < 0) then num / den - 1 else num / den + 1 end;
end;
$$;

create function app.percent_of(cents bigint, basis_points integer)
returns bigint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select app.round_div(cents * basis_points, 10000);
$$;

-- plain helpers, invoker rights; only app.issue_invoice (running as zeit_system) ever calls them
revoke all on function app.round_div(bigint, bigint), app.percent_of(bigint, integer) from public;
grant execute on function app.round_div(bigint, bigint), app.percent_of(bigint, integer) to zeit_system;

-- security invoker on purpose: as definer current_user would always be zeit_system and open the purge path
create function app.guard_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- retain_until is generated from number_year, itself frozen below; postgres recomputes it only
  -- after before-row triggers run, so it still reads stale inside this one and needs the same pass
  movable constant text[] := array[
    'status', 'paid_on', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at', 'retain_until'
  ];
begin
  if tg_op = 'DELETE' then
    -- same rule as app.reject_change
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

  return new;
end;
$$;

-- covers invoice_lines and invoice_line_entries: both stay writable only while the invoice is a draft
create function app.guard_invoice_child()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target record;
begin
  select i.status, i.tax_profile into target
    from app.invoices i
   where i.tenant_id = coalesce(new.tenant_id, old.tenant_id)
     and i.id = coalesce(new.invoice_id, old.invoice_id);

  -- not found means the invoice is gone too, which only happens cascading from a deleted draft
  if found and target.status <> 'draft' then
    raise exception '% belongs to an issued invoice', tg_table_name using errcode = 'ZT002';
  end if;

  -- a line's category has to match the invoice's tax treatment (planung-projekte.md, risk 17):
  -- a small-business invoice never carries a taxed or reverse-charge line and vice versa
  if tg_table_name = 'invoice_lines' and tg_op <> 'DELETE' then
    if target.tax_profile = 'small_business' and new.tax_category <> 'small_business' then
      raise exception 'a small-business invoice only takes small_business lines' using errcode = 'check_violation';
    elsif target.tax_profile = 'regular' and new.tax_category = 'small_business' then
      raise exception 'a regular invoice cannot take a small_business line' using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- definer so the existence check sees the invoice regardless of rls; a cross-tenant row still
-- fails on the table's own tenant fence right after, with the usual 42501 instead of this errcode
create function app.guard_invoice_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- never trust a checksum the caller sends along (R-07)
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

-- a live tenant with retained invoices survives even a superuser delete, sandboxes are untouched (R-04)
create function app.guard_tenant_retention()
returns trigger
language plpgsql
set search_path = ''
as $$
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

create function app.issue_invoice(p_invoice_id uuid)
returns app.invoices
language plpgsql
security definer
set search_path = ''
as $$
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
  -- named v_ to avoid "column reference is ambiguous" against invoices.seller/buyer in the update below
  v_seller jsonb;
  v_buyer jsonb;
begin
  if (app.role() >= 'hr') is not true then
    raise exception 'only hr and admins issue invoices' using errcode = 'insufficient_privilege';
  end if;

  select * into draft from app.invoices i where i.id = p_invoice_id and i.tenant_id = app.tenant_id();
  if not found or draft.status <> 'draft' then
    raise exception 'invoice % is not an open draft', p_invoice_id using errcode = 'ZT003';
  end if;

  select t.kind into tenant_kind from app.tenants t where t.id = app.tenant_id();

  -- X-03: a sandbox demo never accumulates more issued invoices than fit a walkthrough
  if tenant_kind = 'sandbox' and (
    select count(*) from app.invoices i where i.tenant_id = app.tenant_id() and i.status <> 'draft'
  ) >= 30 then
    raise exception 'sandbox % has issued enough invoices for a demo', app.tenant_id() using errcode = 'ZT005';
  end if;

  select * into client from app.clients c where c.tenant_id = app.tenant_id() and c.id = draft.client_id;

  -- BR-CO-17: tax per rate group from the summed, already-rounded net amounts, never per line
  select coalesce(sum(g.net_cents), 0), coalesce(sum(app.percent_of(g.net_cents::bigint, g.tax_rate_bp::integer)), 0)
    into net_total, tax_total
    from (
      select tax_rate_bp, sum(net_cents) as net_cents
        from app.invoice_lines
       where tenant_id = app.tenant_id() and invoice_id = draft.id
       group by tax_rate_bp
    ) g;

  if tenant_kind = 'sandbox' then
    -- x-01: an invalid vat id and iban, so neither a tax office nor a bank ever acts on this
    prefix := 'MUSTER-';
    v_seller := jsonb_build_object(
      'legalName', 'Musterbetrieb Mira Beispiel', 'street', 'Musterstraße 1', 'postalCode', '10115',
      'city', 'Berlin', 'countryCode', 'DE', 'taxNumber', '000/000/00000', 'vatId', 'DE000000000',
      'taxProfile', 'regular', 'iban', 'DE00500105170648489890', 'bic', 'MUSTERDEXXX',
      'bankName', 'Musterbank', 'contactName', 'Mira Beispiel', 'contactEmail', null,
      'contactPhone', null, 'registerCourt', null, 'registerNumber', null
    );
  else
    select * into profile from app.billing_profiles p where p.tenant_id = app.tenant_id();
    if not found then
      raise exception 'tenant % has no billing profile yet', app.tenant_id() using errcode = 'ZT003';
    end if;
    prefix := profile.invoice_prefix;
    v_seller := jsonb_build_object(
      'legalName', profile.legal_name, 'street', profile.street, 'postalCode', profile.postal_code,
      'city', profile.city, 'countryCode', profile.country_code, 'taxNumber', profile.tax_number,
      'vatId', profile.vat_id, 'taxProfile', profile.tax_profile, 'iban', profile.iban,
      'bic', profile.bic, 'bankName', profile.bank_name, 'contactName', profile.contact_name,
      'contactEmail', profile.contact_email, 'contactPhone', profile.contact_phone,
      'registerCourt', profile.register_court, 'registerNumber', profile.register_number
    );
  end if;

  v_buyer := jsonb_build_object(
    'name', client.name, 'street', client.street, 'postalCode', client.postal_code,
    'city', client.city, 'countryCode', client.country_code, 'isBusiness', client.is_business,
    'vatId', client.vat_id, 'email', client.email, 'buyerReference', client.buyer_reference,
    'number', client.number
  );

  -- the upsert locks the counter row until commit, a rollback after this hands the number back (adr 0003)
  insert into app.invoice_counters as c (tenant_id, year, last_seq)
  values (app.tenant_id(), year_num, 1)
  on conflict (tenant_id, year) do update set last_seq = c.last_seq + 1
  returning c.last_seq into seq;

  update app.invoices i set
    status = 'issued',
    number = prefix || year_num || '-' || (case when seq < 10000 then lpad(seq::text, 4, '0') else seq::text end),
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

  return draft;
end;
$$;

create function app.invoice_cancel(p_invoice_id uuid, p_reason text)
returns app.invoices
language plpgsql
security definer
set search_path = ''
as $$
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

  select * into original from app.invoices i where i.id = p_invoice_id and i.tenant_id = app.tenant_id();
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'ZT003';
  end if;
  -- neither a cancellation of a cancellation nor a second one for the same invoice (R-08)
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
    locale, format, tax_profile, intro_text, closing_text, created_by
  ) values (
    original.tenant_id, 'cancellation', original.client_id, original.id, original.service_from,
    original.service_to, original.payment_terms_days, original.locale, original.format,
    original.tax_profile, original.intro_text, original.closing_text, app.user_id()
  ) returning id into cancellation_id;

  -- negated snapshots of the original's positions (0 - x, never -x, so a zero line stays zero)
  for src in select * from app.invoice_lines where tenant_id = original.tenant_id and invoice_id = original.id
  loop
    insert into app.invoice_lines (
      tenant_id, invoice_id, client_id, position, kind, project_id, task_id, description,
      service_from, service_to, minutes, quantity_milli, unit, unit_price_cents, net_cents,
      tax_category, tax_rate_bp, derivation
    ) values (
      src.tenant_id, cancellation_id, src.client_id, src.position, src.kind, src.project_id,
      src.task_id, src.description, src.service_from, src.service_to,
      case when src.minutes is null then null else 0 - src.minutes end,
      case when src.quantity_milli is null then null else 0 - src.quantity_milli end,
      src.unit, src.unit_price_cents, 0 - src.net_cents, src.tax_category, src.tax_rate_bp, src.derivation
    ) returning id into new_line_id;

    insert into app.invoice_line_entries (tenant_id, invoice_id, line_id, entry_id)
    select tenant_id, cancellation_id, new_line_id, entry_id
      from app.invoice_line_entries
     where tenant_id = original.tenant_id and invoice_id = original.id and line_id = src.id;
  end loop;

  cancellation := app.issue_invoice(cancellation_id);

  update app.invoices set status = 'cancelled', cancelled_at = now(), cancelled_by = app.user_id(), cancel_reason = p_reason
   where id = original.id and tenant_id = original.tenant_id;

  -- the abrechnungssperre lifts, the entries can be picked up by a new draft (R-09)
  update app.project_entries set invoice_id = null
   where tenant_id = original.tenant_id and invoice_id = original.id;

  return cancellation;
end;
$$;

-- effective rounding per project for b/tl, without exposing client names or any other client data
create function app.project_rounding(p_ids uuid[])
returns table (
  project_id uuid,
  increment_minutes smallint,
  increment_source text,
  mode app.rounding_mode,
  mode_source text
)
language sql
stable
security definer
set search_path = ''
as $$
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

create trigger invoices_guard
  before update or delete on app.invoices
  for each row execute function app.guard_invoice();

create trigger invoices_no_truncate
  before truncate on app.invoices
  for each statement execute function app.reject_change();

create trigger invoice_lines_guard
  before insert or update or delete on app.invoice_lines
  for each row execute function app.guard_invoice_child();

create trigger invoice_line_entries_guard
  before insert or update or delete on app.invoice_line_entries
  for each row execute function app.guard_invoice_child();

create trigger invoice_documents_guard
  before insert on app.invoice_documents
  for each row execute function app.guard_invoice_document();

create trigger invoice_documents_append_only
  before update or delete on app.invoice_documents
  for each row execute function app.reject_change();

create trigger invoice_documents_no_truncate
  before truncate on app.invoice_documents
  for each statement execute function app.reject_change();

create trigger tenants_guard_retention
  before delete on app.tenants
  for each row execute function app.guard_tenant_retention();

-- the counter and cancellation both re-read a full row, not just the tenant fence
grant select on app.invoices to zeit_system;
grant select (tenant_id) on app.invoices to zeit_system;

-- the generic quota also counts issued rows, so 50 open drafts plus the 30-issued cap fit under 80
create trigger invoices_sandbox_quota
  after insert on app.invoices referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(80);

create trigger billing_profiles_set_updated_at
  before update on app.billing_profiles
  for each row execute function app.set_updated_at();

create trigger invoices_set_updated_at
  before update on app.invoices
  for each row execute function app.set_updated_at();

create trigger audit_billing_profiles
  after insert or update or delete on app.billing_profiles
  for each row execute function audit.track();

create trigger audit_invoices
  after insert or update or delete on app.invoices
  for each row execute function audit.track();

create trigger audit_invoice_lines
  after insert or update or delete on app.invoice_lines
  for each row execute function audit.track();

create trigger audit_invoice_line_entries
  after insert or update or delete on app.invoice_line_entries
  for each row execute function audit.track();

alter table app.billing_profiles enable row level security, force row level security;
alter table app.invoice_counters enable row level security, force row level security;
alter table app.invoices enable row level security, force row level security;
alter table app.invoice_lines enable row level security, force row level security;
alter table app.invoice_line_entries enable row level security, force row level security;
alter table app.invoice_documents enable row level security, force row level security;

create policy "tenant fence" on app.billing_profiles as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));
create policy "hr reads billing profile" on app.billing_profiles for select to zeit_app
  using ((select app.role()) >= 'hr');
create policy "admins add billing profile" on app.billing_profiles for insert to zeit_app
  with check ((select app.role()) = 'admin');
create policy "admins update billing profile" on app.billing_profiles for update to zeit_app
  using ((select app.role()) = 'admin')
  with check ((select app.role()) = 'admin');

create policy "tenant fence" on app.invoice_counters as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));
create policy "hr reads invoice counters" on app.invoice_counters for select to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.invoices as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));
create policy "hr manages invoices" on app.invoices for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.invoice_lines as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));
create policy "hr manages invoice lines" on app.invoice_lines for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.invoice_line_entries as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));
create policy "hr manages invoice line entries" on app.invoice_line_entries for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.invoice_documents as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));
create policy "hr reads invoice documents" on app.invoice_documents for select to zeit_app
  using ((select app.role()) >= 'hr');
create policy "hr stores invoice documents" on app.invoice_documents for insert to zeit_app
  with check ((select app.role()) >= 'hr');

-- only hr sees the invoice-adjacent side of the trail, the rest stays with admin (P-04)
drop policy "hr and admins read the trail" on audit.log;
create policy "hr and admins read the trail" on audit.log for select to zeit_app
  using (
    (select app.role()) = 'admin'
    or ((select app.role()) = 'hr' and table_name <> all (array[
      'invoices', 'invoice_lines', 'invoice_line_entries', 'invoice_documents', 'invoice_counters',
      'rates', 'clients', 'billing_profiles'
    ]))
  );

grant select, insert on app.billing_profiles to zeit_app;
grant update (
  legal_name, street, postal_code, city, country_code, tax_number, vat_id, tax_profile,
  previous_year_revenue_cents, iban, bic, bank_name, contact_name, contact_email, contact_phone,
  register_court, register_number, invoice_prefix, payment_terms_days, rounding_increment_min,
  rounding_mode, default_format
) on app.billing_profiles to zeit_app;

grant select on app.invoice_counters to zeit_app;
grant insert on app.invoice_counters to zeit_system;
-- the upsert reads the whole row back through the "c" alias (do update set ... returning c.last_seq)
grant select, update (last_seq) on app.invoice_counters to zeit_system;

-- only the columns a draft is built from; number, dates, snapshots and sums come from app.issue_invoice
grant select, delete on app.invoices to zeit_app;
grant insert (
  tenant_id, client_id, service_from, service_to, payment_terms_days, locale, format, tax_profile,
  intro_text, closing_text, created_by
) on app.invoices to zeit_app;
grant update (
  client_id, service_from, service_to, payment_terms_days, locale, format, tax_profile,
  intro_text, closing_text, status, paid_on, cancelled_at, cancelled_by, cancel_reason
) on app.invoices to zeit_app;
-- the cancellation row app.invoice_cancel inserts, never id or tenant_id
grant insert (
  tenant_id, kind, client_id, refers_to_id, service_from, service_to, payment_terms_days, locale,
  format, tax_profile, intro_text, closing_text, created_by
) on app.invoices to zeit_system;
grant update (
  status, number, number_year, number_seq, issue_date, due_date, net_cents, tax_cents, gross_cents,
  seller, buyer, specimen, issued_at, issued_by, cancelled_at, cancelled_by, cancel_reason
) on app.invoices to zeit_system;

-- draft lines stay editable, id/tenant_id/invoice_id/client_id never move once written
grant select, insert, delete on app.invoice_lines, app.invoice_line_entries to zeit_app;
grant update (
  position, kind, project_id, task_id, description, service_from, service_to, minutes,
  quantity_milli, unit, unit_price_cents, net_cents, tax_category, tax_rate_bp, derivation
) on app.invoice_lines to zeit_app;
grant select, insert on app.invoice_lines, app.invoice_line_entries to zeit_system;

grant select, insert on app.invoice_documents to zeit_app;

grant select on app.clients, app.projects, app.tasks, app.billing_profiles to zeit_system;
-- app.invoice_cancel frees the bookings a cancelled invoice held (R-09)
grant select, update (invoice_id) on app.project_entries to zeit_system;

grant create on schema app to zeit_system;
alter function app.issue_invoice(uuid) owner to zeit_system;
alter function app.invoice_cancel(uuid, text) owner to zeit_system;
alter function app.project_rounding(uuid[]) owner to zeit_system;
alter function app.guard_invoice_document() owner to zeit_system;
revoke create on schema app from zeit_system;

revoke all on function app.issue_invoice(uuid), app.invoice_cancel(uuid, text), app.project_rounding(uuid[])
  from public;
grant execute on function app.issue_invoice(uuid), app.invoice_cancel(uuid, text), app.project_rounding(uuid[])
  to zeit_app;

-- migrate:down
revoke execute on function app.issue_invoice(uuid), app.invoice_cancel(uuid, text), app.project_rounding(uuid[])
  from zeit_app;
drop function app.project_rounding(uuid[]);
drop function app.invoice_cancel(uuid, text);
drop function app.issue_invoice(uuid);

revoke select, update (invoice_id) on app.project_entries from zeit_system;
revoke select on app.clients, app.projects, app.tasks, app.billing_profiles from zeit_system;
revoke select, insert on app.invoice_lines, app.invoice_line_entries from zeit_system;
revoke update on app.invoice_lines from zeit_app;
revoke select, insert, delete on app.invoice_lines, app.invoice_line_entries from zeit_app;
revoke update on app.invoices from zeit_system;
revoke insert on app.invoices from zeit_system;
revoke select, delete on app.invoices from zeit_app;
revoke select, update (last_seq) on app.invoice_counters from zeit_system;
revoke insert on app.invoice_counters from zeit_system;
revoke select on app.invoice_counters from zeit_app;
revoke select, insert on app.invoice_documents from zeit_app;
revoke select, insert on app.billing_profiles from zeit_app;
revoke update (invoice_format) on app.clients from zeit_app;
revoke select (tenant_id) on app.invoices from zeit_system;
revoke select on app.invoices from zeit_system;

drop policy "hr and admins read the trail" on audit.log;
create policy "hr and admins read the trail" on audit.log for select to zeit_app
  using ((select app.role()) >= 'hr');

drop index app.project_entries_budget_idx;
alter table app.project_entries drop constraint project_entries_invoice_fk;

-- lives on app.tenants, which this migration does not drop, so it outlives its guard function otherwise
drop trigger tenants_guard_retention on app.tenants;

drop table app.invoice_documents;
drop table app.invoice_line_entries;
drop table app.invoice_lines;
drop table app.invoices;
drop table app.invoice_counters;
drop table app.billing_profiles;

drop function app.guard_tenant_retention();
drop function app.guard_invoice_document();
drop function app.guard_invoice_child();
drop function app.guard_invoice();
revoke execute on function app.round_div(bigint, bigint), app.percent_of(bigint, integer) from zeit_system;
drop function app.percent_of(bigint, integer);
drop function app.round_div(bigint, bigint);

create or replace function app.guard_project_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
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

  if (new.id, new.tenant_id, new.employee_id, new.source, new.created_by, new.created_at)
    is distinct from (old.id, old.tenant_id, old.employee_id, old.source, old.created_by, old.created_at) then
    raise exception 'owner and origin of a project entry stay fixed' using errcode = 'ZT002';
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

alter table app.clients drop column invoice_format;

drop type app.invoice_line_kind;
drop type app.invoice_format;
drop type app.invoice_status;
drop type app.invoice_kind;
drop type app.tax_category;
drop type app.tax_profile;
