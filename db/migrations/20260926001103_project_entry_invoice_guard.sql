-- migrate:up
create function app.guard_project_entry_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  held app.invoice_status;
  target record;
begin
  if tg_op = 'UPDATE' and new.invoice_id is not distinct from old.invoice_id then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.invoice_id is not null then
    select i.status into held
      from app.invoices i
     where i.tenant_id = old.tenant_id and i.id = old.invoice_id
       for share;
    if held in ('issued', 'paid') then
      raise exception 'project entry % is invoiced', old.id using errcode = 'ZT004';
    end if;
  end if;

  if new.invoice_id is not null then
    select i.status, i.client_id into target
      from app.invoices i
     where i.tenant_id = new.tenant_id and i.id = new.invoice_id
       for share;
    if target.status is distinct from 'draft' then
      raise exception 'invoice % is not an open draft', new.invoice_id using errcode = 'ZT003';
    end if;
    if not exists (
      select 1 from app.projects p
       where p.tenant_id = new.tenant_id and p.id = new.project_id and p.client_id = target.client_id
    ) then
      raise exception 'project entry % is not for the client of invoice %', new.id, new.invoice_id
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger project_entries_guard_invoice
  before insert or update of invoice_id on app.project_entries
  for each row execute function app.guard_project_entry_invoice();

grant create on schema app to zeit_system;
alter function app.guard_project_entry_invoice() owner to zeit_system;
revoke create on schema app from zeit_system;

-- migrate:down
drop trigger project_entries_guard_invoice on app.project_entries;
drop function app.guard_project_entry_invoice();
