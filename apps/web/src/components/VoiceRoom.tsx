'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ControlBar, GridLayout, isTrackReference, LiveKitRoom, ParticipantTile, RoomAudioRenderer, StartAudio, useLocalParticipant, useRemoteParticipants, useTracks, type TrackReference } from '@livekit/components-react';
import { Track } from 'livekit-client';
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

function requestVoiceLayoutFullscreen() {
  const target = document.querySelector('.voice-layout') as HTMLElement | null;
  if (!target?.requestFullscreen || document.fullscreenElement) return;
  target.requestFullscreen().catch(() => null);
}

export function VoiceRoom({ token, channel }: { token: string; channel: { id: string; name: string; allowVideo?: boolean; allowScreenShare?: boolean; requirePushToTalk?: boolean; lowLatencyMode?: boolean } }) {
  const [voice, setVoice] = useState<VoiceToken | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [isCinematic, setIsCinematic] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLocalScreenSharing, setIsLocalScreenSharing] = useState(false);
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
        window.dispatchEvent(new CustomEvent('konferans:voice-join', { detail: { channelId: channel.id } }));
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
      window.dispatchEvent(new CustomEvent('konferans:voice-leave', { detail: { channelId: channel.id } }));
      joinedRef.current = false;
    }
    window.dispatchEvent(new CustomEvent('konferans:leave-channel'));
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
    setIsFullscreen(false);
    setIsLocalScreenSharing(false);
    window.dispatchEvent(new CustomEvent('konferans:cinematic-mode', { detail: { active: false } }));
    window.dispatchEvent(new CustomEvent('konferans:fullscreen-mode', { detail: { active: false } }));

    void connectVoice();
    
    return () => {
      leavingRef.current = true;
      clearReconnectTimer();
      connectRunRef.current += 1;
      if (joinedRef.current) {
        window.dispatchEvent(new CustomEvent('konferans:voice-leave', { detail: { channelId: channel.id } }));
        joinedRef.current = false;
      }
      setIsLocalScreenSharing(false);
      window.dispatchEvent(new CustomEvent('konferans:fullscreen-mode', { detail: { active: false } }));
    };
  }, [channel.id, clearReconnectTimer, connectVoice]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      window.dispatchEvent(new CustomEvent('konferans:fullscreen-mode', { detail: { active } }));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.dispatchEvent(new CustomEvent('konferans:fullscreen-mode', { detail: { active: false } }));
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => null);
      return;
    }
    requestVoiceLayoutFullscreen();
  };

  useEffect(() => {
    if (!isFullscreen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsFullscreen(false);
      window.dispatchEvent(new CustomEvent('konferans:fullscreen-mode', { detail: { active: false } }));
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFullscreen]);

  const toggleCinematic = () => {
    const nextState = !isCinematic;
    setIsCinematic(nextState);
    window.dispatchEvent(new CustomEvent('konferans:cinematic-mode', { detail: { active: nextState } }));
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
      className={`voice ${settings.performanceMode ? 'voice-performance' : ''} ${isCinematic ? 'voice-cinematic' : ''} ${isLocalScreenSharing ? 'voice-screen-sharing' : ''}`}
    >
      <RoomAudioRenderer />
      <StartAudio label="Sesi başlat" />
      <VoiceStateReporter channelId={channel.id} policy={voice.policy} onScreenShareChange={setIsLocalScreenSharing} />
      
      {channel.name.toLowerCase() === 'afk' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', gap: '16px', flex: 1 }}>
          <MonitorPlay size={48} opacity={0.2} />
          <h2>AFK Kanalı</h2>
          <button className="voice-action-button danger" title="Kanaldan ayrıl" aria-label="Kanaldan ayrıl" onClick={leaveChannel}>
            <PhoneOff size={18} />
            <span>Kanaldan ayrıl</span>
          </button>
        </div>
      ) : (
        <>
          <div className="voice-stage-controls">
            <div className="voice-stage-left">
              <LocalScreenShareBadge visible={isLocalScreenSharing} />
            </div>
            <div className="voice-stage-right">
              <ScreenSelectionControl visible={isLocalScreenSharing} isSharing={isLocalScreenSharing} surface="stage" />
              <button className="voice-action-button" title="Sinematik mod" onClick={toggleCinematic}>
                {isCinematic ? <Minimize size={18} /> : <MonitorPlay size={18} />}
                <span>{isCinematic ? 'Sinematikten çık' : 'Sinematik mod'}</span>
              </button>
              <button className="voice-action-button" title="Tam ekran" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                <span>{isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}</span>
              </button>
            </div>
          </div>
          <div className="voice-stage">
            <VoiceConference onLeaveChannel={leaveChannel} />
          </div>
          <GameVoiceControls channelId={channel.id} settings={settings} policy={voice.policy} />
        </>
      )}
    </LiveKitRoom>
  );
}

