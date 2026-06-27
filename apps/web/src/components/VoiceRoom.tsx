'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer, StartAudio, VideoConference, useLocalParticipant, useRemoteParticipants } from '@livekit/components-react';
import { Maximize, MonitorPlay, Minimize, PhoneOff } from 'lucide-react';
import { api } from '@/lib/api';

type VoicePolicy = {
  serverMuted: boolean;
  serverDeafened: boolean;
  allowVideo: boolean;
  allowScreenShare: boolean;
  requirePushToTalk: boolean;
  lowLatencyMode: boolean;
};

type VoiceToken = { token: string; roomName: string; wsUrl: string; policy: VoicePolicy };
type Settings = { pushToTalkEnabled?: boolean; pushToTalkKey?: string; startMuted?: boolean; cameraEnabledByDefault?: boolean; performanceMode?: boolean; lowPowerMode?: boolean; screenShareQuality?: 'LOW' | 'BALANCED' | 'HIGH' };

export function VoiceRoom({ token, channel }: { token: string; channel: { id: string; name: string; allowVideo?: boolean; allowScreenShare?: boolean; requirePushToTalk?: boolean; lowLatencyMode?: boolean } }) {
  const [voice, setVoice] = useState<VoiceToken | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [isCinematic, setIsCinematic] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const joinedRef = useRef(false);
  const leavingRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectRunRef = useRef(0);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connectVoice = useCallback(async () => {
    const runId = ++connectRunRef.current;
    try {
      setError('');
      const [voiceData, settingsData] = await Promise.all([
        api<VoiceToken>('/livekit/token', { token, method: 'POST', body: JSON.stringify({ channelId: channel.id }) }),
        api<{ settings: Settings }>('/settings', { token }),
      ]);
      if (connectRunRef.current !== runId || leavingRef.current) return false;
      setVoice(voiceData);
      setSettings(settingsData.settings);
      setConnected(true);
      reconnectAttemptsRef.current = 0;
      if (!joinedRef.current) {
        window.dispatchEvent(new CustomEvent('letsmeet:voice-join', { detail: { channelId: channel.id } }));
        joinedRef.current = true;
      }
      return true;
    } catch (err: any) {
      if (connectRunRef.current !== runId || leavingRef.current) return false;
      setConnected(false);
      setError(err.message || 'Ses kanalına bağlanılamadı.');
      return false;
    }
  }, [channel.id, token]);

  const leaveChannel = useCallback(() => {
    leavingRef.current = true;
    clearReconnectTimer();
    connectRunRef.current += 1;
    setConnected(false);
    setVoice(null);
    if (joinedRef.current) {
      window.dispatchEvent(new CustomEvent('letsmeet:voice-leave', { detail: { channelId: channel.id } }));
      joinedRef.current = false;
    }
    window.dispatchEvent(new CustomEvent('letsmeet:leave-channel'));
  }, [channel.id, clearReconnectTimer]);

  const scheduleReconnect = useCallback(() => {
    if (leavingRef.current) return;
    clearReconnectTimer();
    setConnected(false);
    setVoice(null);
    reconnectAttemptsRef.current += 1;
    const delay = Math.min(1000 * reconnectAttemptsRef.current, 5000);
    setError('Bağlantı koptu, tekrar bağlanılıyor...');
    reconnectTimerRef.current = setTimeout(() => {
      void connectVoice();
    }, delay);
  }, [clearReconnectTimer, connectVoice]);

  useEffect(() => {
    leavingRef.current = false;
    joinedRef.current = false;
    reconnectAttemptsRef.current = 0;
    clearReconnectTimer();
    setVoice(null);
    setConnected(false);
    setError('');
    setIsCinematic(false);
    window.dispatchEvent(new CustomEvent('letsmeet:cinematic-mode', { detail: { active: false } }));

    void connectVoice();
    
    return () => {
      leavingRef.current = true;
      clearReconnectTimer();
      connectRunRef.current += 1;
      if (joinedRef.current) {
        window.dispatchEvent(new CustomEvent('letsmeet:voice-leave', { detail: { channelId: channel.id } }));
        joinedRef.current = false;
      }
    };
  }, [channel.id, clearReconnectTimer, connectVoice]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => null);
    } else {
      document.exitFullscreen().catch(() => null);
    }
  };

  const toggleCinematic = () => {
    const nextState = !isCinematic;
    setIsCinematic(nextState);
    window.dispatchEvent(new CustomEvent('letsmeet:cinematic-mode', { detail: { active: nextState } }));
  };


  if (!connected || !voice) {
    return (
      <div className="voice" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="join-card">
          <h2>{channel.name}</h2>
          <p>Bağlanıyor...</p>
          {error && <p className="error">{error}</p>}
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
      video={Boolean(settings.cameraEnabledByDefault && voice.policy.allowVideo)}
      options={{ adaptiveStream: true, dynacast: true }}
      data-lk-theme="default"
      onDisconnected={scheduleReconnect}
      className={`voice ${settings.performanceMode ? 'voice-performance' : ''} ${isCinematic ? 'voice-cinematic' : ''}`}
    >
      <RoomAudioRenderer />
      <StartAudio label="Sesi başlat" />
      
      {channel.name.toLowerCase() === 'afk' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', gap: '16px', flex: 1 }}>
          <MonitorPlay size={48} opacity={0.2} />
          <h2>AFK Kanalı</h2>
          <button className="icon-button" title="Kanaldan ayrıl" aria-label="Kanaldan ayrıl" onClick={leaveChannel}>
            <PhoneOff size={18} />
          </button>
        </div>
      ) : (
        <>
          <div className="voice-stage-controls">
            <button className="icon-button" title="Kanaldan ayrıl" aria-label="Kanaldan ayrıl" onClick={leaveChannel}>
              <PhoneOff size={18} />
            </button>
            <button className="icon-button" title="Sinematik Mod (Tüm menüleri gizle)" onClick={toggleCinematic}>
              {isCinematic ? <Minimize size={18} /> : <MonitorPlay size={18} />}
            </button>
            <button className="icon-button" title="Tam Ekran" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
          <div className="voice-stage">
            <VideoConference />
          </div>
          <GameVoiceControls channelId={channel.id} settings={settings} policy={voice.policy} />
        </>
      )}
    </LiveKitRoom>
  );
}

