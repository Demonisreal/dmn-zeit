-- migrate:up
create index invoice_line_entries_invoice_idx on app.invoice_line_entries (tenant_id, invoice_id);
create index invoice_line_entries_entry_idx on app.invoice_line_entries (tenant_id, entry_id);
create index project_entries_invoice_idx on app.project_entries (tenant_id, invoice_id)
  where invoice_id is not null;

-- migrate:down
drop index app.project_entries_invoice_idx;
drop index app.invoice_line_entries_entry_idx;
drop index app.invoice_line_entries_invoice_idx;
