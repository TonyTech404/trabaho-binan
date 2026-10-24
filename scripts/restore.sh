#!/usr/bin/env bash
# Restore an encrypted backup made by scripts/backup.sh into an EMPTY database.
# See docs/operations.md for the full procedure (including re-applying grants).
#
#   RESTORE_DATABASE_URL=postgresql://... \
#   BACKUP_PASSPHRASE_FILE=~/secure/trabaho-backup-passphrase \
#   scripts/restore.sh backups/trabaho-binan-20261024T000000Z.dump.gpg
#
# Use pg_restore from PostgreSQL 18 or newer (PG_RESTORE=/path/to/pg_restore).
set -euo pipefail

: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to the target database}"
FILE="${1:?Usage: scripts/restore.sh <backup.dump.gpg>}"
PG_RESTORE="${PG_RESTORE:-pg_restore}"
PSQL="${PSQL:-psql}"

if [[ -f "$FILE.sha256" ]]; then
  if command -v sha256sum >/dev/null; then
    (cd "$(dirname "$FILE")" && sha256sum --check "$(basename "$FILE").sha256")
  else
    (cd "$(dirname "$FILE")" && shasum -a 256 --check "$(basename "$FILE").sha256")
  fi
fi

TABLES="$("$PSQL" "$RESTORE_DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_schema = 'public'")"
if [[ "$TABLES" != "0" ]]; then
  echo "Refusing to restore: the target database already has $TABLES tables. Use an empty database." >&2
  exit 1
fi

if [[ -n "${BACKUP_PASSPHRASE_FILE:-}" ]]; then
  DECRYPT=(gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" --decrypt "$FILE")
else
  DECRYPT=(gpg --batch --quiet --decrypt "$FILE")
fi

"${DECRYPT[@]}" | "$PG_RESTORE" --no-owner --no-privileges --exit-on-error --dbname="$RESTORE_DATABASE_URL"

echo "Restored. Row counts:"
"$PSQL" "$RESTORE_DATABASE_URL" -Atc "
  select 'users', count(*) from users union all
  select 'organizations', count(*) from organizations union all
  select 'jobs', count(*) from jobs union all
  select 'audit_events', count(*) from audit_events union all
  select 'migrations', count(*) from drizzle.__drizzle_migrations"
