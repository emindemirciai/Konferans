'use client';

import { useEffect, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  VideoConference,
} from '@livekit/components-react';
import { api } from '@/lib/api';

type VoicePolicy = {
  serverMuted: boolean;
  serverDeafened: boolean;
  allowVideo: boolean;
  allowScreenShare: boolean;
  requirePushToTalk: boolean;
  lowLatencyMode: boolean;
};

type VoiceToken = {
  token: string;
  roomName: string;
  wsUrl: string;
  policy: VoicePolicy;
};

type Channel = {
  id: string;
  name: string;
  allowVideo?: boolean;
  allowScreenShare?: boolean;
  requirePushToTalk?: boolean;
  lowLatencyMode?: boolean;
};

export function VoiceRoom({
  token,
  channel,
}: {
  token: string;
  channel: Channel;
}) {
  const [voice, setVoice] = useState<VoiceToken | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  async function joinVoiceChannel() {
    try {
      setJoining(true);
      setError('');

      const voiceData = await api<VoiceToken>('/livekit/token', {
        token,
        method: 'POST',
        body: JSON.stringify({
          channelId: channel.id,
        }),
      });

      setVoice(voiceData);
      setConnected(true);

      window.dispatchEvent(
        new CustomEvent('konferans:voice-join', {
          detail: {
            channelId: channel.id,
          },
        }),
      );
    } catch (err: any) {
      setError(err?.message || 'Ses kanalına bağlanılamadı.');
      setConnected(false);
      setVoice(null);
    } finally {
      setJoining(false);
    }
  }

  function leaveVoiceChannel() {
    window.dispatchEvent(
      new CustomEvent('konferans:voice-leave', {
        detail: {
          channelId: channel.id,
        },
      }),
    );

    setConnected(false);
    setVoice(null);
    setError('');
  }

  useEffect(() => {
    setConnected(false);
    setVoice(null);
    setError('');
  }, [channel.id]);

  if (!connected || !voice) {
    return (
      <div className="voice">
        <div className="join-card">
          <h2>{channel.name}</h2>

          <p>
            Bu ses kanalında mikrofon, kamera ve ekran paylaşımı kullanılabilir.
          </p>

          <div className="policy-grid">
            <span>
              {channel.allowVideo === false ? 'Kamera kapalı' : 'Kamera açık'}
            </span>
            <span>
              {channel.allowScreenShare === false
                ? 'Ekran paylaşımı kapalı'
                : 'Ekran paylaşımı açık'}
            </span>
            <span>
              {channel.requirePushToTalk ? 'Push-to-talk zorunlu' : 'Normal ses modu'}
            </span>
            <span>
              {channel.lowLatencyMode === false ? 'Standart gecikme' : 'Düşük gecikme'}
            </span>
          </div>

          {error && <p className="error">{error}</p>}

          <button
            className="primary"
            onClick={joinVoiceChannel}
            disabled={joining}
          >
            {joining ? 'Bağlanıyor...' : 'Ses kanalına katıl'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="voice">
      <LiveKitRoom
        token={voice.token}
        serverUrl={voice.wsUrl}
        connect={true}
        audio={!voice.policy.serverMuted}
        video={false}
        options={{
          adaptiveStream: true,
          dynacast: true,
        }}
        onDisconnected={leaveVoiceChannel}
        data-lk-theme="default"
      >
        <RoomAudioRenderer />
        <StartAudio label="Sesi başlat" />

        <div className="voice-stage">
          <div className="voice-header">
            <div>
              <h2>{channel.name}</h2>
              <p>Ses, kamera ve ekran paylaşımı aktif.</p>
            </div>

            <button className="secondary" onClick={leaveVoiceChannel}>
              Kanaldan çık
            </button>
          </div>

          <VideoConference />
        </div>
      </LiveKitRoom>
    </div>
  );
}