function GameVoiceControls({ channelId, settings, policy }: { channelId: string; settings: Settings; policy: VoicePolicy }) {
  const { localParticipant } = useLocalParticipant();
  const [pttActive, setPttActive] = useState(false);
  const pttKey = settings.pushToTalkKey || 'Space';
  const pttEnabled = Boolean(settings.pushToTalkEnabled || policy.requirePushToTalk);

  useEffect(() => {
    if (!localParticipant) return;
    if (!pttEnabled) return;
    localParticipant.setMicrophoneEnabled(false).catch(() => null);
    const down = (event: KeyboardEvent) => {
      const keyMatches = event.code === pttKey || event.key === pttKey;
      if (!keyMatches || event.repeat || policy.serverMuted) return;
      setPttActive(true);
      localParticipant.setMicrophoneEnabled(true).catch(() => null);
      window.dispatchEvent(new CustomEvent('letsmeet:voice-state', { detail: { channelId, muted: false } }));
    };
    const up = (event: KeyboardEvent) => {
      const keyMatches = event.code === pttKey || event.key === pttKey;
      if (!keyMatches) return;
      setPttActive(false);
      localParticipant.setMicrophoneEnabled(false).catch(() => null);
      window.dispatchEvent(new CustomEvent('letsmeet:voice-state', { detail: { channelId, muted: true } }));
    };
    const handleForceMute = () => {
      localParticipant.setMicrophoneEnabled(false).catch(() => null);
      window.dispatchEvent(new CustomEvent('letsmeet:voice-state', { detail: { channelId, muted: true } }));
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('letsmeet:force-mute', handleForceMute);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('letsmeet:force-mute', handleForceMute);
    };
  }, [channelId, localParticipant, policy.serverMuted, pttEnabled, pttKey]);

  return (
    <div className="voice-controls game-controls">
      {pttEnabled && <span className={`pill ${pttActive ? 'success-bg' : ''}`}>PTT: {pttKey} {pttActive ? 'aktif' : 'bekliyor'}</span>}
      <LocalMuteManager />
    </div>
  );
}

function LocalMuteManager() {
  const remoteParticipants = useRemoteParticipants();
  
  useEffect(() => {
    const applyMutes = () => {
      const mutedList = JSON.parse(localStorage.getItem('letsmeet:local-muted') || '[]');
      remoteParticipants.forEach(p => {
        const isMuted = mutedList.includes(p.identity);
        p.audioTrackPublications.forEach(pub => {
          if (pub.audioTrack && 'setVolume' in pub.audioTrack) {
            (pub.audioTrack as any).setVolume(isMuted ? 0 : 1);
          }
        });
      });
    };

    applyMutes();
    window.addEventListener('letsmeet:local-mute-change', applyMutes);
    return () => window.removeEventListener('letsmeet:local-mute-change', applyMutes);
  }, [remoteParticipants]);

  return null;
}
