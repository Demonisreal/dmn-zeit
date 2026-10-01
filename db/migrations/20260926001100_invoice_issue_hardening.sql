-- migrate:up
create or replace function app.guard_invoice_child()
returns trigger
language plpgsql
set search_path = ''
as $$
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

  select i.status, i.tax_profile into target
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
  end if;

  return new;
end;
$$;

create or replace function app.issue_invoice(p_invoice_id uuid)
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

  select t.kind into tenant_kind from app.tenants t where t.id = app.tenant_id();

  if tenant_kind = 'sandbox' and (
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

  if tenant_kind = 'sandbox' then
    prefix := 'MUSTER-';
  else
    select * into profile from app.billing_profiles p where p.tenant_id = app.tenant_id();
    if not found then
      raise exception 'tenant % has no billing profile yet', app.tenant_id() using errcode = 'ZT003';
    end if;
    prefix := profile.invoice_prefix;
  end if;

  if draft.kind = 'cancellation' then
    select o.seller, o.buyer into v_seller, v_buyer
      from app.invoices o
     where o.tenant_id = draft.tenant_id and o.id = draft.refers_to_id;
  else
    if tenant_kind = 'sandbox' then
      v_seller := jsonb_build_object(
        'legalName', 'Musterbetrieb Mira Beispiel', 'street', 'Musterstraße 1', 'postalCode', '10115',
        'city', 'Berlin', 'countryCode', 'DE', 'taxNumber', '000/000/00000', 'vatId', 'DE000000000',
        'taxProfile', 'regular', 'iban', 'DE00500105170648489890', 'bic', 'MUSTERDEXXX',
        'bankName', 'Musterbank', 'contactName', 'Mira Beispiel', 'contactEmail', null,
        'contactPhone', null, 'registerCourt', null, 'registerNumber', null
      );
    else
      v_seller := jsonb_build_object(
        'legalName', profile.legal_name, 'street', profile.street, 'postalCode', profile.postal_code,
        'city', profile.city, 'countryCode', profile.country_code, 'taxNumber', profile.tax_number,
        'vatId', profile.vat_id, 'taxProfile', profile.tax_profile, 'iban', profile.iban,
        'bic', profile.bic, 'bankName', profile.bank_name, 'contactName', profile.contact_name,
        'contactEmail', profile.contact_email, 'contactPhone', profile.contact_phone,
        'registerCourt', profile.register_court, 'registerNumber', profile.register_number
      );
    end if;

    select * into client from app.clients c where c.tenant_id = app.tenant_id() and c.id = draft.client_id;
    v_buyer := jsonb_build_object(
      'name', client.name, 'street', client.street, 'postalCode', client.postal_code,
      'city', client.city, 'countryCode', client.country_code, 'isBusiness', client.is_business,
      'vatId', client.vat_id, 'email', client.email, 'buyerReference', client.buyer_reference,
      'number', client.number
    );
  end if;

  if exists (
    select 1 from unnest(array['street', 'postalCode', 'city']) k where coalesce(btrim(v_seller ->> k), '') = ''
  ) then
    raise exception 'the seller address on invoice % is incomplete', p_invoice_id using errcode = 'ZT006';
  end if;

  if (reverse_charge or abs(net_total + tax_total) > 25000) and exists (
    select 1 from unnest(array['street', 'postalCode', 'city']) k where coalesce(btrim(v_buyer ->> k), '') = ''
  ) then
    raise exception 'the buyer address on invoice % is incomplete', p_invoice_id using errcode = 'ZT006';
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

create or replace function app.invoice_cancel(p_invoice_id uuid, p_reason text)
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
    locale, format, tax_profile, created_by
  ) values (
    original.tenant_id, 'cancellation', original.client_id, original.id, original.service_from,
    original.service_to, original.payment_terms_days, original.locale, original.format,
    original.tax_profile, app.user_id()
  ) returning id into cancellation_id;

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

  update app.project_entries set invoice_id = null
   where tenant_id = original.tenant_id and invoice_id = original.id;

  return cancellation;
end;
$$;

-- migrate:down
create or replace function app.invoice_cancel(p_invoice_id uuid, p_reason text)
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

  update app.project_entries set invoice_id = null
   where tenant_id = original.tenant_id and invoice_id = original.id;

  return cancellation;
end;
$$;

create or replace function app.issue_invoice(p_invoice_id uuid)
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

  if tenant_kind = 'sandbox' and (
    select count(*) from app.invoices i where i.tenant_id = app.tenant_id() and i.status <> 'draft'
  ) >= 30 then
    raise exception 'sandbox % has issued enough invoices for a demo', app.tenant_id() using errcode = 'ZT005';
  end if;

  select * into client from app.clients c where c.tenant_id = app.tenant_id() and c.id = draft.client_id;

  select coalesce(sum(g.net_cents), 0), coalesce(sum(app.percent_of(g.net_cents::bigint, g.tax_rate_bp::integer)), 0)
    into net_total, tax_total
    from (
      select tax_rate_bp, sum(net_cents) as net_cents
        from app.invoice_lines
       where tenant_id = app.tenant_id() and invoice_id = draft.id
       group by tax_rate_bp
    ) g;

  if tenant_kind = 'sandbox' then
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

create or replace function app.guard_invoice_child()
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

  if found and target.status <> 'draft' then
    raise exception '% belongs to an issued invoice', tg_table_name using errcode = 'ZT002';
  end if;

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
