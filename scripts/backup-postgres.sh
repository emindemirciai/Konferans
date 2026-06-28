#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-konferans-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-konferans}"
POSTGRES_DB="${POSTGRES_DB:-konferans}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/konferans-$STAMP.sql.gz"

echo "Creating PostgreSQL backup: $OUT"
docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"
echo "Backup completed: $OUT"
