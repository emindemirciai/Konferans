'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type User = { id: string; name: string; email: string; avatarUrl?: string; presenceStatus?: string };
type FriendRequest = { id: string; status: string; sender: User; receiver: User };

export function FriendsPanel({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [friends, setFriends] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [message, setMessage] = useState('');

  async function load() {
    const data = await api<{ friends: User[]; requests: FriendRequest[] }>('/friends', { token });
    setFriends(data.friends);
    setRequests(data.requests);
  }

  useEffect(() => { load(); }, [token]);

  async function sendRequest() {
    if (!email.trim()) return;
    await api('/friends/request', { token, method: 'POST', body: JSON.stringify({ email }) });
    setEmail('');
    setMessage('Arkadaşlık isteği gönderildi.');
    load();
  }

  async function respond(requestId: string, action: 'ACCEPT' | 'DECLINE' | 'BLOCK') {
    await api(`/friends/requests/${requestId}`, { token, method: 'PATCH', body: JSON.stringify({ action }) });
    load();
  }

  return (
    <div className="utility-panel">
      <div className="panel-title">Arkadaşlar / Özel Mesaj</div>
      <p className="panel-muted">Arkadaşlık kabul edilince DM API ve socket olayı aktif çalışır.</p>
      <div className="inline-form">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="arkadas@example.com" />
        <button className="primary" onClick={sendRequest}>Ekle</button>
      </div>
      {message && <p className="success">{message}</p>}
      <div className="panel-subtitle">Arkadaşlar</div>
      {friends.length === 0 && <p className="panel-muted">Henüz arkadaş yok.</p>}
      {friends.map((friend) => (
        <div className="friend-row" key={friend.id}>
          <div className="avatar small">{friend.name.slice(0, 1).toUpperCase()}</div>
          <div><strong>{friend.name}</strong><br /><span>{friend.presenceStatus ?? 'OFFLINE'}</span></div>
        </div>
      ))}
      <div className="panel-subtitle">Bekleyen istekler</div>
      {requests.filter((r) => r.status === 'PENDING').map((request) => (
        <div className="request-row" key={request.id}>
          <span>{request.sender.name} → {request.receiver.name}</span>
          <div>
            <button className="secondary" onClick={() => respond(request.id, 'ACCEPT')}>Kabul</button>
            <button className="secondary" onClick={() => respond(request.id, 'DECLINE')}>Reddet</button>
          </div>
        </div>
      ))}
    </div>
  );
}
