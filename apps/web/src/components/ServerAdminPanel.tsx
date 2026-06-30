'use client';

import { useState } from 'react';
import { Copy } from 'lucide-react';
import { api, clearToken } from '@/lib/api';

type Member = { id: string; role: string; serverMuted?: boolean; serverDeafened?: boolean; user: { id: string; name: string; email: string } };
type Channel = { id: string; name: string; type: 'TEXT' | 'VOICE'; allowVideo?: boolean; allowScreenShare?: boolean; requirePushToTalk?: boolean; lowLatencyMode?: boolean; isLocked?: boolean };
type Server = { id: string; name: string; channels: Channel[]; members: Member[]; widget?: any };

export function ServerAdminPanel({ token, server, role, onChanged, onDeleted }: { token: string; server: Server; role: string; onChanged: () => void; onDeleted?: (serverId: string) => void | Promise<void> }) {
  const [invite, setInvite] = useState('');
  const [widgetCode, setWidgetCode] = useState('');
  const canAdmin = role === 'OWNER' || role === 'ADMIN';
  const canMod = canAdmin || role === 'MODERATOR';

  async function createInvite() {
    const data = await api<{ url: string }>(`/servers/${server.id}/invites`, { token, method: 'POST', body: JSON.stringify({ maxUses: 25, expiresInHours: 24 }) });
    setInvite(data.url);
  }

  async function createChannel(type: 'TEXT' | 'VOICE') {
    const name = prompt(type === 'TEXT' ? 'Metin kanalı adı' : 'Ses kanalı adı');
    if (!name) return;
    await api(`/servers/${server.id}/channels`, { token, method: 'POST', body: JSON.stringify({ name, type, allowVideo: true, allowScreenShare: true, lowLatencyMode: true }) });
    onChanged();
  }

  async function updateRole(memberId: string, nextRole: string) {
    await api(`/servers/${server.id}/members/${memberId}/role`, { token, method: 'PATCH', body: JSON.stringify({ role: nextRole }) });
    onChanged();
  }

  async function moderate(memberId: string, type: string) {
    const reason = prompt('Sebep');
    await api(`/servers/${server.id}/members/${memberId}/moderation`, { token, method: 'POST', body: JSON.stringify({ type, reason: reason || undefined, durationMinutes: type === 'MUTE' ? 30 : undefined }) });
    onChanged();
  }

  async function toggleWidget() {
    const data = await api<{ embedUrl: string }>(`/servers/${server.id}/widget`, {
      token,
      method: 'PUT',
      body: JSON.stringify({ enabled: true, allowGuestPreview: true, theme: 'gaming', defaultChannelId: server.channels.find((c) => c.type === 'VOICE')?.id ?? null }),
    });
    setWidgetCode(`<iframe src="${data.embedUrl}" width="420" height="720"></iframe>`);
  }

  async function deleteServer() {
    if (!confirm(`'${server.name}' sunucusunu tamamen silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`)) return;
    await api(`/servers/${server.id}`, { token, method: 'DELETE' });
    await onDeleted?.(server.id);
  }

  function logout() {
    clearToken();
    window.location.href = '/';
  }

  return (
    <div className="utility-panel">
      <div className="panel-title">Sunucu Yönetimi</div>
      {!canMod && <p className="panel-muted">Bu paneli görüntüleyebilirsin ama işlem için moderasyon yetkisi gerekir.</p>}
      <div style={{ display: 'flex', gap: '24px', maxWidth: '820px', alignItems: 'stretch' }}>
        <div className="action-grid" style={{ flex: 2, margin: 0 }}>
          <button className="secondary" disabled={!canMod} onClick={createInvite}>Davet linki oluştur</button>
          <button className="secondary" disabled={!canMod} onClick={() => createChannel('TEXT')}>Metin kanalı ekle</button>
          <button className="secondary" disabled={!canMod} onClick={() => createChannel('VOICE')}>Ses/video kanalı ekle</button>
          <button className="secondary" disabled={!canAdmin} onClick={toggleWidget}>Site widget kodu</button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {canAdmin && <button style={{ backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '12px 16px', borderRadius: '14px', flex: 1 }} onClick={deleteServer}>Sunucuyu Sil</button>}
          <button style={{ backgroundColor: '#e74c3c', color: 'white', border: 'none', padding: '12px 16px', borderRadius: '14px', flex: 1 }} onClick={logout}>Güvenli Çıkış Yap</button>
        </div>
      </div>
      {widgetCode && <pre className="codebox">{widgetCode}</pre>}

      <div style={{ margin: '20px 0', padding: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '14px', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '14px', fontWeight: 500 }}>Sunucu Davet Linki</div>
          <div style={{ fontFamily: 'monospace', fontSize: '16px', color: 'var(--success)', fontWeight: 600, letterSpacing: '0.5px' }}>{invite || 'Davet linki oluşturmak için yukarıdaki butona tıklayın'}</div>
          <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '16px', opacity: 0.85 }}>Bu davet linki 24 saat sonra geçersiz olur ve maksimum 25 kullanım ile sınırlıdır.</div>
        </div>
        <button className="primary" disabled={!invite} onClick={() => navigator.clipboard.writeText(invite)} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 16px', fontSize: '14px' }}>
          <Copy size={18} /> Kopyala
        </button>
      </div>
      <div className="panel-subtitle">Üyeler</div>
      {server.members.map((member) => (
        <div className="member-admin-row" key={member.id}>
          <div>
            <strong>{member.user.name}</strong><br />
            <span>{member.role}{member.serverMuted ? ' · susturuldu' : ''}{member.serverDeafened ? ' · sağırlaştırıldı' : ''}</span>
          </div>
          {canAdmin && member.role !== 'OWNER' && (
            <select value={member.role} onChange={(e) => updateRole(member.id, e.target.value)}>
              <option value="ADMIN">Admin</option>
              <option value="MODERATOR">Moderatör</option>
              <option value="MEMBER">Üye</option>
              <option value="GUEST">Misafir</option>
            </select>
          )}
          {canMod && member.role !== 'OWNER' && (
            <div className="mini-actions">
              <button onClick={() => moderate(member.id, member.serverMuted ? 'UNMUTE' : 'MUTE')}>{member.serverMuted ? 'Susturma kaldır' : 'Sustur'}</button>
              <button onClick={() => moderate(member.id, member.serverDeafened ? 'UNDEAFEN' : 'DEAFEN')}>{member.serverDeafened ? 'Sağırlaştırma kaldır' : 'Sağırlaştır'}</button>
              <button onClick={() => moderate(member.id, 'KICK')}>At</button>
              <button onClick={() => moderate(member.id, 'BAN')}>Ban</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
