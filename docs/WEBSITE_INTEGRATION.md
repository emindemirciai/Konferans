# Website Integration Plan

Lets Meet is prepared for website integration in four levels.

## Level 1: Link integration

Add a button on your existing website:

```html
<a href="https://meet.example.com">Lets Meet'e gir</a>
```

## Level 2: Invite integration

Create invite links from the app/API and publish them on your site:

```text
https://meet.example.com/invite/LM-xxxxxxxxxx
```

## Level 3: Embedded launcher widget

The v2 repo includes an embedded route:

```text
https://meet.example.com/embed/SERVER_ID
```

The iframe code is produced by the widget API:

```http
GET /api/servers/:serverId/widget
PUT /api/servers/:serverId/widget
```

Example iframe:

```html
<iframe src="https://meet.example.com/embed/SERVER_ID" width="420" height="720" allow="microphone; camera; display-capture"></iframe>
```

## Level 4: SSO integration later

For deep integration with an existing website, keep Lets Meet as a separate auth/media service and let your website issue a short-lived signed token to the Lets Meet API. The current repo already separates:

- public web client
- API
- LiveKit token generation
- invite-based access
- widget route

This means SSO can be added without rewriting the media architecture.
