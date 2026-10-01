-- migrate:up
create or replace function app.guard_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  movable constant text[] := array[
    'status', 'paid_on', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at', 'retain_until'
  ];
begin
  if tg_op = 'DELETE' then
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

  if (new.cancelled_at, new.cancelled_by, new.cancel_reason)
    is distinct from (old.cancelled_at, old.cancelled_by, old.cancel_reason)
    and (new.status <> 'cancelled' or old.status = 'cancelled')
  then
    raise exception 'invoice % gets its cancellation details from app.invoice_cancel only', old.id using errcode = 'ZT002';
  end if;

  if new.paid_on is distinct from old.paid_on then
    if old.status::text || '>' || new.status::text not in ('issued>paid', 'paid>issued') then
      raise exception 'paid_on of invoice % only moves with its payment status', old.id using errcode = 'ZT002';
    end if;
    if new.paid_on > (now() at time zone 'Europe/Berlin')::date then
      raise exception 'invoice % cannot be paid in the future', old.id using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

alter table app.invoices
  add constraint invoices_paid_on_status check (paid_on is null or status in ('paid', 'cancelled')),
  add constraint invoices_cancellation_unpaid check (kind = 'invoice' or status <> 'paid'),
  add constraint invoices_cancelled_at_status check ((status = 'cancelled') = (cancelled_at is not null));

revoke update (cancelled_at, cancelled_by, cancel_reason) on app.invoices from zeit_app;

-- migrate:down
grant update (cancelled_at, cancelled_by, cancel_reason) on app.invoices to zeit_app;

alter table app.invoices
  drop constraint invoices_cancelled_at_status,
  drop constraint invoices_cancellation_unpaid,
  drop constraint invoices_paid_on_status;

create or replace function app.guard_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  movable constant text[] := array[
    'status', 'paid_on', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at', 'retain_until'
  ];
begin
  if tg_op = 'DELETE' then
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
