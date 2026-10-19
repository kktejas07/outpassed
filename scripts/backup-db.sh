#!/bin/sh
# Nightly Postgres backup for Outpass.
#
#   DATABASE_URL=postgresql://... BACKUP_DIR=/backups KEEP_DAYS=14 ./scripts/backup-db.sh
#
# Writes a compressed custom-format dump (restore with pg_restore) and deletes
# dumps older than KEEP_DAYS. Run it from cron on the server, e.g.
#   15 2 * * *  DATABASE_URL=... /opt/outpass/scripts/backup-db.sh >> /var/log/outpass-backup.log 2>&1
# Copy BACKUP_DIR off the server (S3, another disk) — a backup on the same disk
# doesn't survive the disk.
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/outpass-$STAMP.dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$FILE.part"
mv "$FILE.part" "$FILE"
# A quick integrity check: the dump's table of contents must be readable.
pg_restore --list "$FILE" > /dev/null
find "$BACKUP_DIR" -name 'outpass-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
