'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

type User = { id: string; name: string; email?: string; avatarUrl?: string; presenceStatus?: string };
type FriendRequest = { id: string; status: string; sender: User; receiver: User };
type DirectMessage = { id: string; content: string; createdAt: string; sender: User; receiver: User };
type Conversation = { user: User; lastMessage: DirectMessage | null };
type HomeTab = 'messages' | 'friends';

export function FriendsPanel({
  token,
  initialTab = 'friends',
  initialUser,
  onInitialUserConsumed,
}: {
  token: string;
  initialTab?: HomeTab;
  initialUser?: User | null;
  onInitialUserConsumed?: () => void;
}) {
  const [tab, setTab] = useState<HomeTab>(initialTab);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [friends, setFriends] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  async function load() {
    const [me, friendData, conversationData] = await Promise.all([
      api<{ user: User }>('/auth/me', { token }),
      api<{ friends: User[]; requests: FriendRequest[] }>('/friends', { token }),
      api<{ conversations: Conversation[] }>('/direct/conversations', { token }),
    ]);
    setCurrentUser(me.user);
    setFriends(friendData.friends);
    setRequests(friendData.requests);
    setConversations(conversationData.conversations);
    if (!selectedUser && conversationData.conversations[0]) {
      setSelectedUser(conversationData.conversations[0].user);
    }
  }

  useEffect(() => { setTab(initialTab); }, [initialTab]);
  useEffect(() => { load().catch((err) => setError(err.message)); }, [token]);

  useEffect(() => {
    if (!initialUser) return;
    void openDirect(initialUser);
    onInitialUserConsumed?.();
  }, [initialUser?.id]);

  useEffect(() => {
    if (!selectedUser) {
      setDirectMessages([]);
      return;
    }
    api<{ messages: DirectMessage[] }>(`/direct/${selectedUser.id}/messages`, { token })
      .then((data) => {
        setDirectMessages(data.messages);
        setError('');
      })
      .catch((err) => {
        setDirectMessages([]);
        setError(err.message);
      });
  }, [selectedUser?.id, token]);

  useEffect(() => {
    if (!currentUser) return;
    const socket = getSocket(token);
    const onDirectNew = ({ message: directMessage }: { message: DirectMessage }) => {
      const otherUser = directMessage.sender.id === currentUser.id ? directMessage.receiver : directMessage.sender;
      setConversations((prev) => {
        const withoutCurrent = prev.filter((conversation) => conversation.user.id !== otherUser.id);
        return [{ user: otherUser, lastMessage: directMessage }, ...withoutCurrent];
      });
      if (selectedUser?.id === otherUser.id) {
        setDirectMessages((prev) => prev.some((item) => item.id === directMessage.id) ? prev : [...prev, directMessage]);
      }
    };
    socket.on('direct:new', onDirectNew);
    return () => {
      socket.off('direct:new', onDirectNew);
    };
  }, [token, currentUser?.id, selectedUser?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [directMessages]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = 'auto';
    composer.style.height = `${Math.min(composer.scrollHeight, 150)}px`;
  }, [content]);

  async function sendRequest() {
    if (!email.trim()) return;
    setError('');
    await api('/friends/request', { token, method: 'POST', body: JSON.stringify({ email }) });
    setEmail('');
    setMessage('Arkadaşlık isteği gönderildi.');
    await load();
  }

  async function respond(requestId: string, action: 'ACCEPT' | 'DECLINE' | 'BLOCK') {
    await api(`/friends/requests/${requestId}`, { token, method: 'PATCH', body: JSON.stringify({ action }) });
    await load();
  }

  async function openDirect(user: User) {
    setSelectedUser(user);
    setTab('messages');
    setContent('');
    setMessage('');
  }

  function sendDirect() {
    if (!selectedUser || !content.trim()) return;
    setError('');
    const socket = getSocket(token);
    socket.emit('direct:create', { receiverId: selectedUser.id, content }, (ack: any) => {
      if (ack?.ok) setContent('');
      else setError(ack?.message || 'Özel mesaj gönderilemedi.');
    });
  }

  const pendingRequests = requests.filter((request) => request.status === 'PENDING');

  return (
    <div className="home-panel">
      <aside className="home-sidebar">
        <div className="home-tabs">
          <button className={`home-tab ${tab === 'messages' ? 'active' : ''}`} onClick={() => setTab('messages')}>
            <MessageCircle size={16} /> Mesajlar
          </button>
          <button className={`home-tab ${tab === 'friends' ? 'active' : ''}`} onClick={() => setTab('friends')}>
            <UserPlus size={16} /> Arkadaşlar
          </button>
        </div>

        {tab === 'messages' ? (
          <div className="dm-list">
            {conversations.length === 0 && <p className="panel-muted">Henüz özel mesaj yok.</p>}
            {conversations.map((conversation) => (
              <button
                key={conversation.user.id}
                className={`dm-list-item ${selectedUser?.id === conversation.user.id ? 'active' : ''}`}
                onClick={() => openDirect(conversation.user)}
              >
                <div className="avatar small">{conversation.user.name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{conversation.user.name}</strong>
                  <span>{conversation.lastMessage?.content ?? 'Konuşmayı başlat'}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="dm-list">
            {friends.length === 0 && <p className="panel-muted">Henüz arkadaş yok.</p>}
            {friends.map((friend) => (
              <button key={friend.id} className="dm-list-item" onClick={() => openDirect(friend)}>
                <div className="avatar small">{friend.name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{friend.name}</strong>
                  <span>{friend.presenceStatus ?? 'OFFLINE'}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="home-main">
        {tab === 'messages' ? (
          selectedUser ? (
            <div className="direct-chat">
              <div className="direct-header">
                <div className="avatar small">{selectedUser.name.slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{selectedUser.name}</strong>
                  <span>Özel mesaj</span>
                </div>
              </div>
              <div className="direct-messages">
                {directMessages.map((directMessage) => {
                  const mine = currentUser?.id === directMessage.sender.id;
                  return (
                    <div key={directMessage.id} className={`direct-message ${mine ? 'mine' : ''}`}>
                      <div className="direct-bubble">
                        <span>{directMessage.content}</span>
                      </div>
                    </div>
                  );
                })}
                {directMessages.length === 0 && !error && <p className="panel-muted">Bu konuşmada henüz mesaj yok.</p>}
                <div ref={bottomRef} />
              </div>
              {error && (
                <div className="direct-error">
                  <span>{error}</span>
                </div>
              )}
              <div className="composer direct-composer">
                <textarea
                  ref={composerRef}
                  value={content}
                  rows={1}
                  onChange={(event) => setContent(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      sendDirect();
                    }
                  }}
                  placeholder={`${selectedUser.name} kullanıcısına mesaj yaz`}
                />
                <button className="primary" onClick={sendDirect}><Send size={18} /></button>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <MessageCircle size={38} />
              <strong>Mesaj seç</strong>
              <span>Özel konuşmaların burada görünür.</span>
            </div>
          )
        ) : (
          <div className="friends-home">
            <div className="panel-title">Arkadaşlar</div>
            <p className="panel-muted">Arkadaşlarını ekle veya listedeki kişilerle daha hızlı iletişim kur.</p>
            <div className="inline-form">
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="arkadas@example.com" />
              <button className="primary" onClick={sendRequest}>Ekle</button>
            </div>
            {message && <p className="success">{message}</p>}
            {error && <p className="error">{error}</p>}

            <div className="panel-subtitle">Arkadaşlar</div>
            {friends.length === 0 && <p className="panel-muted">Henüz arkadaş yok.</p>}
            {friends.map((friend) => (
              <div className="friend-row" key={friend.id}>
                <div className="avatar small">{friend.name.slice(0, 1).toUpperCase()}</div>
                <div><strong>{friend.name}</strong><br /><span>{friend.presenceStatus ?? 'OFFLINE'}</span></div>
                <button className="secondary" onClick={() => openDirect(friend)}>Mesaj</button>
              </div>
            ))}

            <div className="panel-subtitle">Bekleyen istekler</div>
            {pendingRequests.length === 0 && <p className="panel-muted">Bekleyen istek yok.</p>}
            {pendingRequests.map((request) => (
              <div className="request-row" key={request.id}>
                <span>{request.sender.name} {'->'} {request.receiver.name}</span>
                <div>
                  <button className="secondary" onClick={() => respond(request.id, 'ACCEPT')}>Kabul</button>
                  <button className="secondary" onClick={() => respond(request.id, 'DECLINE')}>Reddet</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
