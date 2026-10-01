-- migrate:up
alter function app.guard_tenant_retention() security definer;

grant create on schema app to zeit_system;
alter function app.guard_tenant_retention() owner to zeit_system;
revoke create on schema app from zeit_system;

-- migrate:down
alter function app.guard_tenant_retention() owner to zeit_owner;
alter function app.guard_tenant_retention() security invoker;
