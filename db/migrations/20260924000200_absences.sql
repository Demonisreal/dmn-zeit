-- migrate:up
create type app.absence_type as enum ('vacation', 'sick', 'time_off');
create type app.absence_status as enum (
  'pending', 'approved', 'rejected', 'withdrawn', 'cancel_pending', 'cancelled'
);
create type app.vacation_entry_type as enum (
  'entitlement', 'adjustment', 'taken', 'refund_sick', 'refund_cancel', 'expiry', 'manual'
);
create type app.notice_channel as enum ('in_app', 'email', 'letter');

create table app.absence_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  employee_id uuid not null,
  type app.absence_type not null,
  start_date date not null,
  end_date date not null,
  half_day_start boolean not null default false,
  half_day_end boolean not null default false,
  status app.absence_status not null default 'pending',
  note text,
  requested_by uuid not null,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  -- § 9 BUrlG: vacation days come back only once hr has seen the certificate
  certificate_confirmed_at timestamptz,
  certificate_confirmed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, employee_id, id),
  foreign key (tenant_id, employee_id) references app.employees (tenant_id, id),
  foreign key (tenant_id, requested_by) references app.users (tenant_id, id),
  foreign key (tenant_id, decided_by) references app.users (tenant_id, id),
  foreign key (tenant_id, certificate_confirmed_by) references app.users (tenant_id, id),
  check (end_date >= start_date),
  check (start_date < end_date or not (half_day_start and half_day_end)),
  -- sick notes need no approval
  check (status not in ('approved', 'rejected') or decided_by is not null or type = 'sick'),
  check ((decided_by is null) = (decided_at is null)),
  check (certificate_confirmed_at is null or type = 'sick'),
  check ((certificate_confirmed_at is null) = (certificate_confirmed_by is null)),
  constraint absence_requests_no_overlap exclude using gist (
    employee_id with =, daterange(start_date, end_date, '[]') with &&
  ) where (type <> 'sick' and status in ('pending', 'approved', 'cancel_pending'))
);

create index absence_requests_employee_idx on app.absence_requests (tenant_id, employee_id, start_date);
create index absence_requests_open_idx on app.absence_requests (tenant_id, created_at)
  where status in ('pending', 'cancel_pending');

create table app.absence_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  employee_id uuid not null,
  absence_id uuid not null,
  date date not null,
  portion numeric(2,1) not null check (portion in (0.5, 1)),
  target_minutes smallint not null check (target_minutes between 0 and 600),
  vacation_days numeric(4,2) not null default 0 check (vacation_days >= 0),
  superseded_at timestamptz,
  -- the request that took the day over, e.g. a sick note during vacation; null on a cancellation
  superseded_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, employee_id, absence_id)
    references app.absence_requests (tenant_id, employee_id, id),
  foreign key (tenant_id, employee_id, superseded_by)
    references app.absence_requests (tenant_id, employee_id, id),
  check (superseded_by is null or superseded_at is not null)
);

create unique index absence_days_active_idx on app.absence_days (employee_id, date)
  where superseded_at is null;
create index absence_days_absence_idx on app.absence_days (tenant_id, absence_id);
create index absence_days_calendar_idx on app.absence_days (tenant_id, date)
  where superseded_at is null;

create table app.vacation_notices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  employee_id uuid not null,
  bucket_year smallint not null check (bucket_year between 2000 and 2100),
  remaining_days numeric(5,2) not null check (remaining_days >= 0),
  deadline date not null,
  sent_at timestamptz not null default now(),
  sent_by uuid not null,
  channel app.notice_channel not null,
  text_version text not null check (btrim(text_version) <> ''),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, employee_id, id),
  foreign key (tenant_id, employee_id) references app.employees (tenant_id, id),
  foreign key (tenant_id, sent_by) references app.users (tenant_id, id)
);

create table app.vacation_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  employee_id uuid not null,
  bucket_year smallint not null check (bucket_year between 2000 and 2100),
  entry_type app.vacation_entry_type not null,
  days numeric(5,2) not null check (days <> 0),
  effective_date date not null,
  absence_id uuid,
  notice_id uuid,
  reason text check (btrim(reason) <> ''),
  -- jobs run again after a crash, the key keeps them from booking the same entitlement twice
  dedupe_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, dedupe_key),
  foreign key (tenant_id, employee_id) references app.employees (tenant_id, id),
  foreign key (tenant_id, employee_id, absence_id)
    references app.absence_requests (tenant_id, employee_id, id),
  foreign key (tenant_id, employee_id, notice_id)
    references app.vacation_notices (tenant_id, employee_id, id),
  foreign key (tenant_id, created_by) references app.users (tenant_id, id),
  check (case entry_type
    when 'entitlement' then days > 0
    when 'refund_sick' then days > 0
    when 'refund_cancel' then days > 0
    when 'taken' then days < 0
    when 'expiry' then days < 0
    else true
  end),
  check (entry_type not in ('taken', 'refund_sick', 'refund_cancel') or absence_id is not null),
  -- leave only expires once the person was told about it
  check (entry_type <> 'expiry' or notice_id is not null),
  check (entry_type not in ('adjustment', 'manual') or reason is not null)
);

