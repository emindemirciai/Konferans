# Konferans v2 API Map

All paths are under `/api`.

## Auth

- `POST /auth/register`
- `POST /auth/verify-email`
- `POST /auth/login`
- `POST /auth/google`
- `GET /auth/me`
- `PUT /presence`

## Servers

- `GET /servers`
- `POST /servers`
- `GET /servers/:serverId`
- `PATCH /servers/:serverId`
- `POST /servers/:serverId/channels`
- `POST /servers/:serverId/invites`
- `GET /servers/:serverId/members`
- `PATCH /servers/:serverId/members/:memberId/role`
- `POST /servers/:serverId/members/:memberId/moderation`
- `GET /servers/:serverId/audit-logs`

## Channels

- `PATCH /channels/:channelId`
- `PUT /channels/:channelId/permissions`
- `GET /channels/:channelId/messages`

## Messages

- `POST /messages`
- Socket: `message:create`, `message:new`, `typing:start`, `typing:stop`

## Voice/video/screenshare

- `POST /livekit/token`
- Socket: `voice:state`

## Friends and direct messages

- `GET /friends`
- `POST /friends/request`
- `PATCH /friends/requests/:requestId`
- `GET /direct/:userId/messages`
- `POST /direct/:userId/messages`
- Socket: `direct:create`, `direct:new`

## Website widget

- `GET /servers/:serverId/widget`
- `PUT /servers/:serverId/widget`
- Web route: `/embed/:serverId`
