# Lets Meet v4 Production Layer

v4 adds production-focused structure: rate limiting, health checks, backup scripts, CI, reverse proxy examples and deployment hardening.

## Added production features

- In-memory API rate limiter in `apps/api/src/rate-limit.ts`.
- `/health` root API endpoint.
- `/api/system/status` global-admin status endpoint.
- Docker health checks for API and web.
- `scripts/backup-postgres.sh`.
- `scripts/restore-postgres.sh`.
- GitHub Actions workflow in `.github/workflows/ci.yml`.
- Caddy and Nginx production examples.

## Production recommendations

Use reverse proxy + SSL for web, API and LiveKit:

```text
https://meet.example.com
https://api-meet.example.com
wss://livekit.example.com
```

Open the LiveKit UDP media range on the VPS firewall:

```text
50000-50100/udp
```

Keep the API private behind reverse proxy when possible. If port `4000` stays public during testing, keep rate limiting enabled.

## Dokploy deployment order

1. Create Docker Compose project from repo root.
2. Paste `.env` values into Dokploy environment panel.
3. Deploy PostgreSQL, Redis, LiveKit, API and Web with the root `docker-compose.yml`.
4. Check API health: `/health`.
5. Run seed once.
6. Confirm LiveKit WebSocket URL from browser/mobile.
7. Switch temporary IP URLs to real domains.

## Database backups

Backups should be automated from the VPS host using cron or Dokploy scheduled jobs.

Example cron:

```cron
0 4 * * * cd /path/to/lets-meet && BACKUP_DIR=/srv/lets-meet/backups bash scripts/backup-postgres.sh
```
