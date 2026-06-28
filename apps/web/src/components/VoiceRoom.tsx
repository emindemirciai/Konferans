'use client';

import { useEffect, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useLocalParticipant,
  useRoomContext,
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

type Settings = {
  pushToTalkEnabled?: boolean;
  pushToTalkKey?: string;
  startMuted?: boolean;
  cameraEnabledByDefault?: boolean;
  performanceMode?: boolean;
  lowPowerMode?: boolean;
  screenShareQuality?: 'LOW' | 'BALANCED' | 'HIGH';
};

export function VoiceRoom({
  token,
  channel,
}: {
  token: string;
  channel: {
    id: string;
    name: string;
    allowVideo?: boolean;
    allowScreenShare?: boolean;
    requirePushToTalk?: boolean;
    lowLatencyMode?: boolean;
  };
}) {
  const [voice, setVoice] = useState<VoiceToken | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  async function join() {
    try {
      setError('');

      const [voiceData, settingsData] = await Promise.all([
        api<VoiceToken>('/livekit/token', {
          token,
          method: 'POST',
          body: JSON.stringify({ channelId: channel.id }),
        }),
        api<{ settings: Settings }>('/settings', { token }),
      ]);

      setVoice(voiceData);
      setSettings(settingsData.settings ?? {});
      setConnected(true);
    } catch (err: any) {
      setError(err?.message || 'Ses kanalına bağlanılamadı');
    }
  }

  useEffect(() => {
    setVoice(null);
    setConnected(false);
    setError('');
  }, [channel.id]);

  if (!connected || !voice) {
    return (
      <div className="voice" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="join-card">
          <h2>{channel.name}</h2>
          <p>
            Bu kanal ses, kamera ve ekran paylaşımını aynı odada açar.
            Oyun modu için sade ve hafif bağlantı kullanılır.
          </p>

          <div className="policy-grid">
            <span>{channel.allowVideo === false ? 'Kamera kapalı' : 'Kamera açık'}</span>
            <span>{channel.allowScreenShare === false ? 'Ekran paylaşımı kapalı' : 'Ekran paylaşımı açık'}</span>
            <span>{channel.requirePushToTalk ? 'PTT zorunlu' : 'Ses algılama / PTT'}</span>
            <span>{channel.lowLatencyMode === false ? 'Standart gecikme' : 'Düşük gecikme'}</span>
          </div>

          {error && <p className="error">{error}</p>}

          <button className="primary" onClick={join}>
            Ses kanalına katıl
          </button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={voice.token}
      serverUrl={voice.wsUrl}
      connect
      audio={!voice.policy.serverMuted && !settings.startMuted}
      video={false}
      options={{
        adaptiveStream: true,
        dynacast: true,
      }}
      onDisconnected={() => {
        setConnected(false);
        setVoice(null);
      }}
      data-lk-theme="default"
      className={voice ${settings.performanceMode ? 'voice-performance' : ''}}
    >
      <RoomAudioRenderer />
      <StartAudio label="Sesi başlat" />

      <div className="voice-stage" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="join-card" style={{ maxWidth: 760 }}>
          <h2>🔊 {channel.name}</h2>
          <p>
            Kanala bağlısın. Bu hafif modda sadece gerekli ses, kamera ve ekran paylaşımı
            kontrolleri çalışır. Gereksiz konferans arayüzü kapatıldı.
          </p>

          <LightweightVoiceControls
            channelId={channel.id}
            settings={settings}
            policy={voice.policy}
            onLeave={() => {
              setConnected(false);
              setVoice(null);
            }}
          />
        </div>
      </div>
    </LiveKitRoom>
  );
}

function LightweightVoiceControls({
  channelId,
  settings,
  policy,
  onLeave,
}: {
  channelId: string;
  settings: Settings;
  policy: VoicePolicy;
  onLeave: () => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);
  const [pttActive, setPttActive] = useState(false);
  const [message, setMessage] = useState('');

  const pttKey = settings.pushToTalkKey || 'Space';
  const pttEnabled = Boolean(settings.pushToTalkEnabled || policy.requirePushToTalk);

  async function toggleMic() {
    if (!localParticipant || policy.serverMuted) return;

    const next = !micEnabled;
    await localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);

    window.dispatchEvent(
      new CustomEvent('letsmeet:voice-state', {
        detail: { channelId, muted: !next },
      }),
    );
  }

  async function toggleCamera() {
    if (!localParticipant || !policy.allowVideo) return;

    const next = !cameraEnabled;
    await localParticipant.setCameraEnabled(next);
    setCameraEnabled(next);
  }

  async function toggleScreenShare() {
    if (!localParticipant || !policy.allowScreenShare) return;

    try {
      const next = !screenEnabled;
      await localParticipant.setScreenShareEnabled(next);
      setScreenEnabled(next);
      setMessage(next ? 'Ekran paylaşımı açık' : 'Ekran paylaşımı kapalı');
    } catch {
      setMessage('Ekran paylaşımı başlatılamadı');
    }
  }

  async function leaveRoom() {
    try {
      await localParticipant?.setMicrophoneEnabled(false);
      await localParticipant?.setCameraEnabled(false);
      await localParticipant?.setScreenShareEnabled(false);
      room.disconnect();
    } finally {
      onLeave();
    }
  }

  useEffect(() => {
    if (!localParticipant) return;

    localParticipant.setMicrophoneEnabled(false).catch(() => null);
    localParticipant.setCameraEnabled(false).catch(() => null);
    localParticipant.setScreenShareEnabled(false).catch(() => null);

    setMicEnabled(false);
    setCameraEnabled(false);
    setScreenEnabled(false);
  }, [localParticipant]);

  useEffect(() => {
    if (!localParticipant) return;
    if (!pttEnabled) return;

    localParticipant.setMicrophoneEnabled(false).catch(() => null);
    setMicEnabled(false);

    const down = (event: KeyboardEvent) => {
      const keyMatches = event.code === pttKey || event.key === pttKey;

      if (!keyMatches || event.repeat || policy.serverMuted) return;

      event.preventDefault();
      setPttActive(true);
      setMicEnabled(true);
      localParticipant.setMicrophoneEnabled(true).catch(() => null);

      window.dispatchEvent(
        new CustomEvent('letsmeet:voice-state', {
          detail: { channelId, muted: false },
        }),
      );
    };

    const up = (event: KeyboardEvent) => {
      const keyMatches = event.code === pttKey || event.key === pttKey;

      if (!keyMatches) return;

      event.preventDefault();
      setPttActive(false);
      setMicEnabled(false);
      localParticipant.setMicrophoneEnabled(false).catch(() => null);

      window.dispatchEvent(
        new CustomEvent('letsmeet:voice-state', {
          detail: { channelId, muted: true },
        }),
      );
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [channelId, localParticipant, policy.serverMuted, pttEnabled, pttKey]);

  return (
    <div className="voice-controls game-controls" style={{ flexWrap: 'wrap' }}>
      <span className="pill">{policy.lowLatencyMode ? 'Düşük gecikme' : 'Standart'}</span>

      {policy.serverMuted && <span className="pill danger">Sunucuda susturuldun</span>}

      {pttEnabled && (
        <span className={pill ${pttActive ? 'success-bg' : ''}}>
          PTT: {pttKey} {pttActive ? 'aktif' : 'bekliyor'}
        </span>
      )}

      <button className={micEnabled ? 'primary' : 'secondary'} onClick={toggleMic}>
        {micEnabled ? 'Mikrofon açık' : 'Mikrofon kapalı'}
      </button>

      <button
        className={cameraEnabled ? 'primary' : 'secondary'}
        onClick={toggleCamera}
        disabled={!policy.allowVideo}
      >
        {cameraEnabled ? 'Kamera açık' : 'Kamera kapalı'}
      </button>

      <button
        className={screenEnabled ? 'primary' : 'secondary'}
        onClick={toggleScreenShare}
        disabled={!policy.allowScreenShare}
      >
        {screenEnabled ? 'Yayın açık' : 'Ekran paylaş'}
      </button>

      <button className="secondary" onClick={leaveRoom}>
        Kanaldan çık
      </button>

      {message && <span className="pill">{message}</span>}
    </div>
  );
}
