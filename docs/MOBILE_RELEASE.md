# Native Mobile Release Notes

The mobile app is an Expo React Native development-build app. LiveKit native WebRTC needs a development build, not plain Expo Go.

## Development

```bash
cd apps/mobile
pnpm install
pnpm android
pnpm ios
```

## Configuration

Set API URL in `apps/mobile/app.json` or through Expo/EAS config:

```json
{
  "expo": {
    "extra": {
      "apiUrl": "https://api-meet.example.com"
    }
  }
}
```

## Production target

- Android: EAS build or local Gradle build.
- iOS: EAS build or Xcode build on macOS.
- Push notifications: store Expo/FCM/APNS token through `/api/push-subscriptions`.

## Gaming performance

Recommended defaults:

- Low power enabled.
- Mobile data saver enabled.
- Start muted enabled for public channels.
- Camera off by default.
- Screen share only on devices/browsers that support it reliably.
