-- migrate:up
create type app.rounding_mode as enum ('up', 'nearest', 'down');
create type app.project_entry_source as enum ('timer', 'manual', 'seed');

create table app.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  number text check (btrim(number) <> ''),
  name text not null check (btrim(name) <> ''),
  street text,
  postal_code text,
  city text,
  country_code char(2) not null default 'DE' check (country_code ~ '^[A-Z]{2}$'),
  is_business boolean not null default true,
  vat_id text,
  email public.citext,
  buyer_reference text,
  invoice_locale text not null default 'de' check (invoice_locale in ('de', 'en')),
  payment_terms_days smallint check (payment_terms_days between 0 and 120),
  rounding_increment_min smallint check (rounding_increment_min in (1, 5, 6, 10, 15, 30, 60)),
  rounding_mode app.rounding_mode,
  archived_at timestamptz,
  restricted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, number),
  check (restricted_at is null or archived_at is not null)
);

create table app.projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  client_id uuid not null,
  name text not null check (btrim(name) <> ''),
  code text check (btrim(code) <> ''),
  billable boolean not null default true,
  budget_minutes integer check (budget_minutes > 0),
  rounding_increment_min smallint check (rounding_increment_min in (1, 5, 6, 10, 15, 30, 60)),
  rounding_mode app.rounding_mode,
  open_to_all boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, client_id, id),
  unique (tenant_id, code),
  foreign key (tenant_id, client_id) references app.clients (tenant_id, id)
);

create table app.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  client_id uuid not null,
  project_id uuid not null,
  name text not null check (btrim(name) <> ''),
  billable boolean,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, project_id, id),
  foreign key (tenant_id, client_id, project_id) references app.projects (tenant_id, client_id, id)
);

create table app.project_members (
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  project_id uuid not null,
  employee_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (project_id, employee_id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id) on delete cascade,
  foreign key (tenant_id, employee_id) references app.employees (tenant_id, id) on delete cascade
);

create index project_members_employee_idx on app.project_members (employee_id);

create table app.rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  client_id uuid,
  project_id uuid,
  task_id uuid,
  employee_id uuid,
  valid_from date not null,
  rate_cents bigint not null check (rate_cents between 0 and 10000000),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique nulls not distinct (tenant_id, client_id, project_id, task_id, employee_id, valid_from),
  foreign key (tenant_id, client_id) references app.clients (tenant_id, id),
  foreign key (tenant_id, client_id, project_id) references app.projects (tenant_id, client_id, id),
  foreign key (tenant_id, project_id, task_id) references app.tasks (tenant_id, project_id, id),
  foreign key (tenant_id, employee_id) references app.employees (tenant_id, id),
  foreign key (tenant_id, created_by) references app.users (tenant_id, id),
  check (task_id is null or project_id is not null),
  check (project_id is null or client_id is not null)
);

create table app.project_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenants (id) on delete cascade,
  employee_id uuid not null,
  project_id uuid not null,
  task_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  workday date not null generated always as ((started_at at time zone 'Europe/Berlin')::date) stored,
  note text check (btrim(note) <> ''),
  billable boolean,
  source app.project_entry_source not null,
  invoice_id uuid,
  voided_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, employee_id) references app.employees (tenant_id, id),
  foreign key (tenant_id, project_id) references app.projects (tenant_id, id),
  foreign key (tenant_id, project_id, task_id) references app.tasks (tenant_id, project_id, id),
  foreign key (tenant_id, created_by) references app.users (tenant_id, id),
  check (ended_at > started_at),
  check (source <> 'manual' or (ended_at is not null and note is not null)),
  check (invoice_id is null or (ended_at is not null and voided_at is null))
);

create unique index project_entries_one_running_idx on app.project_entries (employee_id)
  where ended_at is null and voided_at is null;

alter table app.project_entries add constraint project_entries_no_overlap
  exclude using gist (employee_id with =, tstzrange(started_at, ended_at, '[)') with &&)
  where (voided_at is null);

create index project_entries_employee_day_idx on app.project_entries (tenant_id, employee_id, workday);
create index project_entries_unbilled_idx on app.project_entries (tenant_id, project_id, workday)
  where invoice_id is null and voided_at is null and ended_at is not null;

create function app.bookable(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from app.projects p
     where p.id = p_project_id
       and p.tenant_id = app.tenant_id()
       and p.archived_at is null
       and (p.open_to_all or exists (
         select 1
           from app.project_members m
          where m.project_id = p.id
            and m.employee_id = app.employee_id()
       ))
  )
$$;

create function app.bookable_projects()
returns table (id uuid, project_name text, client_name text, tasks jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, c.name,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
             from app.tasks t
            where t.project_id = p.id
              and t.archived_at is null
         ), '[]')
    from app.projects p
    join app.clients c on c.id = p.client_id
   where p.tenant_id = app.tenant_id()
     and app.bookable(p.id)
   order by c.name, p.name;
$$;

