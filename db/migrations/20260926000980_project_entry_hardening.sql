-- migrate:up
-- security review of 10c/10d: T-02 (24h cap on unverified entries), billable restricted to hr,
-- and a corrected timer entry no longer claims to be the clock's own record
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

  -- a booking nobody's clock confirmed stays inside one working day (bedrohungsmodell T-02)
  if new.source <> 'timer' and new.ended_at is not null and new.ended_at - new.started_at > interval '24 hours' then
    raise exception 'a manual or seeded entry cannot span more than 24 hours' using errcode = 'check_violation';
  end if;

  -- correcting the end of an already-stopped timer entry means it is no longer the clock's record
  if tg_op = 'UPDATE' and old.source = 'timer' and new.source = old.source and old.ended_at is not null
    and (new.started_at is distinct from old.started_at or new.ended_at is distinct from old.ended_at)
  then
    new.source := 'manual';
  end if;

  -- only hr decides whether an entry counts towards a bill, never the person booking it
  if (
    (tg_op = 'INSERT' and new.billable is not null)
    or (tg_op = 'UPDATE' and new.billable is distinct from old.billable)
  ) and (app.role() >= 'hr') is not true then
    raise exception 'only hr sets whether a project entry is billable' using errcode = 'insufficient_privilege';
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

  if (new.id, new.tenant_id, new.employee_id, new.created_by, new.created_at)
    is distinct from (old.id, old.tenant_id, old.employee_id, old.created_by, old.created_at) then
    raise exception 'owner and origin of a project entry stay fixed' using errcode = 'ZT002';
  end if;

  -- source is frozen too, except for the one conversion handled above
  if new.source is distinct from old.source and not (old.source = 'timer' and new.source = 'manual') then
    raise exception 'a project entry cannot change how it was booked' using errcode = 'ZT002';
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

-- migrate:down
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

  if new.ended_at is not null and new.ended_at > now()
    and (tg_op = 'INSERT' or new.ended_at is distinct from old.ended_at)
  then
    raise exception 'a project entry cannot end in the future' using errcode = 'check_violation';
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
