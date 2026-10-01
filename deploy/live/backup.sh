#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

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

rclone copy "$file" "$remote"
