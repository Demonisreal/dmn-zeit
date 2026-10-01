#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set db="$POSTGRES_DB" \
  --set owner_password="$ZEIT_OWNER_PASSWORD" \
  --set app_password="$ZEIT_APP_PASSWORD" \
  --set backup_password="${ZEIT_BACKUP_PASSWORD:-}" <<'SQL'
create role zeit_owner login password :'owner_password';
create role zeit_app login nobypassrls password :'app_password';
create role zeit_system nologin bypassrls;

alter role zeit_app set statement_timeout = '15s';
alter role zeit_app set idle_in_transaction_session_timeout = '30s';

grant zeit_system to zeit_owner;

alter database :"db" owner to zeit_owner;
revoke all on database :"db" from public;
grant connect on database :"db" to zeit_app;

create role zeit_backup nologin bypassrls;
grant pg_read_all_data to zeit_backup;
grant connect on database :"db" to zeit_backup;

select :'backup_password' <> '' as backup_login \gset
\if :backup_login
	alter role zeit_backup login password :'backup_password';
\endif
SQL
