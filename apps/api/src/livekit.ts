import { AccessToken } from 'livekit-server-sdk';
import { env } from './env.js';

export function createLiveKitToken(input: {
  roomName: string;
  identity: string;
  name: string;
  metadata?: Record<string, unknown>;
}) {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: input.identity,
    name: input.name,
    metadata: JSON.stringify(input.metadata ?? {}),
    ttl: '12h',
  });

  at.addGrant({
    room: input.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return at.toJwt();
}

export function roomNameForVoiceChannel(serverId: string, channelId: string) {
  return `server_${serverId}_voice_${channelId}`;
}
