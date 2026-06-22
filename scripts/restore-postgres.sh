#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: bash scripts/restore-postgres.sh ./backups/letsmeet-YYYYMMDD-HHMMSS.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-lets-meet-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-letsmeet}"
POSTGRES_DB="${POSTGRES_DB:-letsmeet}"

echo "Restoring $BACKUP_FILE into $POSTGRES_DB"
gunzip -c "$BACKUP_FILE" | docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" "$POSTGRES_DB"
echo "Restore completed"
