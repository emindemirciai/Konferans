# Konferans v3 Feature Layer

v3 turns Konferans from a working communication app into an integration-ready product.

## Added capabilities

- Notification database model.
- Notification preferences per user.
- Push subscription storage for web, Expo, FCM and APNS.
- Message edit/delete endpoints.
- Message reaction endpoints.
- File attachment metadata model.
- Public embed preview endpoint.
- Integration app credentials for website connection.
- Webhooks for future outbound site events.
- Website SSO one-time token creation/consumption.
- Web UI panels for notification preferences and integration app generation.
- `/embed/[serverId]` public widget route.
- `/overlay` lightweight gaming overlay foundation.

## Notes

The repo stores push subscription records and integration credentials. Actual provider-specific push delivery workers are intentionally separated from the request path so voice/chat latency stays low. A worker can later read active subscriptions and send through Web Push, Expo, FCM or APNS.

## Website integration flow

1. Admin opens server integration panel.
2. Admin creates an integration app.
3. The API returns `clientId` and a one-time `clientSecret`.
4. Existing website stores these values securely server-side.
5. Website can request/bridge SSO sessions and show the Konferans widget.

## SSO flow

1. Konferans authenticated user calls `/api/sso/sessions`.
2. API returns a short-lived one-time `sso_...` token.
3. Website or embed frame consumes it through `/api/sso/consume/:token`.
4. API returns a normal Konferans JWT for the same user.

## Embed flow

- Web route: `/embed/[serverId]`
- Public API route: `/api/embed/:serverId/public`
- Widget must be enabled in `ServerWidget`.
- Guest preview can be allowed or SSO can be required.
