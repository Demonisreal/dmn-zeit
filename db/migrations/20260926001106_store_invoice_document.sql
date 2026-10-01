-- migrate:up
create function app.store_invoice_document(p_invoice_id uuid, p_format text, p_content bytea)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored uuid;
begin
  if (app.role() >= 'hr') is not true then
    raise exception 'only hr and admins store invoice documents' using errcode = 'insufficient_privilege';
  end if;

  insert into app.invoice_documents (tenant_id, invoice_id, format, content, sha256, created_by)
  values (app.tenant_id(), p_invoice_id, p_format, p_content, sha256(p_content), app.user_id())
  on conflict (tenant_id, invoice_id, format) do nothing
  returning id into stored;

  return stored;
end;
$$;

drop policy "hr stores invoice documents" on app.invoice_documents;
revoke insert on app.invoice_documents from zeit_app;
grant select, insert on app.invoice_documents to zeit_system;

grant create on schema app to zeit_system;
alter function app.store_invoice_document(uuid, text, bytea) owner to zeit_system;
revoke create on schema app from zeit_system;

revoke all on function app.store_invoice_document(uuid, text, bytea) from public;
grant execute on function app.store_invoice_document(uuid, text, bytea) to zeit_app;

-- migrate:down
revoke execute on function app.store_invoice_document(uuid, text, bytea) from zeit_app;
drop function app.store_invoice_document(uuid, text, bytea);

revoke select, insert on app.invoice_documents from zeit_system;
grant insert on app.invoice_documents to zeit_app;
create policy "hr stores invoice documents" on app.invoice_documents for insert to zeit_app
  with check ((select app.role()) >= 'hr');
