-- migrate:up
-- security review of 10d, P-01/P-03/P-05 (finding B5): audit.track() copied every column, so
-- seller/buyer (address, tax ids, iban, bic) landed in the append-only trail on every issue, and a
-- billing profile update logged the old and new iban/bic in the clear.
create or replace function audit.track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- bookkeeping columns are never worth a trail entry, invoices and their PDF also drop a blob
  skipped constant text[] := case tg_table_name
    when 'invoices' then array['updated_at', 'last_login_at', 'seller', 'buyer']
    when 'invoice_documents' then array['updated_at', 'last_login_at', 'content']
    else array['updated_at', 'last_login_at']
  end;
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

  -- a payment routing change stays in the trail, but only the last four digits of it (P-01/P-05)
  if tg_table_name = 'billing_profiles' then
    old_row := old_row || jsonb_strip_nulls(
      jsonb_build_object('iban', right(old_row ->> 'iban', 4), 'bic', right(old_row ->> 'bic', 4))
    );
    new_row := new_row || jsonb_strip_nulls(
      jsonb_build_object('iban', right(new_row ->> 'iban', 4), 'bic', right(new_row ->> 'bic', 4))
    );
  end if;

  latest := case when tg_op = 'DELETE' then old_row else new_row end;
  tenant := (case when tg_table_name = 'tenants' then latest ->> 'id' else latest ->> 'tenant_id' end)::uuid;

  -- the seed runs in the transaction that creates the sandbox; in here current_user is zeit_system for everyone
  if exists (
    select 1 from app.tenants t where t.id = tenant and t.kind = 'sandbox' and t.created_at = now()
  )
    -- a row moved in from another tenant is no seed, whatever sandbox it lands in
    and (tg_op <> 'UPDATE' or old_row ->> 'tenant_id' is not distinct from new_row ->> 'tenant_id')
  then
    return null;
  end if;

  -- rows cascading away with their tenant are the sandbox purge, which deletes the trail right after
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

-- P-03: "Dokument gespeichert" was the one row in the event table with no trigger behind it yet
create trigger audit_invoice_documents
  after insert on app.invoice_documents
  for each row execute function audit.track();

-- migrate:down
drop trigger audit_invoice_documents on app.invoice_documents;

create or replace function audit.track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- bookkeeping columns alone are not worth a trail entry
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

  -- the seed runs in the transaction that creates the sandbox; in here current_user is zeit_system for everyone
  if exists (
    select 1 from app.tenants t where t.id = tenant and t.kind = 'sandbox' and t.created_at = now()
  )
    -- a row moved in from another tenant is no seed, whatever sandbox it lands in
    and (tg_op <> 'UPDATE' or old_row ->> 'tenant_id' is not distinct from new_row ->> 'tenant_id')
  then
    return null;
  end if;

  -- rows cascading away with their tenant are the sandbox purge, which deletes the trail right after
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
