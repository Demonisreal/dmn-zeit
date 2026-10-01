-- migrate:up
grant execute on function app.round_div(bigint, bigint) to zeit_app;

alter table app.invoice_lines
  add constraint invoice_lines_minutes_range check (minutes between -10000000 and 10000000),
  add constraint invoice_lines_quantity_range check (quantity_milli between -1000000000 and 1000000000),
  add constraint invoice_lines_price_range check (unit_price_cents between -1000000000 and 1000000000),
  add constraint invoice_lines_net_cents check (
    net_cents = case kind
      when 'time' then app.round_div(minutes * unit_price_cents, 60)
      else app.round_div(quantity_milli * unit_price_cents, 1000)
    end
  );

-- migrate:down
alter table app.invoice_lines
  drop constraint invoice_lines_net_cents,
  drop constraint invoice_lines_price_range,
  drop constraint invoice_lines_quantity_range,
  drop constraint invoice_lines_minutes_range;

revoke execute on function app.round_div(bigint, bigint) from zeit_app;
