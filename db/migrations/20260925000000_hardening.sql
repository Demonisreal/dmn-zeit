-- migrate:up
drop policy "members read closings" on app.month_closings;

create policy "hr reads closings" on app.month_closings for select to zeit_app
  using ((select app.role()) >= 'hr');

create function app.flex_checkpoint(p_employee_id uuid, p_year integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  minutes integer;
begin
  if (p_employee_id = app.employee_id() or app.leads(p_employee_id) or app.role() >= 'hr') is not true then
    raise exception 'employee % is not visible', p_employee_id using errcode = 'insufficient_privilege';
  end if;

  select case when c.action = 'close' then
           (c.snapshot -> 'employees' -> p_employee_id::text ->> 'flexBalanceMinutes')::integer
         end
    into minutes
    from app.month_closings c
   where c.tenant_id = app.tenant_id()
     and c.month = make_date(p_year - 1, 12, 1)
   order by c.created_at desc
   limit 1;

  return minutes;
end;
$$;

create function app.month_snapshot(p_employee_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  figures jsonb;
begin
  if (p_employee_id = app.employee_id() or app.leads(p_employee_id) or app.role() >= 'hr') is not true then
    raise exception 'employee % is not visible', p_employee_id using errcode = 'insufficient_privilege';
  end if;

  select case when c.action = 'close' then c.snapshot -> 'employees' -> p_employee_id::text end
    into figures
    from app.month_closings c
   where c.tenant_id = app.tenant_id()
     and c.month = date_trunc('month', p_month)::date
   order by c.created_at desc
   limit 1;

  return figures;
end;
$$;

alter table app.absence_requests add constraint absence_requests_sick_no_overlap
  exclude using gist (employee_id with =, daterange(start_date, end_date, '[]') with &&)
  where (type = 'sick' and status in ('approved', 'cancel_pending'));

grant create on schema app to zeit_system;
alter function app.flex_checkpoint(uuid, integer) owner to zeit_system;
alter function app.month_snapshot(uuid, date) owner to zeit_system;
revoke create on schema app from zeit_system;

revoke all on function app.flex_checkpoint(uuid, integer) from public;
revoke all on function app.month_snapshot(uuid, date) from public;
grant execute on function app.flex_checkpoint(uuid, integer) to zeit_app;
grant execute on function app.month_snapshot(uuid, date) to zeit_app;

-- migrate:down
alter table app.absence_requests drop constraint absence_requests_sick_no_overlap;

drop function app.month_snapshot(uuid, date);
drop function app.flex_checkpoint(uuid, integer);

drop policy "hr reads closings" on app.month_closings;

create policy "members read closings" on app.month_closings for select to zeit_app
  using (true);