create index vacation_ledger_employee_idx on app.vacation_ledger (tenant_id, employee_id, bucket_year);

create trigger absence_requests_guard_status
  before insert or update on app.absence_requests
  for each row execute function app.guard_request_status();

create trigger absence_requests_set_updated_at
  before update on app.absence_requests
  for each row execute function app.set_updated_at();

-- a confirmed certificate on a closed month is fine, a changed status is not
create trigger absence_requests_period_lock
  after insert or update of status on app.absence_requests
  for each row execute function app.enforce_period_lock('start_date');

create trigger absence_days_period_lock
  after insert or update on app.absence_days
  for each row execute function app.enforce_period_lock('date');

create trigger vacation_notices_append_only
  before delete on app.vacation_notices
  for each row execute function app.reject_change();

create trigger vacation_notices_no_truncate
  before truncate on app.vacation_notices
  for each statement execute function app.reject_change();

create trigger vacation_ledger_append_only
  before update or delete on app.vacation_ledger
  for each row execute function app.reject_change();

create trigger vacation_ledger_no_truncate
  before truncate on app.vacation_ledger
  for each statement execute function app.reject_change();

create trigger audit_absence_requests
  after insert or update or delete on app.absence_requests
  for each row execute function audit.track();

create trigger audit_absence_days
  after insert or update or delete on app.absence_days
  for each row execute function audit.track();

create trigger audit_vacation_notices
  after insert or update or delete on app.vacation_notices
  for each row execute function audit.track();

create trigger audit_vacation_ledger
  after insert or update or delete on app.vacation_ledger
  for each row execute function audit.track();

alter table app.absence_requests enable row level security, force row level security;
alter table app.absence_days enable row level security, force row level security;
alter table app.vacation_notices enable row level security, force row level security;
alter table app.vacation_ledger enable row level security, force row level security;

create policy "tenant fence" on app.absence_requests as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "read own absences" on app.absence_requests for select to zeit_app
  using (employee_id = (select app.employee_id()));

create policy "request own absences" on app.absence_requests for insert to zeit_app
  with check (
    employee_id = (select app.employee_id())
    and requested_by = (select app.user_id())
    and (status = 'pending' or type = 'sick')
  );

create policy "withdraw or cancel own absences" on app.absence_requests for update to zeit_app
  using (employee_id = (select app.employee_id()))
  with check (
    employee_id = (select app.employee_id())
    and status in ('withdrawn', 'cancel_pending')
  );

create policy "leads manage their team's absences" on app.absence_requests for all to zeit_app
  using (app.leads(employee_id));

create policy "hr manages absences" on app.absence_requests for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.absence_days as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "manage own absence days" on app.absence_days for all to zeit_app
  using (employee_id = (select app.employee_id()));

create policy "leads manage their team's absence days" on app.absence_days for all to zeit_app
  using (app.leads(employee_id));

create policy "hr manages absence days" on app.absence_days for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.vacation_notices as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "read own notices" on app.vacation_notices for select to zeit_app
  using (employee_id = (select app.employee_id()));

create policy "acknowledge own notices" on app.vacation_notices for update to zeit_app
  using (employee_id = (select app.employee_id()) and acknowledged_at is null)
  with check (employee_id = (select app.employee_id()));

create policy "leads read their team's notices" on app.vacation_notices for select to zeit_app
  using (app.leads(employee_id));

create policy "hr reads notices" on app.vacation_notices for select to zeit_app
  using ((select app.role()) >= 'hr');

create policy "hr sends notices" on app.vacation_notices for insert to zeit_app
  with check ((select app.role()) >= 'hr');

create policy "tenant fence" on app.vacation_ledger as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "read own ledger" on app.vacation_ledger for select to zeit_app
  using (employee_id = (select app.employee_id()));

create policy "leads book their team's vacation" on app.vacation_ledger for all to zeit_app
  using (app.leads(employee_id));

create policy "hr books vacation" on app.vacation_ledger for all to zeit_app
  using ((select app.role()) >= 'hr');

grant select, insert on app.absence_requests to zeit_app;
grant update (
  status, decided_by, decided_at, decision_note, certificate_confirmed_at, certificate_confirmed_by
) on app.absence_requests to zeit_app;
grant select, insert on app.absence_days to zeit_app;
grant update (superseded_at, superseded_by) on app.absence_days to zeit_app;
grant select, insert on app.vacation_notices to zeit_app;
grant update (acknowledged_at) on app.vacation_notices to zeit_app;
grant select, insert on app.vacation_ledger to zeit_app;

-- migrate:down
drop table app.vacation_ledger;
drop table app.vacation_notices;
drop table app.absence_days;
drop table app.absence_requests;

drop type app.notice_channel;
drop type app.vacation_entry_type;
drop type app.absence_status;
drop type app.absence_type;
