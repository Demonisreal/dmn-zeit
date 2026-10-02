-- migrate:up
create trigger invoice_lines_sandbox_quota
  after insert on app.invoice_lines referencing new table as added
  for each statement when (current_user not in ('zeit_system', 'zeit_owner'))
  execute function app.sandbox_quota(2000);

-- migrate:down
drop trigger invoice_lines_sandbox_quota on app.invoice_lines;
