-- migrate:up
create type app.end_reason as enum ('break', 'leave');
create type app.entry_source as enum ('clock', 'correction', 'seed');
create type app.correction_action as enum ('add', 'change', 'void');
create type app.correction_status as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table app.time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  employee_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  workday date not null generated always as ((started_at at time zone 'Europe/Berlin')::date) stored,
  end_reason app.end_reason,
  source app.entry_source not null,
  request_id uuid,
  voided_at timestamptz,
  voided_by_request_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, employee_id, id),
  foreign key (tenant_id, employee_id) references app.employees (tenant_id, id),
  foreign key (tenant_id, created_by) references app.users (tenant_id, id),
  check (ended_at > started_at),
  check (end_reason is null or ended_at is not null),
  check ((source = 'correction') = (request_id is not null)),
  check ((voided_at is null) = (voided_by_request_id is null))
);

create unique index time_entries_one_open_idx on app.time_entries (employee_id)
  where ended_at is null and voided_at is null;

alter table app.time_entries add constraint time_entries_no_overlap
  exclude using gist (employee_id with =, tstzrange(started_at, ended_at, '[)') with &&)
  where (voided_at is null);

create index time_entries_employee_day_idx on app.time_entries (tenant_id, employee_id, workday);

create table app.correction_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  employee_id uuid not null,
  action app.correction_action not null,
  target_entry_id uuid,
  new_started_at timestamptz,
  new_ended_at timestamptz,
  reason text not null check (char_length(btrim(reason)) >= 10),
  status app.correction_status not null default 'pending',
  requested_by uuid not null,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, employee_id, id),
  foreign key (tenant_id, employee_id) references app.employees (tenant_id, id),
  foreign key (tenant_id, employee_id, target_entry_id)
    references app.time_entries (tenant_id, employee_id, id),
  foreign key (tenant_id, requested_by) references app.users (tenant_id, id),
  foreign key (tenant_id, decided_by) references app.users (tenant_id, id),
  check ((action = 'add') = (target_entry_id is null)),
  check ((action = 'void') = (new_started_at is null)),
  check ((new_started_at is null) = (new_ended_at is null)),
  check (new_ended_at > new_started_at),
  check ((status in ('approved', 'rejected')) = (decided_by is not null)),
  check ((decided_by is null) = (decided_at is null))
);

create index correction_requests_employee_idx
  on app.correction_requests (tenant_id, employee_id, created_at);
create index correction_requests_pending_idx on app.correction_requests (tenant_id, created_at)
  where status = 'pending';

alter table app.time_entries
  add foreign key (tenant_id, employee_id, request_id)
    references app.correction_requests (tenant_id, employee_id, id),
  add foreign key (tenant_id, employee_id, voided_by_request_id)
    references app.correction_requests (tenant_id, employee_id, id);

create table app.finding_acks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  employee_id uuid not null,
  work_date date not null,
  rule_code text not null check (rule_code ~ '^ARBZG_[0-9A-Z_]+$'),
  rule_version text not null check (btrim(rule_version) <> ''),
  note text not null check (btrim(note) <> ''),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, employee_id, work_date, rule_code),
  foreign key (tenant_id, employee_id) references app.employees (tenant_id, id),
  foreign key (tenant_id, created_by) references app.users (tenant_id, id)
);

create function app.guard_time_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  fillable constant text[] := array['ended_at', 'end_reason', 'voided_at', 'voided_by_request_id', 'workday'];
begin
  if tg_op = 'DELETE' then
    if old.tenant_id::text = current_setting('zeit.purge_tenant', true) then
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
      and (new.ended_at, new.end_reason) is distinct from (old.ended_at, old.end_reason))
    or (old.voided_at is not null
      and (new.voided_at, new.voided_by_request_id) is distinct from (old.voided_at, old.voided_by_request_id))
  ) then
    raise exception 'a time entry can only be ended and voided, each once' using errcode = 'ZT002';
  end if;

  return new;
end;
$$;

