'use client';

import { useEffect, useState } from 'react';
import { Code2, KeyRound, Webhook } from 'lucide-react';
import { api } from '@/lib/api';

type Server = { id: string; name: string; channels: { id: string; name: string; type: string }[] };
type Integration = { id: string; name: string; clientId: string; status: string; createdAt: string };

export function IntegrationsPanel({ token, server }: { token: string; server: Server }) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [secret, setSecret] = useState('');
  const [message, setMessage] = useState('');
  const [origin, setOrigin] = useState('');

  async function load() {
    const data = await api<{ integrations: Integration[] }>(`/servers/${server.id}/integrations`, { token });
    setIntegrations(data.integrations);
  }

  useEffect(() => { setOrigin(window.location.origin); load().catch((error) => setMessage(error.message)); }, [server.id]);

  async function createIntegration() {
    const name = prompt('Entegrasyon adı', `${server.name} Website`);
    if (!name) return;
    const selectedOrigin = prompt('İzinli origin/domain', origin || 'https://example.com') || origin || 'https://example.com';
    const data = await api<{ integration: Integration; clientSecret: string; warning: string }>(`/servers/${server.id}/integrations`, {
      token,
      method: 'POST',
      body: JSON.stringify({ name, allowedOrigins: [selectedOrigin], scopes: ['embed:read', 'sso:create', 'voice:join'] }),
    });
    setSecret(`Client ID: ${data.integration.clientId}\nClient Secret: ${data.clientSecret}\n${data.warning}`);
    await load();
  }

  async function createWebhook() {
    const voiceOrText = server.channels.find((c) => c.type === 'TEXT') ?? server.channels[0];
    const name = prompt('Webhook adı', 'Website Events');
    if (!name) return;
    const data = await api<{ secret: string }>(`/servers/${server.id}/webhooks`, {
      token,
      method: 'POST',
      body: JSON.stringify({ name, channelId: voiceOrText?.id, events: ['message.created', 'member.joined', 'voice.joined'] }),
    });
    setSecret(`Webhook Secret: ${data.secret}`);
  }

  async function createSsoToken() {
    const data = await api<{ token: string; expiresAt: string }>('/sso/sessions', { token, method: 'POST', body: JSON.stringify({ serverId: server.id, redirectUrl: origin || 'https://example.com' }) });
    setSecret(`SSO one-time token: ${data.token}\nExpires: ${new Date(data.expiresAt).toLocaleString('tr-TR')}`);
  }

  return (
    <div className="utility-panel">
      <div className="panel-title"><Code2 size={24} /> Site entegrasyonu</div>
      <p className="panel-muted">Mevcut web sitene widget, SSO ve webhook bağlantısı için gerekli altyapı.</p>
      {message && <p className="error">{message}</p>}
      <div className="action-grid">
        <button className="primary" onClick={createIntegration}><KeyRound size={16} /> Integration app oluştur</button>
        <button className="secondary" onClick={createWebhook}><Webhook size={16} /> Webhook oluştur</button>
        <button className="secondary" onClick={createSsoToken}>SSO token üret</button>
      </div>
      {secret && <pre className="codebox">{secret}</pre>}
      <div className="panel-subtitle">Aktif integration app kayıtları</div>
      {integrations.map((item) => (
        <div className="integration-row" key={item.id}>
          <div>
            <strong>{item.name}</strong>
            <span>{item.clientId} · {item.status}</span>
          </div>
        </div>
      ))}
      <div className="panel-subtitle">Embed URL</div>
      <pre className="codebox">{`${origin || 'https://your-domain.com'}/embed/${server.id}`}</pre>
    </div>
  );
}
