-- migrate:up
create trigger audit_invoice_counters
  after insert or update or delete on app.invoice_counters
  for each row execute function audit.track();

-- migrate:down
drop trigger audit_invoice_counters on app.invoice_counters;
