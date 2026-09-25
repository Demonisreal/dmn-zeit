#!/bin/sh
set -eu

# run from anywhere, but .env and compose.yml sit next to this script
cd "$(dirname "$0")"

# read only what this script needs, not the whole .env: values like MAIL_FROM aren't valid shell
backup_dir=$(grep -E '^BACKUP_DIR=' .env 2>/dev/null | cut -d= -f2-)
backup_dir=${backup_dir:-./backups}
keep_days=$(grep -E '^BACKUP_KEEP_DAYS=' .env 2>/dev/null | cut -d= -f2-)
keep_days=${keep_days:-14}

mkdir -p "$backup_dir"
umask 077

file="$backup_dir/zeit-live-$(date +%Y%m%d-%H%M%S).dump"
docker compose -f compose.yml --profile backup run --rm -T zeit-live-backup > "$file.part"
mv "$file.part" "$file"

find "$backup_dir" -name 'zeit-live-*.dump' -mtime "+$keep_days" -delete

# restore as postgres, zeit_owner can't hand the functions over to zeit_system:
#   1. docker compose -f compose.yml stop zeit-live-web zeit-live-api
#   2. docker compose -f compose.yml up -d zeit-live-db
#   3. docker compose -f compose.yml exec -T zeit-live-db \
#        pg_restore -U postgres -d zeit --clean --if-exists --single-transaction < <dump-file>
#   4. docker compose -f compose.yml up -d
# test this monthly against a throwaway database, not against zeit-live-db directly
