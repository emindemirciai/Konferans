'use client';

import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';

type Notification = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  readAt?: string | null;
  createdAt: string;
  actor?: { name: string } | null;
};

type Preferences = {
  directMessages: boolean;
  mentions: boolean;
  friendRequests: boolean;
  moderation: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
};

export function NotificationsPanel({ token }: { token: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [message, setMessage] = useState('');

  async function load() {
    const data = await api<{ notifications: Notification[] }>('/notifications', { token });
    const prefData = await api<{ preferences: Preferences }>('/notification-preferences', { token });
    setItems(data.notifications);
    setPrefs(prefData.preferences);
  }

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  async function markAllRead() {
    await api('/notifications/read-all', { token, method: 'POST', body: JSON.stringify({}) });
    await load();
  }

  async function updatePrefs(next: Partial<Preferences>) {
    const updated = { ...(prefs ?? {}), ...next };
    const data = await api<{ preferences: Preferences }>('/notification-preferences', { token, method: 'PUT', body: JSON.stringify(updated) });
    setPrefs(data.preferences);
  }

  async function registerDemoDevice() {
    const deviceName = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 72) : 'web';
    await api('/push-subscriptions', { token, method: 'POST', body: JSON.stringify({ provider: 'WEB_PUSH', token: `manual-web-${Date.now()}`, platform: 'web', deviceName }) });
    setMessage('Web push abonelik altyapısı kaydedildi. Gerçek VAPID/FCM bağlantısı production ayarında açılır.');
  }

  return (
    <div className="utility-panel">
      <div className="panel-title"><Bell size={24} /> Bildirimler</div>
      <p className="panel-muted">DM, arkadaşlık, mention, moderasyon ve sistem bildirimleri burada toplanır.</p>
      {message && <p className="success">{message}</p>}
      <div className="action-grid">
        <button className="primary" onClick={markAllRead}><CheckCheck size={16} /> Tümünü okundu yap</button>
        <button className="secondary" onClick={registerDemoDevice}><Smartphone size={16} /> Bu cihazı kaydet</button>
      </div>

      <div className="panel-subtitle">Bildirim tercihleri</div>
      {prefs && (
        <div>
          {[
            ['directMessages', 'Özel mesajlar'],
            ['mentions', 'Mention bildirimleri'],
            ['friendRequests', 'Arkadaşlık istekleri'],
            ['moderation', 'Moderasyon bildirimleri'],
            ['pushEnabled', 'Push bildirimleri'],
            ['emailEnabled', 'E-posta bildirimleri'],
            ['quietHoursEnabled', 'Sessiz saatler'],
          ].map(([key, label]) => (
            <label className="switch-row" key={key}>
              <span>{label}</span>
              <input type="checkbox" checked={Boolean((prefs as any)[key])} onChange={(e) => updatePrefs({ [key]: e.target.checked } as Partial<Preferences>)} />
            </label>
          ))}
        </div>
      )}

      <div className="panel-subtitle">Son bildirimler</div>
      {items.length === 0 && <p className="panel-muted">Henüz bildirim yok.</p>}
      {items.map((item) => (
        <div className={`notice-row ${item.readAt ? '' : 'unread'}`} key={item.id}>
          <div>
            <strong>{item.title}</strong>
            {item.body && <p>{item.body}</p>}
            <span>{new Date(item.createdAt).toLocaleString('tr-TR')} · {item.type}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
