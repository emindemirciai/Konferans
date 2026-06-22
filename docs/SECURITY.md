# Security Notes

## Secrets

Never commit real values for:

- `JWT_SECRET`
- `LIVEKIT_API_SECRET`
- `GOOGLE_CLIENT_ID` if private app context requires secrecy
- SMTP credentials
- Webhook secrets
- Integration client secrets
- Push provider keys

Use `.env` locally and Dokploy environment variables in production.

## Registration

Default configuration is invite-only:

```text
INVITE_ONLY=true
ALLOW_PUBLIC_REGISTRATION=false
```

To open public registration later:

```text
ALLOW_PUBLIC_REGISTRATION=true
```

## API protection

- Rate limiting is enabled by default.
- CORS should only include real front-end origins in production.
- Keep `TRUST_PROXY=true` behind Dokploy/reverse proxy.
- API port can be hidden when routed through `api-meet.example.com`.

## Moderation model

- Owner > Admin > Moderator > Member > Guest.
- Users cannot moderate roles equal or higher than their own role.
- All moderation actions should be logged through `AuditLog` and `ModerationAction`.

## Media security

LiveKit tokens are generated server-side and scoped to a single room/channel.

The token metadata contains:

- server id
- channel id
- role
- server mute/deafen state
- camera/screen-share permission
- push-to-talk requirement
- low-latency mode flag
