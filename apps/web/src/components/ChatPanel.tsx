'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

type Message = { id: string; content: string; createdAt: string; author: { id: string; name: string } };

export function ChatPanel({ token, channel }: { token: string; channel: { id: string; name: string } }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [typing, setTyping] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [userMenu, setUserMenu] = useState<{ x: number; y: number; user: { id: string; name: string } } | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClick = () => setUserMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  async function handleAddFriend(targetUserId: string) {
    try {
      await api('/friends/request', { method: 'POST', body: JSON.stringify({ targetUserId }), token });
      alert('Arkadaşlık isteği gönderildi!');
    } catch (err: any) { alert(err.message); }
    setUserMenu(null);
  }

  useEffect(() => {
    api<{ messages: Message[] }>(`/channels/${channel.id}/messages`, { token }).then((data) => setMessages(data.messages)).catch((err) => setError(err.message));
    const socket = getSocket(token);
    socket.emit('channel:join', { channelId: channel.id });
    const messageHandler = ({ message }: { message: Message }) => setMessages((prev) => prev.some((m) => m.id === message.id) ? prev : [...prev, message]);
    const typingStart = ({ name }: { name: string }) => setTyping((prev) => prev.includes(name) ? prev : [...prev, name]);
    const typingStop = ({ name }: { name: string }) => setTyping((prev) => prev.filter((x) => x !== name));
    socket.on('message:new', messageHandler);
    socket.on('typing:start', typingStart);
    socket.on('typing:stop', typingStop);
    return () => {
      socket.off('message:new', messageHandler);
      socket.off('typing:start', typingStart);
      socket.off('typing:stop', typingStop);
      socket.emit('typing:stop', { channelId: channel.id });
    };
  }, [channel.id, token]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = 'auto';
    composer.style.height = `${Math.min(composer.scrollHeight, 168)}px`;
  }, [content]);

  function onChange(value: string) {
    setContent(value);
    const socket = getSocket(token);
    socket.emit('typing:start', { channelId: channel.id });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit('typing:stop', { channelId: channel.id }), 1000);
  }

  function send() {
    if (!content.trim()) return;
    setError('');
    const socket = getSocket(token);
    socket.emit('message:create', { channelId: channel.id, content }, (ack: any) => {
      if (ack?.ok) setContent('');
      else setError(ack?.message || 'Mesaj gönderilemedi.');
    });
  }

  return (
    <div className="chat">
      <div className="messages">
        {messages.map((message, index) => {
          const prevMessage = messages[index - 1];
          const isConsecutive = prevMessage && prevMessage.author.id === message.author.id && (new Date(message.createdAt).getTime() - new Date(prevMessage.createdAt).getTime() < 5 * 60 * 1000);

          return (
            <div key={message.id} className="message-group" style={{ marginTop: isConsecutive ? '4px' : '24px' }}>
              {!isConsecutive && (
                <div className="message-header">
                  <div
                    className="avatar chat-avatar"
                    style={{ cursor: 'context-menu' }}
                    onContextMenu={(e) => { e.preventDefault(); setUserMenu({ x: e.clientX, y: e.clientY, user: message.author }); }}
                  >
                    {message.author.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="message-meta">
                    <span
                      className="message-author"
                      style={{ cursor: 'context-menu' }}
                      onContextMenu={(e) => { e.preventDefault(); setUserMenu({ x: e.clientX, y: e.clientY, user: message.author }); }}
                    >
                      {message.author.name}
                    </span>
                    <span className="message-time" style={{ marginLeft: 0 }}>{new Date(message.createdAt).toLocaleDateString('tr-TR')}</span>
                  </div>
                </div>
              )}
              <div className="message-row">
                <div className="message-time-hover">
                  {new Date(message.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="message-content">{message.content}</div>
              </div>
            </div>
          );
        })}
        {typing.length > 0 && <div className="typing">{typing.join(', ')} yazıyor...</div>}
        <div ref={bottomRef} />
      </div>
      <div className="composer">
        <textarea
          ref={composerRef}
          value={content}
          rows={1}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={`#${channel.name} kanalına mesaj yaz`}
        />
        <button className="primary" onClick={send}><Send size={18} /></button>
      </div>
      {error && <div className="composer-error">{error}</div>}
      {userMenu && (
        <div style={{ position: 'fixed', top: userMenu.y, left: userMenu.x, backgroundColor: '#2f3136', border: '1px solid #202225', padding: '4px', borderRadius: '4px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '2px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
          <div style={{ padding: '4px 8px', fontSize: '12px', color: '#9ca3af', fontWeight: 'bold' }}>{userMenu.user.name}</div>
          <button style={{ backgroundColor: 'transparent', color: '#dcddde', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4752c4'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dcddde'; }} onClick={() => { window.dispatchEvent(new CustomEvent('nav:direct', { detail: { user: userMenu.user } })); setUserMenu(null); }}>Özel Mesaj Gönder</button>
          <button style={{ backgroundColor: 'transparent', color: '#dcddde', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4752c4'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dcddde'; }} onClick={() => handleAddFriend(userMenu.user.id)}>Arkadaş Ekle</button>
        </div>
      )}
    </div>
  );
}