function VoiceConference({ onLeaveChannel }: { onLeaveChannel: () => void }) {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ], { onlySubscribed: false });

  const screenShares = tracks.filter((trackRef): trackRef is TrackReference => isTrackReference(trackRef) && trackRef.source === Track.Source.ScreenShare);
  const remoteScreenShare = screenShares.find((trackRef) => !trackRef.participant.isLocal);
  const localScreenShare = screenShares.find((trackRef) => trackRef.participant.isLocal);
  const focusedTrack = remoteScreenShare ?? (localScreenShare ? undefined : screenShares[0]);
  const cameraTracks = tracks.filter((trackRef) => trackRef.source === Track.Source.Camera && !(localScreenShare && trackRef.participant.isLocal));

  return (
    <div className="custom-video-conference">
      <div className="custom-stage">
        {localScreenShare && !remoteScreenShare ? (
          <LocalScreenShareStage trackRef={localScreenShare} />
        ) : focusedTrack ? (
          <div className="custom-focus-stage">
            <ParticipantTile trackRef={focusedTrack} />
          </div>
        ) : cameraTracks.length > 0 ? (
          <GridLayout tracks={cameraTracks}>
            <ParticipantTile />
          </GridLayout>
        ) : (
          <div className="local-screen-share-stage">
            <MonitorPlay size={34} />
            <strong>Ses kanalındasın</strong>
            <span>Kamera veya ekran paylaşımı açıldığında burada görünür.</span>
          </div>
        )}
      </div>
      <div className="custom-control-row">
        <ControlBar controls={{ microphone: true, camera: true, screenShare: false, chat: false, settings: false, leave: false }} />
        <ScreenSelectionControl visible={!localScreenShare} isSharing={false} surface="control" />
        <StopScreenShareControl visible={Boolean(localScreenShare)} />
        <button className="lk-button manual-screen-share-button voice-control-leave-button" title="Kanaldan ayrıl" onClick={onLeaveChannel}>
          <PhoneOff size={18} />
          <span>Kanaldan ayrıl</span>
        </button>
      </div>
    </div>
  );
}

function LocalScreenShareStage({ trackRef }: { trackRef: TrackReference }) {
  return (
    <div className="local-screen-share-stage local-screen-share-stage-preview">
      <div className="local-screen-preview-shell">
        <LiveLocalScreenSharePreview trackRef={trackRef} />
      </div>
    </div>
  );
}

function LocalScreenShareSnapshot({ trackRef }: { trackRef: TrackReference }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const snapshotUrl = '';
  const mediaStreamTrack = trackRef.publication.track?.mediaStreamTrack;

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!mediaStreamTrack || !video || !canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let stopped = false;
    let frameId = 0;
    let hasFrame = false;

    const drawPreviewFrame = () => {
      if (stopped) return;

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
        const sourceSettings = mediaStreamTrack.getSettings();
        const sourceWidth = video.videoWidth || sourceSettings.width || 1280;
        const sourceHeight = video.videoHeight || sourceSettings.height || 720;
        const viewportScale = window.devicePixelRatio || 1;
        const maxPreviewWidth = Math.min(1920, Math.max(1280, Math.round(window.innerWidth * viewportScale)));
        const maxPreviewHeight = Math.min(1080, Math.max(720, Math.round(window.innerHeight * viewportScale)));
        const scale = Math.min(1, maxPreviewWidth / sourceWidth, maxPreviewHeight / sourceHeight);
        const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
        const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
        }

        context.drawImage(video, 0, 0, targetWidth, targetHeight);
        if (!hasFrame) {
          hasFrame = true;
          setPreviewReady(true);
        }
      }

      frameId = window.requestAnimationFrame(drawPreviewFrame);
    };

    setPreviewReady(false);
    video.srcObject = new MediaStream([mediaStreamTrack]);
    void video.play().catch(() => null);
    frameId = window.requestAnimationFrame(drawPreviewFrame);

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frameId);
      video.pause();
      video.srcObject = null;
    };
  }, [mediaStreamTrack]);

  return (
    <>
      <div className="local-screen-preview-media">
        {snapshotUrl ? (
          <img src={snapshotUrl} alt="Yayın önizlemesi" />
        ) : (
          <div className="local-screen-preview-placeholder">
            <MonitorPlay size={30} />
            <span>Önizleme hazırlanıyor</span>
          </div>
        )}
      </div>
      <span className="local-screen-preview-badge">Canlı</span>
      <video ref={videoRef} className="local-screen-preview-video" muted playsInline />
      <canvas ref={canvasRef} className="local-screen-preview-canvas" />
    </>
  );
}

