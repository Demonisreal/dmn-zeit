-- migrate:up
create or replace function app.guard_billing_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  movable constant text[] := array['tax_profile', 'previous_year_revenue_cents', 'updated_at'];
begin
  if not exists (
    select 1 from app.tenants t where t.id in (new.tenant_id, old.tenant_id) and t.kind = 'sandbox'
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if exists (select 1 from app.billing_profiles p where p.tenant_id = new.tenant_id) then
      return new;
    end if;
    raise exception 'sandbox % only has the billing profile of its seed', new.tenant_id
      using errcode = 'insufficient_privilege';
  end if;

  if to_jsonb(new) - movable <> to_jsonb(old) - movable then
    raise exception 'a sandbox only switches tax profile and previous year revenue of its billing profile'
      using errcode = 'ZT002';
  end if;

  return new;
end;
$$;

grant create on schema app to zeit_system;
alter function app.guard_billing_profile() owner to zeit_system;
revoke create on schema app from zeit_system;

create trigger billing_profiles_guard
  before insert or update on app.billing_profiles
  for each row when (current_user = 'zeit_app')
  execute function app.guard_billing_profile();

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

-- migrate:down
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
  tenant_created timestamptz;
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

  select t.kind, t.created_at into tenant_kind, tenant_created from app.tenants t where t.id = app.tenant_id();

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
    if tenant_kind = 'sandbox'
      and (profile.created_at, profile.updated_at) is distinct from (tenant_created, tenant_created) then
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

drop trigger billing_profiles_guard on app.billing_profiles;
drop function app.guard_billing_profile();
