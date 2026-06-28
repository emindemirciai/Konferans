# Konferans Architecture

## Goal

Konferans is designed as a gaming-first communication platform:

- Discord-like persistent servers/channels.
- Jitsi-like instant meeting controls.
- Self-hosted SFU media via LiveKit.
- Web + native Android/iOS.
- Later website integration without rewriting core auth or media logic.

## Services

### Web

Next.js app. Handles login, registration, server/channel UI, text chat and voice rooms.

### Mobile

Expo development-build app. Uses LiveKit React Native SDK and shares the same API.

### API

Express API for:

- Auth
- Invites
- Server membership
- Channels
- Persistent messages
- User settings
- LiveKit JWT room token generation

### LiveKit

Self-hosted WebRTC SFU. The API never sends `LIVEKIT_API_SECRET` to clients; it only returns short-lived join tokens.

### PostgreSQL

Stores users, invites, servers, members, channels, messages, verification codes and settings.

### Redis

Included for future scalable Socket.IO adapter, presence caching and rate limiting.

## Invite model

The platform defaults to invite-only. Two opening modes are supported:

- `INVITE_ONLY=true`, `ALLOW_PUBLIC_REGISTRATION=false`: registration requires invite.
- `ALLOW_PUBLIC_REGISTRATION=true`: public registration becomes possible without changing code.

## Media model

Each voice channel maps to a LiveKit room name:

```text
server_{serverId}_voice_{channelId}
```

This keeps rooms predictable while preserving access control in the API.

## Performance model

- Audio connects first; video disabled by default.
- Cameras and screen share are user-triggered.
- Client settings include low-power mode and audio processing flags.
- SFU avoids peer-to-peer mesh overload.
- Native app uses LiveKit native WebRTC instead of WebView media.

## Security notes

- Passwords are bcrypt-hashed.
- JWT uses `JWT_SECRET` and should be changed before production.
- Google sign-in ID token is verified server-side.
- Email/password users require verification.
- LiveKit API secret stays server-side.
- Invite counters are consumed server-side.

## Roadmap already accounted for in schema

- Public registration switch.
- Server roles.
- Voice bitrate/user limit.
- User media settings.
- Website integration via invite URLs and JWT-based API.

## v2 additions

### Roles and channel permissions

The database now contains channel-level permission overrides. The role hierarchy is:

```text
OWNER > ADMIN > MODERATOR > MEMBER > GUEST
```

Permissions are intentionally stored per channel + role to make Discord-like behavior possible without requiring a full custom role builder in the first admin screen.

### Friends and private messages

Friend requests are stored in `FriendRequest`. Accepted requests unlock direct messages in `DirectMessage`. Socket.IO includes direct message events so native apps and web can share the same realtime model.

### Moderation model

Moderation actions are stored separately from server membership state. This allows an admin to see why a member was muted, kicked or banned instead of only seeing the final state.

### Gaming mode

Gaming mode is split into account settings and channel policy:

- Account settings: push-to-talk, low-power mode, start muted, active-speaker-only, audio processing.
- Channel policy: allow video, allow screenshare, require push-to-talk, low-latency mode.
- Server moderation policy: server mute/deafen is embedded into the LiveKit token metadata.

### Embedded website widget

`ServerWidget` stores embed configuration. The web app includes `/embed/[serverId]` as a starting point for a compact launcher route.