function LiveLocalScreenSharePreview({ trackRef }: { trackRef: TrackReference }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const mediaStreamTrack = trackRef.publication.track?.mediaStreamTrack;

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!mediaStreamTrack || !video || !canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let stopped = false;
    let frameId = 0;
    let hasFrame = false;

    const drawPreviewFrame = () => {
      if (stopped) return;

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
        const previewBounds = canvas.parentElement?.getBoundingClientRect();
        const cssWidth = Math.max(1, Math.floor(previewBounds?.width || canvas.clientWidth || window.innerWidth));
        const cssHeight = Math.max(1, Math.floor(previewBounds?.height || canvas.clientHeight || window.innerHeight));
        const bitmapScale = Math.max(.5, Math.min(window.devicePixelRatio || 1, 1920 / cssWidth, 1080 / cssHeight));
        const targetWidth = Math.max(1, Math.round(cssWidth * bitmapScale));
        const targetHeight = Math.max(1, Math.round(cssHeight * bitmapScale));
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
        }

        context.fillStyle = '#05070b';
        context.fillRect(0, 0, targetWidth, targetHeight);

        const containScale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
        const drawWidth = Math.round(sourceWidth * containScale);
        const drawHeight = Math.round(sourceHeight * containScale);
        const drawX = Math.round((targetWidth - drawWidth) / 2);
        const drawY = Math.round((targetHeight - drawHeight) / 2);
        context.drawImage(video, 0, 0, sourceWidth, sourceHeight, drawX, drawY, drawWidth, drawHeight);

        if (!hasFrame) {
          hasFrame = true;
          setPreviewReady(true);
        }
      }

      frameId = window.requestAnimationFrame(drawPreviewFrame);
    };

    setPreviewReady(false);
    video.srcObject = new MediaStream([mediaStreamTrack]);
    void video.play().catch(() => null);
    frameId = window.requestAnimationFrame(drawPreviewFrame);

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frameId);
      video.pause();
      video.srcObject = null;
    };
  }, [mediaStreamTrack]);

  return (
    <>
      <div className="local-screen-preview-media">
        <canvas ref={canvasRef} className={`local-screen-preview-canvas ${previewReady ? 'ready' : ''}`} aria-label="Yayın önizlemesi" />
        {!previewReady && (
          <div className="local-screen-preview-placeholder">
            <MonitorPlay size={30} />
            <span>Önizleme hazırlanıyor</span>
          </div>
        )}
      </div>
      <span className="local-screen-preview-badge">Canlı</span>
      <video ref={videoRef} className="local-screen-preview-video" muted playsInline />
    </>
  );
}

