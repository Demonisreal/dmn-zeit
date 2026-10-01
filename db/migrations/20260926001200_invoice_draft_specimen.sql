-- migrate:up
create function app.mark_specimen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.specimen := exists (select 1 from app.tenants t where t.id = new.tenant_id and t.kind = 'sandbox');
  return new;
end;
$$;

create trigger invoices_mark_specimen
  before insert on app.invoices
  for each row execute function app.mark_specimen();

grant create on schema app to zeit_system;
alter function app.mark_specimen() owner to zeit_system;
revoke create on schema app from zeit_system;

-- migrate:down
drop trigger invoices_mark_specimen on app.invoices;
drop function app.mark_specimen();
