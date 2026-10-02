-- migrate:up
create or replace function app.guard_time_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  fillable constant text[] := array['ended_at', 'end_reason', 'voided_at', 'voided_by_request_id', 'workday'];
begin
  if tg_op = 'DELETE' then
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true)
      and current_user in ('zeit_system', 'zeit_owner') then
      return old;
    end if;
    raise exception 'time entries are voided, never deleted' using errcode = 'ZT002';
  end if;

  if new.source = 'clock' and (
    (tg_op = 'INSERT' and (new.started_at <> now() or new.ended_at is not null))
    or (tg_op = 'UPDATE' and new.ended_at is distinct from old.ended_at and new.ended_at <> now())
  ) then
    raise exception 'clock entries start and end at now()' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and (
    to_jsonb(new) - fillable <> to_jsonb(old) - fillable
    or (old.ended_at is not null
      and (new.ended_at, new.end_reason) is distinct from (old.ended_at, old.end_reason)
      and ((new.ended_at, old.end_reason, new.end_reason)
          is distinct from (old.ended_at, 'break'::app.end_reason, 'leave'::app.end_reason)
        or old.source <> 'clock'
        or old.workday <> (now() at time zone 'Europe/Berlin')::date))
    or (old.voided_at is not null
      and (new.voided_at, new.voided_by_request_id) is distinct from (old.voided_at, old.voided_by_request_id))
  ) then
    raise exception 'a time entry can only be ended and voided, each once' using errcode = 'ZT002';
  end if;

  return new;
end;
$$;

-- migrate:down
create or replace function app.guard_time_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  fillable constant text[] := array['ended_at', 'end_reason', 'voided_at', 'voided_by_request_id', 'workday'];
begin
  if tg_op = 'DELETE' then
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true)
      and current_user in ('zeit_system', 'zeit_owner') then
      return old;
    end if;
    raise exception 'time entries are voided, never deleted' using errcode = 'ZT002';
  end if;

  if new.source = 'clock' and (
    (tg_op = 'INSERT' and (new.started_at <> now() or new.ended_at is not null))
    or (tg_op = 'UPDATE' and new.ended_at is distinct from old.ended_at and new.ended_at <> now())
  ) then
    raise exception 'clock entries start and end at now()' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and (
    to_jsonb(new) - fillable <> to_jsonb(old) - fillable
    or (old.ended_at is not null
      and (new.ended_at, new.end_reason) is distinct from (old.ended_at, old.end_reason)
      and (new.ended_at, old.end_reason, new.end_reason)
        is distinct from (old.ended_at, 'break'::app.end_reason, 'leave'::app.end_reason))
    or (old.voided_at is not null
      and (new.voided_at, new.voided_by_request_id) is distinct from (old.voided_at, old.voided_by_request_id))
  ) then
    raise exception 'a time entry can only be ended and voided, each once' using errcode = 'ZT002';
  end if;

  return new;
end;
$$;
