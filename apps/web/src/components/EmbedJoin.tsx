'use client';

import { useEffect, useState } from 'react';
import { Mic, MonitorUp, Video } from 'lucide-react';
import { api } from '@/lib/api';

type EmbedData = {
  server: { id: string; name: string; description?: string | null; channels: { id: string; name: string; allowVideo: boolean; allowScreenShare: boolean }[] };
};

export function EmbedJoin({ serverId }: { serverId: string }) {
  const [data, setData] = useState<EmbedData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<EmbedData>(`/embed/${serverId}/public`).then(setData).catch((err) => setError(err.message));
  }, [serverId]);

  if (error) return <div className="login-page"><div className="join-card"><h1>Let's Meet</h1><p>{error}</p></div></div>;
  if (!data) return <div className="login-page"><div className="join-card"><p>Yükleniyor...</p></div></div>;

  return (
    <main className="login-page embed-page">
      <div className="join-card">
        <h1>{data.server.name}</h1>
        <p>{data.server.description || "Ses, kamera ve ekran paylaşımı için Let's Meet odasına katıl."}</p>
        <div className="policy-grid">
          <span><Mic size={14} /> Ses kanalı</span>
          <span><Video size={14} /> Kamera desteği</span>
          <span><MonitorUp size={14} /> Ekran paylaşımı</span>
        </div>
        {data.server.channels.map((channel) => (
          <button key={channel.id} className="primary" onClick={() => { window.location.href = `/?server=${data.server.id}&channel=${channel.id}`; }}>
            {channel.name} kanalına git
          </button>
        ))}
      </div>
    </main>
  );
}