function VoiceStateReporter({ channelId, policy, onScreenShareChange }: { channelId: string; policy: VoicePolicy; onScreenShareChange: (enabled: boolean) => void }) {
  const { isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();

  useEffect(() => {
    const emitState = () => {
      window.dispatchEvent(new CustomEvent('konferans:voice-state', {
        detail: {
          channelId,
          muted: policy.serverMuted || !isMicrophoneEnabled,
          deafened: policy.serverDeafened,
          camera: isCameraEnabled,
          screenShare: isScreenShareEnabled,
        },
      }));
    };

    emitState();
    const timer = window.setInterval(emitState, 5000);
    return () => window.clearInterval(timer);
  }, [channelId, isCameraEnabled, isMicrophoneEnabled, isScreenShareEnabled, policy.serverDeafened, policy.serverMuted]);

  useEffect(() => {
    onScreenShareChange(isScreenShareEnabled);
    return () => onScreenShareChange(false);
  }, [isScreenShareEnabled, onScreenShareChange]);

  return null;
}

function LocalScreenShareBadge({ visible }: { visible: boolean }) {
  const { localParticipant } = useLocalParticipant();

  if (!visible) return null;

  const displayName = localParticipant?.name || localParticipant?.identity || 'Sen';

  return (
    <div className="voice-presenter-badge" title={`${displayName} - Yayındasın!`}>
      <MonitorPlay size={16} />
      <span>{displayName} - Yayındasın!</span>
    </div>
  );
}

function ScreenSelectionControl({ visible, isSharing, surface }: { visible: boolean; isSharing: boolean; surface: 'stage' | 'control' }) {
  const { localParticipant } = useLocalParticipant();
  const [isSwitching, setIsSwitching] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const actionLabel = isSharing ? 'Ekranı değiştir' : 'Ekran paylaş';
  const primaryLabel = isSharing ? 'Yeni ekran seç' : 'Ekran seç';
  const modalCopy = isSharing ? 'Yeni paylaşım kaynağını seç.' : 'Paylaşmak istediğin ekranı, pencereyi veya sekmeyi seç.';
  const buttonClassName = surface === 'control'
    ? 'lk-button manual-screen-share-button screen-select-button'
    : 'voice-action-button screen-select-button';

  const changeScreen = async () => {
    if (!localParticipant || isSwitching) return;
    flushSync(() => {
      setIsPickerOpen(false);
      setIsSwitching(true);
    });
    try {
      if (isSharing) {
        await localParticipant.setScreenShareEnabled(false);
      }
      await localParticipant.setScreenShareEnabled(true);
    } catch {
      // The browser closes the picker as an exception if the user cancels.
    } finally {
      setIsSwitching(false);
    }
  };

  if (!visible) return null;

  return (
    <>
      <button className={buttonClassName} title={actionLabel} onClick={() => setIsPickerOpen(true)} disabled={isSwitching}>
        <MonitorPlay size={18} />
        <span>{isSwitching ? 'Ekran seçiliyor' : actionLabel}</span>
      </button>
      {isPickerOpen && (
        <div className="screen-picker-overlay" role="dialog" aria-modal="true" aria-label="Ekran seçimi" onClick={() => setIsPickerOpen(false)}>
          <div className="screen-picker-modal" onClick={(event) => event.stopPropagation()}>
            <div className="screen-picker-icon">
              <MonitorPlay size={24} />
            </div>
            <div className="screen-picker-copy">
              <strong>Ekran seçimi</strong>
              <span>{modalCopy}</span>
            </div>
            <div className="screen-picker-actions">
              <button className="secondary screen-picker-secondary" onClick={() => setIsPickerOpen(false)}>Vazgeç</button>
              <button className="primary screen-picker-primary" onClick={changeScreen} disabled={isSwitching}>
                {isSwitching ? 'Açılıyor...' : primaryLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StopScreenShareControl({ visible }: { visible: boolean }) {
  const { localParticipant } = useLocalParticipant();
  const [isStopping, setIsStopping] = useState(false);

  const stopScreenShare = async () => {
    if (!localParticipant || isStopping) return;
    setIsStopping(true);
    try {
      await localParticipant.setScreenShareEnabled(false);
    } finally {
      setIsStopping(false);
    }
  };

  if (!visible) return null;

  return (
    <button className="lk-button manual-screen-share-button screen-stop-button" title="Paylaşımı durdur" onClick={stopScreenShare} disabled={isStopping}>
      <MonitorPlay size={18} />
      <span>{isStopping ? 'Durduruluyor' : 'Paylaşımı durdur'}</span>
    </button>
  );
}

function GameVoiceControls({ channelId, settings, policy }: { channelId: string; settings: Settings; policy: VoicePolicy }) {
  const { localParticipant } = useLocalParticipant();
  const pttKey = settings.pushToTalkKey || 'Space';
  const pttEnabled = Boolean(settings.pushToTalkEnabled || policy.requirePushToTalk);

  useEffect(() => {
    if (!localParticipant) return;
    if (!pttEnabled) return;
    localParticipant.setMicrophoneEnabled(false).catch(() => null);
    const down = (event: KeyboardEvent) => {
      const keyMatches = event.code === pttKey || event.key === pttKey;
      if (!keyMatches || event.repeat || policy.serverMuted) return;
      localParticipant.setMicrophoneEnabled(true).catch(() => null);
      window.dispatchEvent(new CustomEvent('konferans:voice-state', { detail: { channelId, muted: false } }));
    };
    const up = (event: KeyboardEvent) => {
      const keyMatches = event.code === pttKey || event.key === pttKey;
      if (!keyMatches) return;
      localParticipant.setMicrophoneEnabled(false).catch(() => null);
      window.dispatchEvent(new CustomEvent('konferans:voice-state', { detail: { channelId, muted: true } }));
    };
    const handleForceMute = () => {
      localParticipant.setMicrophoneEnabled(false).catch(() => null);
      window.dispatchEvent(new CustomEvent('konferans:voice-state', { detail: { channelId, muted: true } }));
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('konferans:force-mute', handleForceMute);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('konferans:force-mute', handleForceMute);
    };
  }, [channelId, localParticipant, policy.serverMuted, pttEnabled, pttKey]);

  return (
    <LocalMuteManager />
  );
}

function LocalMuteManager() {
  const remoteParticipants = useRemoteParticipants();
  
  useEffect(() => {
    const applyMutes = () => {
      const mutedList = JSON.parse(localStorage.getItem('konferans:local-muted') || '[]');
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
    window.addEventListener('konferans:local-mute-change', applyMutes);
    return () => window.removeEventListener('konferans:local-mute-change', applyMutes);
  }, [remoteParticipants]);

  return null;
}
