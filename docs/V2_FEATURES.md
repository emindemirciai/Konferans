# Lets Meet v2 Feature Layer

This file documents the second development layer added on top of the clean repo.

## Added backend modules

### Roles and permissions

- Member roles: `OWNER`, `ADMIN`, `MODERATOR`, `MEMBER`, `GUEST`.
- Channel permission overrides per role:
  - view channel
  - send message
  - join voice
  - publish video
  - share screen
  - manage channel
- Server member states: active, kicked, banned.

### Moderation

API support for:

- mute / unmute
- deafen / undeafen
- kick
- ban / unban
- moderation reason
- optional duration for temporary mutes/bans
- moderation audit trail

### Friends and direct messages

- Friend request by email.
- Accept, decline, block.
- Direct message storage for accepted friends.
- Socket event support for realtime DMs.

### Gaming voice controls

- Push-to-talk account settings.
- Voice activation threshold.
- Start muted.
- Server mute/deafen policy in LiveKit token metadata.
- Camera and screen-share policy per channel.
- Low-latency and performance flags.

### Website widget

- Server widget model.
- `/embed/[serverId]` web route.
- API endpoint that returns iframe code target URL.

## Added web UI panels

- Friends panel.
- Game/audio settings panel.
- Server admin panel.
- Compact gaming mode switch.
- Channel badges for push-to-talk.
- Moderation controls for admins/moderators.

## Important production notes

This v2 layer is a source-level implementation layer, not a fully audited production release. Before public launch:

1. Run `pnpm install`.
2. Run `pnpm prisma:generate`.
3. Run `pnpm db:push` or create real migrations.
4. Run `pnpm lint` and fix any environment-specific dependency/type issues.
5. Test LiveKit connectivity from the public VPS IP.
6. Test Google OAuth web origins and native app credentials.
7. Add object storage for uploaded file attachments.
8. Add push notification credentials for Android/iOS.
9. Add PostgreSQL backups.
10. Add rate limits and abuse protection before public registration.
