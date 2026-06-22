#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-lets-meet-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-letsmeet}"
POSTGRES_DB="${POSTGRES_DB:-letsmeet}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/letsmeet-$STAMP.sql.gz"

echo "Creating PostgreSQL backup: $OUT"
docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"
echo "Backup completed: $OUT"
