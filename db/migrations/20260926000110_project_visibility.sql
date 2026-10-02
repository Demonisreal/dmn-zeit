-- migrate:up
drop function app.bookable_projects();

create function app.bookable_projects()
returns table (
  id uuid,
  project_name text,
  client_name text,
  billable boolean,
  rounding_increment_min smallint,
  rounding_mode app.rounding_mode,
  tasks jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, c.name, p.billable, p.rounding_increment_min, p.rounding_mode,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'billable', t.billable) order by t.name)
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

create or replace function app.project_labels(p_ids uuid[])
returns table (id uuid, project_name text, client_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         case when c.restricted_at is null or app.role() >= 'hr' then p.name else 'gesperrt' end,
         case when c.restricted_at is null or app.role() >= 'hr' then c.name else 'gesperrt' end
    from app.projects p
    join app.clients c on c.id = p.client_id
   where p.id = any (p_ids)
     and p.tenant_id = app.tenant_id();
$$;

create function app.project_budget_status(p_project_id uuid)
returns table (budget_minutes integer, used_minutes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.budget_minutes,
         coalesce((
           select sum(round(extract(epoch from (e.ended_at - e.started_at)) / 60))::integer
             from app.project_entries e
             left join app.tasks t on t.id = e.task_id
            where e.project_id = p.id
              and e.ended_at is not null
              and e.voided_at is null
              and coalesce(e.billable, t.billable, p.billable)
         ), 0)
    from app.projects p
   where p.id = p_project_id
     and p.tenant_id = app.tenant_id()
     and app.employee_id() is not null;
$$;

grant select (project_id, task_id, started_at, ended_at, billable, voided_at)
  on app.project_entries to zeit_system;

grant create on schema app to zeit_system;
alter function app.bookable_projects() owner to zeit_system;
alter function app.project_budget_status(uuid) owner to zeit_system;
revoke create on schema app from zeit_system;

revoke all on function app.bookable_projects(), app.project_budget_status(uuid) from public;
grant execute on function app.bookable_projects(), app.project_labels(uuid[]), app.project_budget_status(uuid)
  to zeit_app;

-- migrate:down
drop function app.project_budget_status(uuid);

revoke select (project_id, task_id, started_at, ended_at, billable, voided_at)
  on app.project_entries from zeit_system;

drop function app.bookable_projects();

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

create or replace function app.project_labels(p_ids uuid[])
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

grant create on schema app to zeit_system;
alter function app.bookable_projects() owner to zeit_system;
revoke create on schema app from zeit_system;

revoke all on function app.bookable_projects() from public;
grant execute on function app.bookable_projects() to zeit_app;
