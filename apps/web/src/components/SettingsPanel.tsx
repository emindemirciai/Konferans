'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Settings = {
  pushToTalkEnabled: boolean;
  pushToTalkKey: string;
  voiceActivationThreshold: number;
  lowPowerMode: boolean;
  performanceMode: boolean;
  overlayCompactMode: boolean;
  showOnlyActiveSpeakers: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  inputVolume: number;
  outputVolume: number;
  startMuted: boolean;
  cameraEnabledByDefault: boolean;
  screenShareQuality: 'LOW' | 'BALANCED' | 'HIGH';
  autoJoinLastVoice: boolean;
  mobileDataSaver: boolean;
  hardwareAccelerationHint: boolean;
  animatedUi: boolean;
  compactOverlayOpacity: number;
  maxIncomingVideoTracks: number;
};

const labels: Record<keyof Settings, string> = {
  pushToTalkEnabled: 'Push-to-talk',
  pushToTalkKey: 'Push-to-talk tuşu',
  voiceActivationThreshold: 'Ses algılama eşiği',
  lowPowerMode: 'Düşük güç modu',
  performanceMode: 'Oyun performans modu',
  overlayCompactMode: 'Kompakt overlay görünümü',
  showOnlyActiveSpeakers: 'Sadece aktif konuşanları göster',
  echoCancellation: 'Yankı engelleme',
  noiseSuppression: 'Gürültü engelleme',
  autoGainControl: 'Otomatik mikrofon kazancı',
  inputVolume: 'Mikrofon seviyesi',
  outputVolume: 'Kulaklık/ses seviyesi',
  startMuted: 'Kanala sessiz başla',
  cameraEnabledByDefault: 'Kamera varsayılan açık',
  screenShareQuality: 'Ekran paylaşımı kalitesi',
  autoJoinLastVoice: 'Son ses kanalına otomatik bağlan',
  mobileDataSaver: 'Mobil veri tasarrufu',
  hardwareAccelerationHint: 'Donanım hızlandırma ipucu',
  animatedUi: 'Arayüz animasyonları',
  compactOverlayOpacity: 'Overlay şeffaflığı',
  maxIncomingVideoTracks: 'Maksimum gelen video',
};

export function SettingsPanel({ token }: { token: string }) {
  const [settings, setSettings] = useState<Partial<Settings>>({});
  const [saved, setSaved] = useState('');

  useEffect(() => {
    api<{ settings: Settings }>('/settings', { token }).then((data) => setSettings(data.settings));
  }, [token]);

  async function save(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    const data = await api<{ settings: Settings }>('/settings', { token, method: 'PUT', body: JSON.stringify(patch) });
    setSettings(data.settings);
    setSaved('Kaydedildi');
    setTimeout(() => setSaved(''), 1200);
  }

  function toggle(key: keyof Settings) {
    save({ [key]: !settings[key] } as Partial<Settings>);
  }

  return (
    <div className="utility-panel">
      <div className="panel-title">Oyun / Ses Ayarları</div>
      <p className="panel-muted">Bu ayarlar web ve native mobil uygulamada aynı hesaba bağlı çalışır.</p>
      {(['performanceMode', 'lowPowerMode', 'overlayCompactMode', 'pushToTalkEnabled', 'showOnlyActiveSpeakers', 'echoCancellation', 'noiseSuppression', 'autoGainControl', 'startMuted', 'cameraEnabledByDefault', 'mobileDataSaver', 'hardwareAccelerationHint', 'animatedUi'] as Array<keyof Settings>).map((key) => (
        <label className="switch-row" key={key}>
          <span>{labels[key]}</span>
          <input type="checkbox" checked={Boolean(settings[key])} onChange={() => toggle(key)} />
        </label>
      ))}
      <div className="field compact">
        <label>{labels.pushToTalkKey}</label>
        <input value={settings.pushToTalkKey ?? 'Space'} onChange={(e) => setSettings((s) => ({ ...s, pushToTalkKey: e.target.value }))} onBlur={(e) => save({ pushToTalkKey: e.target.value })} />
      </div>
      <div className="field compact">
        <label>{labels.voiceActivationThreshold}: {settings.voiceActivationThreshold ?? -50} dB</label>
        <input type="range" min="-100" max="0" value={settings.voiceActivationThreshold ?? -50} onChange={(e) => save({ voiceActivationThreshold: Number(e.target.value) })} />
      </div>
      <div className="field compact">
        <label>{labels.inputVolume}: {settings.inputVolume ?? 1}</label>
        <input type="range" min="0" max="2" step="0.1" value={settings.inputVolume ?? 1} onChange={(e) => save({ inputVolume: Number(e.target.value) })} />
      </div>
      <div className="field compact">
        <label>{labels.outputVolume}: {settings.outputVolume ?? 1}</label>
        <input type="range" min="0" max="2" step="0.1" value={settings.outputVolume ?? 1} onChange={(e) => save({ outputVolume: Number(e.target.value) })} />
      </div>
      <div className="field compact">
        <label>{labels.compactOverlayOpacity}: {settings.compactOverlayOpacity ?? 0.92}</label>
        <input type="range" min="0.4" max="1" step="0.02" value={settings.compactOverlayOpacity ?? 0.92} onChange={(e) => save({ compactOverlayOpacity: Number(e.target.value) })} />
      </div>
      <div className="field compact">
        <label>{labels.maxIncomingVideoTracks}: {settings.maxIncomingVideoTracks ?? 4}</label>
        <input type="range" min="0" max="16" step="1" value={settings.maxIncomingVideoTracks ?? 4} onChange={(e) => save({ maxIncomingVideoTracks: Number(e.target.value) })} />
      </div>
      <div className="field compact">
        <label>{labels.screenShareQuality}</label>
        <select value={settings.screenShareQuality ?? 'BALANCED'} onChange={(e) => save({ screenShareQuality: e.target.value as Settings['screenShareQuality'] })}>
          <option value="LOW">Düşük / performans</option>
          <option value="BALANCED">Dengeli</option>
          <option value="HIGH">Yüksek kalite</option>
        </select>
      </div>
      {saved && <p className="success">{saved}</p>}
    </div>
  );
}
