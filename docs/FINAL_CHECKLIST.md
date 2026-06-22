# Final Deployment Checklist

## Before GitHub push

- [ ] Replace project placeholder secrets only in `.env`, not in code.
- [ ] Confirm `.env` is ignored by Git.
- [ ] Run `pnpm install`.
- [ ] Run `pnpm prisma:generate`.
- [ ] Run `pnpm db:push`.
- [ ] Run `pnpm db:seed`.
- [ ] Run `pnpm check` if dependencies are installed.

## Before Dokploy deployment

- [ ] VPS firewall allows `80/tcp`, `443/tcp`, `7880/tcp`, `7881/tcp`, `50000-50100/udp`.
- [ ] `JWT_SECRET` changed.
- [ ] LiveKit API key/secret changed.
- [ ] SMTP configured.
- [ ] Google OAuth configured.
- [ ] `CORS_ORIGIN` set to your real web domain.
- [ ] `PUBLIC_WEB_URL`, `PUBLIC_API_URL`, `LIVEKIT_PUBLIC_WS_URL` set correctly.

## First production smoke test

- [ ] `/health` returns OK.
- [ ] Web login page loads.
- [ ] Admin seed user can log in.
- [ ] Invite code registration works.
- [ ] Text message sends.
- [ ] Voice room joins.
- [ ] Camera toggles.
- [ ] Screen share works from desktop browser.
- [ ] Mobile dev build can connect.
- [ ] Embed page opens.
- [ ] Backup script produces a `.sql.gz` file.
