-- migrate:up
alter table app.invoice_lines drop constraint invoice_lines_exemption_reason;

alter table app.invoice_lines
  add constraint invoice_lines_exemption_reason check (exemption_reason is null or tax_category = 'exempt');

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

create or replace function app.store_invoice_document(p_invoice_id uuid, p_format text, p_content bytea)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

-- migrate:down
create or replace function app.store_invoice_document(p_invoice_id uuid, p_format text, p_content bytea)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored uuid;
begin
  if (app.role() >= 'hr') is not true then
    raise exception 'only hr and admins store invoice documents' using errcode = 'insufficient_privilege';
  end if;

  insert into app.invoice_documents (tenant_id, invoice_id, format, content, sha256, created_by)
  values (app.tenant_id(), p_invoice_id, p_format, p_content, sha256(p_content), app.user_id())
  on conflict (tenant_id, invoice_id, format) do nothing
  returning id into stored;

  return stored;
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

  select i.status, i.tax_profile, i.tax_treatment into target
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
  end if;

  return new;
end;
$$;

alter table app.invoice_lines drop constraint invoice_lines_exemption_reason;

alter table app.invoice_lines
  add constraint invoice_lines_exemption_reason check ((tax_category = 'exempt') = (exemption_reason is not null)) not valid;
