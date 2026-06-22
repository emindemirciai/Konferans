# Backup and Restore

## Backup

```bash
BACKUP_DIR=./backups bash scripts/backup-postgres.sh
```

The script creates:

```text
./backups/letsmeet-YYYYMMDD-HHMMSS.sql.gz
```

## Restore

```bash
bash scripts/restore-postgres.sh ./backups/letsmeet-YYYYMMDD-HHMMSS.sql.gz
```

## Dokploy/VPS note

Container names can differ by Dokploy project name. Override if needed:

```bash
POSTGRES_CONTAINER=myproject-postgres-1 bash scripts/backup-postgres.sh
```

## Minimum backup policy

- Daily database backup.
- Keep 7 daily backups.
- Keep 4 weekly backups.
- Test restore monthly.
- Store at least one copy outside the VPS.
