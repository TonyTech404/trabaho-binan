#!/usr/bin/env bash
# Encrypted logical backup of a Trabaho Biñan database (independent of Neon's
# short free restore window). See docs/operations.md.
#
#   BACKUP_DATABASE_URL=postgresql://... \
#   BACKUP_PASSPHRASE_FILE=~/secure/trabaho-backup-passphrase \
#   scripts/backup.sh [output-dir]
#
# Encryption: set BACKUP_GPG_RECIPIENT (public-key, preferred when the person
# restoring holds the private key) or BACKUP_PASSPHRASE_FILE (AES-256).
# Use pg_dump from PostgreSQL 18 or newer (PG_DUMP=/path/to/pg_dump).
set -euo pipefail

: "${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL to the database connection string}"
OUT_DIR="${1:-./backups}"
PG_DUMP="${PG_DUMP:-pg_dump}"

umask 077
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/trabaho-binan-$STAMP.dump.gpg"

if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  ENCRYPT=(gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "$FILE")
elif [[ -n "${BACKUP_PASSPHRASE_FILE:-}" ]]; then
  ENCRYPT=(gpg --batch --yes --symmetric --cipher-algo AES256 --pinentry-mode loopback
    --passphrase-file "$BACKUP_PASSPHRASE_FILE" --output "$FILE")
else
  echo "Set BACKUP_GPG_RECIPIENT or BACKUP_PASSPHRASE_FILE; unencrypted backups are not allowed." >&2
  exit 1
fi

# Custom format, without owners or grants, so it restores into any empty database.
"$PG_DUMP" --format=custom --no-owner --no-privileges --dbname="$BACKUP_DATABASE_URL" | "${ENCRYPT[@]}"

if command -v sha256sum >/dev/null; then
  (cd "$OUT_DIR" && sha256sum "$(basename "$FILE")" >"$(basename "$FILE").sha256")
else
  (cd "$OUT_DIR" && shasum -a 256 "$(basename "$FILE")" >"$(basename "$FILE").sha256")
fi
echo "Encrypted backup written to $FILE"
