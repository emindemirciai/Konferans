# Dokploy Deployment

## First VPS/IP run

1. Create a new Docker Compose project in Dokploy.
2. Use this repo root as the compose project.
3. Copy `.env.example` values into Dokploy environment variables.
4. Change all secrets.
5. Deploy.
6. Open:
   - `http://VPS_IP:3000` for web
   - `http://VPS_IP:4000/api/health` for API
   - `ws://VPS_IP:7880` for LiveKit

## Firewall

Open these ports for the temporary IP test:

```text
3000/tcp web
4000/tcp api
7880/tcp livekit websocket
7881/tcp livekit rtc tcp fallback
50000-50100/udp livekit media
```

For domain/SSL deployment, web/API can sit behind Dokploy/Traefik. LiveKit still needs its media ports open.

## Domain deployment later

Recommended subdomains:

```text
meet.example.com      -> web:3000
api-meet.example.com  -> api:4000
livekit.example.com   -> livekit:7880
```

Then update env:

```env
PUBLIC_WEB_URL=https://meet.example.com
PUBLIC_API_URL=https://api-meet.example.com
CORS_ORIGIN=https://meet.example.com
LIVEKIT_PUBLIC_WS_URL=wss://livekit.example.com
LIVEKIT_DOMAIN=livekit.example.com
```

## Google OAuth

Add these origins in Google Cloud Console:

- `http://localhost:3000`
- `http://VPS_IP:3000` for temporary testing if needed
- `https://meet.example.com` for production

## SMTP

Email/password registration needs SMTP. Without SMTP, the API logs the verification code for development only.