create function app.project_labels(p_ids uuid[])
returns table (id uuid, project_name text, client_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, c.name
    from app.projects p
    join app.clients c on c.id = p.client_id
   where p.id = any (p_ids)
     and p.tenant_id = app.tenant_id();
$$;

create function app.guard_project_entry()
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

create trigger project_entries_guard
  before insert or update or delete on app.project_entries
  for each row execute function app.guard_project_entry();

create trigger project_entries_no_truncate
  before truncate on app.project_entries
  for each statement execute function app.reject_change();

create trigger clients_set_updated_at
  before update on app.clients
  for each row execute function app.set_updated_at();

create trigger projects_set_updated_at
  before update on app.projects
  for each row execute function app.set_updated_at();

create trigger tasks_set_updated_at
  before update on app.tasks
  for each row execute function app.set_updated_at();

create trigger project_entries_set_updated_at
  before update on app.project_entries
  for each row execute function app.set_updated_at();

create trigger audit_clients
  after insert or update or delete on app.clients
  for each row execute function audit.track();

create trigger audit_projects
  after insert or update or delete on app.projects
  for each row execute function audit.track();

create trigger audit_tasks
  after insert or update or delete on app.tasks
  for each row execute function audit.track();

create trigger audit_project_members
  after insert or update or delete on app.project_members
  for each row execute function audit.track();

create trigger audit_rates
  after insert or update or delete on app.rates
  for each row execute function audit.track();

create trigger audit_project_entries
  after insert or update or delete on app.project_entries
  for each row execute function audit.track();

alter table app.clients enable row level security, force row level security;
alter table app.projects enable row level security, force row level security;
alter table app.tasks enable row level security, force row level security;
alter table app.project_members enable row level security, force row level security;
alter table app.rates enable row level security, force row level security;
alter table app.project_entries enable row level security, force row level security;

create policy "tenant fence" on app.clients as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "hr manages clients" on app.clients for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.projects as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "hr manages projects" on app.projects for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.tasks as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "hr manages tasks" on app.tasks for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.project_members as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "hr manages project members" on app.project_members for all to zeit_app
  using ((select app.role()) >= 'hr');

create policy "tenant fence" on app.rates as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "hr reads rates" on app.rates for select to zeit_app
  using ((select app.role()) >= 'hr');

create policy "hr adds rates" on app.rates for insert to zeit_app
  with check ((select app.role()) >= 'hr');

create policy "hr removes future rates" on app.rates for delete to zeit_app
  using ((select app.role()) >= 'hr' and valid_from > (now() at time zone 'Europe/Berlin')::date);

create policy "tenant fence" on app.project_entries as restrictive to zeit_app
  using (tenant_id = (select app.tenant_id()));

create policy "read own project entries" on app.project_entries for select to zeit_app
  using (employee_id = (select app.employee_id()));

create policy "book own project entries" on app.project_entries for insert to zeit_app
  with check (employee_id = (select app.employee_id()) and invoice_id is null);

create policy "edit own project entries" on app.project_entries for update to zeit_app
  using (employee_id = (select app.employee_id()))
  with check (employee_id = (select app.employee_id()));

create policy "leads read their team's project entries" on app.project_entries for select to zeit_app
  using (app.leads(employee_id));

create policy "hr manages project entries" on app.project_entries for all to zeit_app
  using ((select app.role()) >= 'hr');

grant select, insert, delete on app.clients, app.projects, app.tasks to zeit_app;
grant update (
  number, name, street, postal_code, city, country_code, is_business, vat_id, email, buyer_reference,
  invoice_locale, payment_terms_days, rounding_increment_min, rounding_mode, archived_at, restricted_at
) on app.clients to zeit_app;
grant update (name, code, billable, budget_minutes, rounding_increment_min, rounding_mode, open_to_all, archived_at)
  on app.projects to zeit_app;
grant update (name, billable, archived_at) on app.tasks to zeit_app;
grant select, insert, delete on app.project_members, app.rates to zeit_app;
grant select, insert on app.project_entries to zeit_app;
grant update (project_id, task_id, started_at, ended_at, note, billable, voided_at, invoice_id)
  on app.project_entries to zeit_app;

grant select on app.clients, app.projects, app.tasks, app.project_members to zeit_system;

grant create on schema app to zeit_system;
alter function app.bookable(uuid) owner to zeit_system;
alter function app.bookable_projects() owner to zeit_system;
alter function app.project_labels(uuid[]) owner to zeit_system;
revoke create on schema app from zeit_system;

revoke all on function app.bookable(uuid), app.bookable_projects(), app.project_labels(uuid[]) from public;
grant execute on function app.bookable(uuid), app.bookable_projects(), app.project_labels(uuid[]) to zeit_app;

-- migrate:down
drop table app.project_entries;
drop table app.rates;
drop table app.project_members;
drop table app.tasks;
drop table app.projects;
drop table app.clients;

drop function app.guard_project_entry();
drop function app.project_labels(uuid[]);
drop function app.bookable_projects();
drop function app.bookable(uuid);

drop type app.project_entry_source;
drop type app.rounding_mode;
