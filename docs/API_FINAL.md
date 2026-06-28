# Konferans Final API Map

Base path: `/api`

## Public

```text
GET  /health
GET  /config
GET  /embed/:serverId/public
POST /auth/register
POST /auth/verify-email
POST /auth/login
POST /auth/google
POST /sso/consume/:token
```

## Authenticated user

```text
GET  /auth/me
PUT  /presence
GET  /servers
POST /servers
GET  /servers/:serverId
POST /invites/join
GET  /settings
PUT  /settings
GET  /friends
POST /friends/request
PATCH /friends/requests/:requestId
GET  /direct/:userId/messages
POST /direct/:userId/messages
GET  /notifications
POST /notifications/read-all
PATCH /notifications/:notificationId/read
GET  /notification-preferences
PUT  /notification-preferences
POST /push-subscriptions
DELETE /push-subscriptions/:subscriptionId
POST /files
POST /sso/sessions
```

## Channel / message

```text
GET    /channels/:channelId/messages
POST   /messages
PATCH  /messages/:messageId
DELETE /messages/:messageId
PUT    /messages/:messageId/reactions
DELETE /messages/:messageId/reactions
POST   /livekit/token
```

## Server admin/moderator

```text
POST /channels
PATCH /channels/:channelId
PUT  /channels/:channelId/permissions
POST /servers/:serverId/invites
PATCH /servers/:serverId/members/:memberId/role
POST /servers/:serverId/members/:memberId/moderation
GET  /servers/:serverId/audit-logs
GET  /servers/:serverId/widget
PUT  /servers/:serverId/widget
POST /servers/:serverId/integrations
GET  /servers/:serverId/integrations
POST /servers/:serverId/webhooks
```

## Global admin

```text
GET /system/status
GET /system/backups
```