create function app.guard_request_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status::text <> 'pending' and not (
      new.status::text = 'approved'
      and (new.decided_by is not distinct from new.requested_by
        or to_jsonb(new) ->> 'type' is not distinct from 'sick')
    ) then
      raise exception 'a new % starts as pending', tg_table_name using errcode = 'ZT003';
    end if;
  elsif new.status is distinct from old.status
    and old.status::text || '>' || new.status::text <> all (array[
      'pending>approved', 'pending>rejected', 'pending>withdrawn',
      'approved>cancel_pending', 'approved>cancelled',
      'cancel_pending>approved', 'cancel_pending>cancelled'
    ]) then
    raise exception '% cannot go from % to %', tg_table_name, old.status, new.status
      using errcode = 'ZT003';
  end if;

  if exists (
    select 1
      from app.users u
     where u.employee_id = new.employee_id
       and u.id in (new.decided_by, (to_jsonb(new) ->> 'certificate_confirmed_by')::uuid)
  ) then
    raise exception 'nobody decides on their own %', tg_table_name using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger time_entries_guard
  before insert or update or delete on app.time_entries
  for each row execute function app.guard_time_entry();

create trigger time_entries_no_truncate
  before truncate on app.time_entries
  for each statement execute function app.reject_change();

create trigger time_entries_period_lock
  after insert or update on app.time_entries
  for each row execute function app.enforce_period_lock('workday');

create trigger correction_requests_guard_status
  before insert or update on app.correction_requests
  for each row execute function app.guard_request_status();

create trigger correction_requests_set_updated_at
  before update on app.correction_requests
  for each row execute function app.set_updated_at();

create trigger audit_time_entries
  after insert or update or delete on app.time_entries
  for each row execute function audit.track();

create trigger audit_correction_requests
  after insert or update or delete on app.correction_requests
  for each row execute function audit.track();

create trigger audit_finding_acks
  after insert or update or delete on app.finding_acks
  for each row execute function audit.track();

alter table app.time_entries enable row level security, force row level security;
alter table app.correction_requests enable row level security, force row level security;
alter table app.finding_acks enable row level security, force row level security;

create policy "tenant fence" on app.time_entries as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "read own entries" on app.time_entries for select to zeit_app
  using (employee_id = (select app.employee_id()));

create policy "stamp own entries" on app.time_entries for insert to zeit_app
  with check (employee_id = (select app.employee_id()) and source = 'clock');

create policy "end own running entry" on app.time_entries for update to zeit_app
  using (employee_id = (select app.employee_id()))
  with check (employee_id = (select app.employee_id()) and voided_at is null);

create policy "leads read their team's entries" on app.time_entries for select to zeit_app
  using (app.leads(employee_id));

create policy "leads apply corrections" on app.time_entries for insert to zeit_app
  with check (app.leads(employee_id) and source = 'correction');

create policy "leads void entries" on app.time_entries for update to zeit_app
  using (app.leads(employee_id));

create policy "hr manages entries" on app.time_entries for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.correction_requests as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "read own corrections" on app.correction_requests for select to zeit_app
  using (employee_id = (select app.employee_id()));

create policy "request own corrections" on app.correction_requests for insert to zeit_app
  with check (
    employee_id = (select app.employee_id())
    and requested_by = (select app.user_id())
    and status = 'pending'
  );

create policy "withdraw own corrections" on app.correction_requests for update to zeit_app
  using (employee_id = (select app.employee_id()))
  with check (employee_id = (select app.employee_id()) and status = 'withdrawn');

create policy "leads read their team's corrections" on app.correction_requests for select to zeit_app
  using (app.leads(employee_id));

create policy "leads decide corrections" on app.correction_requests for update to zeit_app
  using (app.leads(employee_id));

create policy "hr manages corrections" on app.correction_requests for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.finding_acks as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "read own finding acks" on app.finding_acks for select to zeit_app
  using (employee_id = (select app.employee_id()));

create policy "leads manage their team's finding acks" on app.finding_acks for all to zeit_app
  using (app.leads(employee_id));

create policy "hr manages finding acks" on app.finding_acks for all to zeit_app
  using ((select app.role()) >= 'hr');

grant select, insert on app.time_entries, app.finding_acks to zeit_app;
grant update (ended_at, end_reason, voided_at, voided_by_request_id) on app.time_entries to zeit_app;
grant select, insert on app.correction_requests to zeit_app;
grant update (status, decided_by, decided_at, decision_note) on app.correction_requests to zeit_app;

grant create on schema app to zeit_system;
alter function app.guard_request_status() owner to zeit_system;
revoke create on schema app from zeit_system;

revoke all on function app.guard_request_status() from public;

-- migrate:down
drop table app.finding_acks;
drop table app.correction_requests, app.time_entries;

drop function app.guard_request_status();
drop function app.guard_time_entry();

drop type app.correction_status;
drop type app.correction_action;
drop type app.entry_source;
drop type app.end_reason;
