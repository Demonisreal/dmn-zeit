-- migrate:up
create type app.flex_booking_type as enum ('opening', 'manual', 'payout', 'cap_forfeit');
create type app.month_closing_action as enum ('close', 'reopen');

create table app.month_closings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  action app.month_closing_action not null,
  reason text check (btrim(reason) <> ''),
  snapshot jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, created_by) references app.users (tenant_id, id),
  check (action = 'close' or reason is not null)
);

create index month_closings_month_idx on app.month_closings (tenant_id, month);

create table app.flex_bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  employee_id uuid not null,
  type app.flex_booking_type not null,
  minutes integer not null check (minutes <> 0),
  effective_date date not null,
  reason text not null check (btrim(reason) <> ''),
  month_closing_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, month_closing_id, employee_id),
  foreign key (tenant_id, employee_id) references app.employees (tenant_id, id),
  foreign key (tenant_id, month_closing_id) references app.month_closings (tenant_id, id)
    deferrable initially deferred,
  foreign key (tenant_id, created_by) references app.users (tenant_id, id),
  check ((type = 'cap_forfeit') = (month_closing_id is not null)),
  check (type <> 'payout' or minutes < 0)
);

create index flex_bookings_employee_idx on app.flex_bookings (tenant_id, employee_id, effective_date);

create function app.apply_month_closing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  balance bigint;
  previous date;
  through date;
begin
  perform pg_advisory_xact_lock(hashtextextended('month_closings ' || new.tenant_id::text, 0));

  with months as (
    select c.month,
           count(*) filter (where c.action = 'close') - count(*) filter (where c.action = 'reopen') as closes
      from app.month_closings c
     where c.tenant_id = new.tenant_id
     group by c.month
  )
  select (select m.closes from months m where m.month = new.month),
         (select max(m.month) from months m where m.closes = 1 and m.month <> new.month)
    into balance, previous;

  if new.action = 'close' then
    if balance <> 1
      or previous <> (new.month - interval '1 month')::date
      or new.month >= date_trunc('month', now() at time zone 'Europe/Berlin') then
      raise exception 'month % is not the next one to close', new.month using errcode = 'ZT003';
    end if;
    through := (new.month + interval '1 month')::date - 1;
  else
    if balance <> 0 or previous > new.month then
      raise exception 'only the last closed month can be reopened' using errcode = 'ZT003';
    end if;
    through := (previous + interval '1 month')::date - 1;
  end if;

  update app.employees e set closed_through = through where e.tenant_id = new.tenant_id;
  return null;
end;
$$;

create function app.inherit_closed_through()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select (max(m.month) + interval '1 month')::date - 1
    into new.closed_through
    from (
      select c.month
        from app.month_closings c
       where c.tenant_id = new.tenant_id
       group by c.month
      having count(*) filter (where c.action = 'close') > count(*) filter (where c.action = 'reopen')
    ) m;
  return new;
end;
$$;

create trigger month_closings_apply
  after insert on app.month_closings
  for each row execute function app.apply_month_closing();

create trigger month_closings_append_only
  before update or delete on app.month_closings
  for each row execute function app.reject_change();

create trigger month_closings_no_truncate
  before truncate on app.month_closings
  for each statement execute function app.reject_change();

create trigger employees_inherit_closed_through
  before insert on app.employees
  for each row execute function app.inherit_closed_through();

create trigger flex_bookings_period_lock
  after insert on app.flex_bookings
  for each row execute function app.enforce_period_lock('effective_date');

create trigger flex_bookings_append_only
  before update or delete on app.flex_bookings
  for each row execute function app.reject_change();

create trigger flex_bookings_no_truncate
  before truncate on app.flex_bookings
  for each statement execute function app.reject_change();

create trigger audit_month_closings
  after insert or update or delete on app.month_closings
  for each row execute function audit.track();

create trigger audit_flex_bookings
  after insert or update or delete on app.flex_bookings
  for each row execute function audit.track();

alter table app.month_closings enable row level security, force row level security;
alter table app.flex_bookings enable row level security, force row level security;

create policy "tenant fence" on app.month_closings as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "members read closings" on app.month_closings for select to zeit_app
  using (true);

create policy "hr closes, admins reopen" on app.month_closings for insert to zeit_app
  with check ((select app.role()) >= 'hr' and (action = 'close' or (select app.role()) = 'admin'));

create policy "tenant fence" on app.flex_bookings as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "read own flex bookings" on app.flex_bookings for select to zeit_app
  using (employee_id = (select app.employee_id()));

create policy "leads read their team's flex bookings" on app.flex_bookings for select to zeit_app
  using (app.leads(employee_id));

create policy "hr books flex time" on app.flex_bookings for all to zeit_app
  using ((select app.role()) >= 'hr');

grant select, insert on app.month_closings, app.flex_bookings to zeit_app;

grant select on app.month_closings to zeit_system;
grant update (closed_through) on app.employees to zeit_system;

grant create on schema app to zeit_system;
alter function app.apply_month_closing() owner to zeit_system;
revoke create on schema app from zeit_system;

revoke all on function app.apply_month_closing() from public;

-- migrate:down
revoke update (closed_through) on app.employees from zeit_system;

drop trigger employees_inherit_closed_through on app.employees;
drop table app.flex_bookings;
drop table app.month_closings;

drop function app.inherit_closed_through();
drop function app.apply_month_closing();

drop type app.month_closing_action;
drop type app.flex_booking_type;
