#!/usr/bin/env bash
set -euo pipefail

# run from anywhere, but .env and compose.yml sit next to this script
cd "$(dirname "$0")"

# read only what this script needs, not the whole .env: values like MAIL_FROM aren't valid shell
backup_dir=$(grep -E '^BACKUP_DIR=' .env 2>/dev/null | cut -d= -f2-)
backup_dir=${backup_dir:-./backups}
keep_days=$(grep -E '^BACKUP_KEEP_DAYS=' .env 2>/dev/null | cut -d= -f2-)
keep_days=${keep_days:-14}
age_recipient=$(grep -E '^BACKUP_AGE_RECIPIENT=' .env 2>/dev/null | cut -d= -f2-)
remote=$(grep -E '^BACKUP_REMOTE=' .env 2>/dev/null | cut -d= -f2-)

if [ -z "$age_recipient" ]; then
	echo "BACKUP_AGE_RECIPIENT missing in .env, refusing to write an unencrypted dump" >&2
	exit 1
fi
if [ -z "$remote" ]; then
	echo "BACKUP_REMOTE missing in .env, refusing to skip the off-site copy" >&2
	exit 1
fi

umask 077
mkdir -p "$backup_dir"

file="$backup_dir/zeit-live-$(date +%Y%m%d-%H%M%S).dump.age"
trap 'rm -f "$file.part"' EXIT

docker compose -f compose.yml --profile backup run --rm -T zeit-live-backup \
	| age -r "$age_recipient" > "$file.part"
mv "$file.part" "$file"

find "$backup_dir" -name 'zeit-live-*.dump.age' -mtime "+$keep_days" -delete

# off-site copy; enable versioning or object lock on $BACKUP_REMOTE itself, this script can't enforce either
rclone copy "$file" "$remote"

# restore:
#   1. age -d -i <identity-file> <dump-file>.age > <dump-file>
#   2. docker compose -f compose.yml stop zeit-live-web zeit-live-api
#   3. docker compose -f compose.yml up -d zeit-live-db
#   4. docker compose -f compose.yml exec -T zeit-live-db \
#        pg_restore -U postgres -d zeit --clean --if-exists --single-transaction < <dump-file>
#   5. docker compose -f compose.yml up -d
# zeit_owner can't hand the functions over to zeit_system, restore has to run as postgres
# test this monthly against a throwaway database, not against zeit-live-db directly
