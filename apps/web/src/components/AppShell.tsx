'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Code2, Gamepad2, Hash, LogOut, MessageCircle, Mic, MicOff, PhoneOff, Plus, Settings, Shield, UserPlus, Video, Home } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { API_URL, api, clearToken, getToken } from '@/lib/api';
import { ChatPanel } from './ChatPanel';
import { VoiceRoom } from './VoiceRoom';
import { FriendsPanel } from './FriendsPanel';
import { ServerAdminPanel } from './ServerAdminPanel';
import { SettingsPanel } from './SettingsPanel';
import { NotificationsPanel } from './NotificationsPanel';
import { IntegrationsPanel } from './IntegrationsPanel';

type Server = { id: string; name: string; slug: string; role: string; isPublic?: boolean };
type Channel = { id: string; serverId: string; name: string; type: 'TEXT' | 'VOICE'; position: number; category?: string | null; allowVideo?: boolean; allowScreenShare?: boolean; requirePushToTalk?: boolean; lowLatencyMode?: boolean; isLocked?: boolean };
type Member = { id: string; role: string; serverMuted?: boolean; serverDeafened?: boolean; user: { id: string; name: string; email: string; avatarUrl?: string; presenceStatus?: string } };

type ServerDetail = {
  server: {
    id: string;
    name: string;
    channels: Channel[];
    members: Member[];
    widget?: unknown;
  };
  role: string;
};

export type VoiceState = { userId: string; name: string; channelId: string; serverId: string; muted: boolean; deafened: boolean; camera: boolean; screenShare: boolean };
type DraggingVoiceUser = { id: string; name: string; x: number; y: number };

type Panel = 'chat' | 'messages' | 'friends' | 'settings' | 'admin' | 'notifications' | 'integrations';
type MenuPosition = { x: number; y: number };

const menuSurfaceStyle = {
  position: 'fixed' as const,
  backgroundColor: '#2f3136',
  border: '1px solid #202225',
  padding: '4px',
  borderRadius: '4px',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '2px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  maxHeight: 'calc(100vh - 16px)',
  overflowY: 'auto' as const,
};

function clampMenuPosition(x: number, y: number, width = 240, height = 320): MenuPosition {
  if (typeof window === 'undefined') return { x, y };
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    x: Math.min(Math.max(x, margin), maxX),
    y: Math.min(Math.max(y, margin), maxY),
  };
}

function groupMembers(members: Member[]) {
  const groups: { [key: string]: Member[] } = { OWNER: [], ADMIN: [], MODERATOR: [], ONLINE: [], OFFLINE: [] };
  members.forEach(m => {
    if (m.role === 'OWNER') groups.OWNER.push(m);
    else if (m.role === 'ADMIN') groups.ADMIN.push(m);
    else if (m.role === 'MODERATOR') groups.MODERATOR.push(m);
    else if (m.user.presenceStatus === 'ONLINE' || m.user.presenceStatus === 'IDLE' || m.user.presenceStatus === 'DO_NOT_DISTURB') groups.ONLINE.push(m);
    else groups.OFFLINE.push(m);
  });
  return groups;
}

function presenceColor(status?: string) {
  if (status === 'ONLINE') return '#4ade80';
  if (status === 'IDLE') return '#fbbf24';
  if (status === 'DO_NOT_DISTURB') return '#f87171';
  return '#9ca3af';
}

function canMoveVoiceUser(actorRole: string, targetRole?: string, isSelf = false) {
  if (isSelf) return true;
  if (!targetRole) return false;
  if (actorRole === 'OWNER') return true;
  if (actorRole === 'ADMIN') return targetRole !== 'OWNER';
  return false;
}

type VoiceUserItemProps = {
  vu: VoiceState;
  isLocalMuted: boolean;
  setVoiceUserMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; voiceUser: VoiceState } | null>>;
  canDrag: boolean;
  onCustomDragStart: (id: string, name: string, x: number, y: number) => void;
};

const VoiceUserItem = React.memo(function VoiceUserItem({ vu, isLocalMuted, setVoiceUserMenu, canDrag, onCustomDragStart }: VoiceUserItemProps) {
  return (
    <div className={`voice-user-item ${canDrag ? 'draggable' : 'not-draggable'}`}
         style={{ touchAction: 'none' }}
         onPointerDown={(e) => {
           if (!canDrag || e.button !== 0) return;
           e.stopPropagation();
           e.preventDefault();
           onCustomDragStart(vu.userId, vu.name, e.clientX, e.clientY);
         }}
         onContextMenu={e => { e.preventDefault(); setVoiceUserMenu({ ...clampMenuPosition(e.clientX, e.clientY, 240, 420), voiceUser: vu }); }}>
      <div className="avatar" style={{ width: 20, height: 20, fontSize: 10 }}>{vu.name.slice(0, 1).toUpperCase()}</div>
      <span style={{ maxWidth: '120px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{vu.name}</span>
      {vu.muted && <MicOff size={14} color="#f87171" />}
      {isLocalMuted && <span style={{ fontSize: '10px', backgroundColor: '#374151', padding: '2px 4px', borderRadius: '4px' }}>Sesi kısık</span>}
    </div>
  );
});

export function AppShell() {
  const [token, setToken] = useState<string | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServer, setActiveServer] = useState<ServerDetail | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [panel, setPanel] = useState<Panel>('chat');
  const [compactMode, setCompactMode] = useState(false);
  const [cinematicMode, setCinematicMode] = useState(false);
  const [fullscreenMode, setFullscreenMode] = useState(false);
  const [channelMenu, setChannelMenu] = useState<{ x: number; y: number; channel: Channel } | null>(null);
  const [memberMenu, setMemberMenu] = useState<{ x: number; y: number; member: Member } | null>(null);
  const [voiceUserMenu, setVoiceUserMenu] = useState<{ x: number; y: number; voiceUser: VoiceState } | null>(null);
  const [draggedChannelId, setDraggedChannelId] = useState<string | null>(null);
  const [draggingUser, setDraggingUser] = useState<DraggingVoiceUser | null>(null);
  const [hoveredChannelId, setHoveredChannelId] = useState<string | null>(null);
  const [voiceStates, setVoiceStates] = useState<VoiceState[]>([]);
  const [globalSocket, setGlobalSocket] = useState<Socket | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email?: string; presenceStatus?: string } | null>(null);
  const [directUser, setDirectUser] = useState<{ id: string; name: string; email?: string; presenceStatus?: string } | null>(null);
  const textChannels = useMemo(() => activeServer?.server.channels.filter((c) => c.type === 'TEXT') ?? [], [activeServer]);
  const voiceChannels = useMemo(() => activeServer?.server.channels.filter((c) => c.type === 'VOICE' && c.name.toLowerCase() !== 'afk') ?? [], [activeServer]);
  const afkChannel = useMemo(() => activeServer?.server.channels.find((c) => c.type === 'VOICE' && c.name.toLowerCase() === 'afk'), [activeServer]);
  const myVoiceState = useMemo(() => {
    if (!currentUser || !activeServer) return null;
    return voiceStates.find((state) => state.userId === currentUser.id && state.serverId === activeServer.server.id) ?? null;
  }, [voiceStates, currentUser?.id, activeServer?.server.id]);
  const myVoiceChannel = useMemo(() => {
    if (!myVoiceState || !activeServer) return null;
    return activeServer.server.channels.find((channel) => channel.id === myVoiceState.channelId) ?? null;
  }, [myVoiceState?.channelId, activeServer]);
  const canManage = activeServer?.server.members.some(m => m.user.id === currentUser?.id && ['OWNER', 'ADMIN', 'MODERATOR'].includes(m.role));
  const currentMember = activeServer?.server.members.find(m => m.user.id === currentUser?.id);
  const currentUserRole = currentMember?.role || 'MEMBER';
  const roleRank: Record<string, number> = { OWNER: 50, ADMIN: 40, MODERATOR: 30, MEMBER: 20, GUEST: 10 };
  const draggingUserRef = React.useRef<DraggingVoiceUser | null>(null);
  const moveVoiceUserRef = React.useRef<(targetChannelId: string, targetUserId: string) => void>(() => undefined);
  draggingUserRef.current = draggingUser;

  React.useEffect(() => {
    if (!draggingUser) return;

    const handlePointerMove = (e: PointerEvent) => {
      setDraggingUser(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const channelEl = el?.closest('[data-channel-id]');
      setHoveredChannelId(channelEl ? channelEl.getAttribute('data-channel-id') : null);
    };

    const handlePointerUp = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const channelEl = el?.closest('[data-channel-id]');
      if (channelEl) {
        const targetChannelId = channelEl.getAttribute('data-channel-id');
        if (targetChannelId && draggingUserRef.current) {
          moveVoiceUserRef.current(targetChannelId, draggingUserRef.current.id);
        }
      }
      setDraggingUser(null);
      setHoveredChannelId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [!!draggingUser]);

  useEffect(() => {
    if (activeServer && globalSocket) {
      globalSocket.emit('server:join', { serverId: activeServer.server.id });
    }
  }, [activeServer?.server.id, globalSocket]);

  useEffect(() => {
    if (!globalSocket) return;
    const rejoinActiveRooms = () => {
      if (activeServer) {
        globalSocket.emit('server:join', { serverId: activeServer.server.id });
      }
      if (myVoiceState) {
        globalSocket.emit('voice:join', { channelId: myVoiceState.channelId });
      }
    };

    globalSocket.on('connect', rejoinActiveRooms);
    if (globalSocket.connected) rejoinActiveRooms();
    return () => {
      globalSocket.off('connect', rejoinActiveRooms);
    };
  }, [activeServer?.server.id, globalSocket, myVoiceState?.channelId]);

  useEffect(() => {
    const handleNavFriends = () => { setActiveServer(null); setPanel('friends'); };
    const handleNavDirect = (event: any) => {
      const user = event.detail?.user;
      if (user?.id) {
        setDirectUser(user);
        setActiveServer(null);
        setPanel('messages');
      }
    };
    window.addEventListener('nav:friends', handleNavFriends);
    window.addEventListener('nav:direct', handleNavDirect);
    return () => {
      window.removeEventListener('nav:friends', handleNavFriends);
      window.removeEventListener('nav:direct', handleNavDirect);
    };
  }, []);

  useEffect(() => {
    const handleClick = () => { setChannelMenu(null); setMemberMenu(null); setVoiceUserMenu(null); };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      window.location.href = '/';
      return;
    }
    setToken(t);
    api<{ user: { id: string; name: string; email?: string; presenceStatus?: string } }>('/auth/me', { token: t }).then(data => setCurrentUser(data.user));
    api<{ servers: Server[] }>('/servers', { token: t }).then((data) => {
      setServers(data.servers);
      if (!activeServer) setPanel('messages');
    });

    const s = io(API_URL, { auth: { token: t } });
    setGlobalSocket(s);

    s.on('presence:update', (data: { userId: string; status: string }) => {
      setActiveServer((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          server: {
            ...prev.server,
            members: prev.server.members.map(m => m.user.id === data.userId ? { ...m, user: { ...m.user, presenceStatus: data.status } } : m)
          }
        };
      });
    });

    s.on('voice:states_sync', ({ states }: { states: VoiceState[] }) => setVoiceStates(states));
    s.on('voice:update', (state: VoiceState) => setVoiceStates(prev => {
      const idx = prev.findIndex(s => s.userId === state.userId);
      if (idx >= 0) { const clone = [...prev]; clone[idx] = state; return clone; }
      return [...prev, state];
    }));
    s.on('voice:remove', ({ userId }: { userId: string }) => setVoiceStates(prev => prev.filter(s => s.userId !== userId)));

    const handleGlobalClick = () => { setChannelMenu(null); setMemberMenu(null); setVoiceUserMenu(null); };
    document.addEventListener('click', handleGlobalClick);

    const onCinematic = (e: any) => {
      setCinematicMode(e.detail.active);
    };
    window.addEventListener('konferans:cinematic-mode', onCinematic);

    const onFullscreen = (e: any) => {
      setFullscreenMode(Boolean(e.detail.active));
    };
    window.addEventListener('konferans:fullscreen-mode', onFullscreen);

    const onLeaveChannel = () => {
      setActiveChannel(null);
      setPanel('chat');
    };
    window.addEventListener('konferans:leave-channel', onLeaveChannel);
    
    s.on('voice:force_move', ({ channelId }: { channelId: string }) => {
      window.dispatchEvent(new CustomEvent('konferans:force-move', { detail: { channelId } }));
    });

    const onVoiceJoin = (e: any) => s.emit('voice:join', { channelId: e.detail.channelId });
    const onVoiceLeave = (e: any) => s.emit('voice:leave', { channelId: e.detail.channelId });
    const onVoiceState = (e: any) => s.emit('voice:state', e.detail);

    window.addEventListener('konferans:voice-join', onVoiceJoin);
    window.addEventListener('konferans:voice-leave', onVoiceLeave);
    window.addEventListener('konferans:voice-state', onVoiceState);

    return () => { 
      document.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('konferans:cinematic-mode', onCinematic);
      window.removeEventListener('konferans:fullscreen-mode', onFullscreen);
      window.removeEventListener('konferans:leave-channel', onLeaveChannel);
      window.removeEventListener('konferans:voice-join', onVoiceJoin);
      window.removeEventListener('konferans:voice-leave', onVoiceLeave);
      window.removeEventListener('konferans:voice-state', onVoiceState);
      s.disconnect(); 
    };
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      const chId = e.detail.channelId;
      const ch = activeServer?.server.channels.find(c => c.id === chId);
      if (ch) {
        setActiveChannel(ch);
        setPanel('chat');
        window.dispatchEvent(new CustomEvent('konferans:voice-join', { detail: { channelId: chId } }));
      }
    };
    window.addEventListener('konferans:force-move', handler);
    return () => window.removeEventListener('konferans:force-move', handler);
  }, [activeServer]);

  useEffect(() => {
    if (!currentUser || !activeServer || !afkChannel) return;
    const myState = voiceStates.find(s => s.userId === currentUser.id && s.serverId === activeServer.server.id);
    if (!myState || myState.channelId === afkChannel.id) return;
    
    if (myState.muted) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('konferans:force-move', { detail: { channelId: afkChannel.id } }));
      }, 15 * 60 * 1000);
      return () => clearTimeout(timer);
    }
  }, [voiceStates, currentUser, activeServer, afkChannel]);

  async function refreshActiveServer() {
    if (!token || !activeServer) return;
    await openServer(token, activeServer.server.id, activeChannel?.id);
  }

  async function openServer(t: string, serverId: string, preferredChannelId?: string) {
    const detail = await api<ServerDetail>(`/servers/${serverId}`, { token: t });
    setActiveServer(detail);
    const preferred = detail.server.channels.find((c) => c.id === preferredChannelId);
    setActiveChannel(preferred ?? detail.server.channels[0] ?? null);
    setPanel('chat');
  }

  async function createServer() {
    if (!token) return;
    const name = prompt('Sunucu adı');
    if (!name) return;
    const data = await api<{ server: Server }>('/servers', { token, method: 'POST', body: JSON.stringify({ name }) });
    setServers((s) => [...s, data.server]);
    openServer(token, data.server.id);
  }

  async function joinInvite() {
    if (!token) return;
    const code = prompt('Davet kodu veya KF-...');
    if (!code) return;
    const data = await api<{ serverId: string }>('/invites/join', { token, method: 'POST', body: JSON.stringify({ code }) });
    const serversData = await api<{ servers: Server[] }>('/servers', { token });
    setServers(serversData.servers);
    openServer(token, data.serverId);
  }

  function logout() {
    clearToken();
    window.location.href = '/';
  }

  async function handleAddFriend(targetUserId: string) {
    if (!token) return;
    try {
      await api('/friends/request', { token, method: 'POST', body: JSON.stringify({ targetUserId }) });
      alert('Arkadaşlık isteği gönderildi.');
    } catch (e: any) {
      alert(e.message || 'İstek gönderilemedi.');
    }
  }

  function openDirectMessage(user: { id: string; name: string; email?: string; presenceStatus?: string }) {
    setDirectUser(user);
    setActiveServer(null);
    setPanel('messages');
    setMemberMenu(null);
    setVoiceUserMenu(null);
  }

  function leaveCurrentVoiceChannel() {
    if (!myVoiceState || !currentUser) return;
    window.dispatchEvent(new CustomEvent('konferans:voice-leave', { detail: { channelId: myVoiceState.channelId } }));
    setVoiceStates((prev) => prev.filter((state) => state.userId !== currentUser.id));
    if (activeChannel?.id === myVoiceState.channelId) {
      setActiveChannel(null);
      setPanel('chat');
    }
  }

  function handleLocalMute(userId: string) {
    const list = JSON.parse(localStorage.getItem('konferans:local-muted') || '[]');
    if (list.includes(userId)) {
      localStorage.setItem('konferans:local-muted', JSON.stringify(list.filter((id: string) => id !== userId)));
    } else {
      localStorage.setItem('konferans:local-muted', JSON.stringify([...list, userId]));
    }
    window.dispatchEvent(new CustomEvent('konferans:local-mute-change'));
  }

  function handleForceMute(userId: string, channelId: string) {
    globalSocket?.emit('voice:force_mute', { targetUserId: userId, channelId });
  }

  async function assignRole(memberId: string, role: string) {
    if (!token || !activeServer) return;
    try {
      await api(`/servers/${activeServer.server.id}/members/${memberId}/role`, { token, method: 'PATCH', body: JSON.stringify({ role }) });
      refreshActiveServer();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function editChannel(channelId: string, oldName: string) {
    if (!token) return;
    const name = prompt('Yeni kanal adı', oldName);
    if (!name || name === oldName) return;
    await api(`/channels/${channelId}`, { token, method: 'PATCH', body: JSON.stringify({ name }) });
    refreshActiveServer();
  }

  async function createChannel(type: 'TEXT' | 'VOICE') {
    if (!token || !activeServer) return;
    const name = prompt(type === 'TEXT' ? 'Metin kanalı adı' : 'Ses/video kanalı adı');
    if (!name) return;
    await api(`/servers/${activeServer.server.id}/channels`, { token, method: 'POST', body: JSON.stringify({ name, type, allowVideo: true, allowScreenShare: true, lowLatencyMode: true }) });
    refreshActiveServer();
  }

  async function deleteChannel(channelId: string, name: string) {
    if (!token || !activeServer) return;
    const channelToDelete = activeServer.server.channels.find(c => c.id === channelId);
    
    const protectedNames = ['genel', 'konferans', 'afk'];
    if (channelToDelete && protectedNames.includes(name.toLowerCase())) {
      alert(`'${name}' isimli varsayılan kanal silinemez.`);
      return;
    }

    if (channelToDelete?.type === 'TEXT') {
      const textChans = activeServer.server.channels.filter(c => c.type === 'TEXT');
      if (textChans.length <= 1) {
        alert("Sunucuda en az 1 metin kanalı bulunmak zorundadır.");
        return;
      }
    }
    if (!confirm(`'${name}' kanalını silmek istediğinize emin misiniz?`)) return;
    await api(`/channels/${channelId}`, { token, method: 'DELETE' });
    refreshActiveServer();
  }

  async function handleDrop(targetChannel: Channel) {
    if (!token || !draggedChannelId || draggedChannelId === targetChannel.id || !activeServer) return;
    const draggedChannel = activeServer.server.channels.find(c => c.id === draggedChannelId);
    if (!draggedChannel || draggedChannel.type !== targetChannel.type) {
      setDraggedChannelId(null);
      return;
    }
    
    const channelsOfType = activeServer.server.channels.filter(c => c.type === targetChannel.type);
    const oldIndex = channelsOfType.findIndex(c => c.id === draggedChannelId);
    const newIndex = channelsOfType.findIndex(c => c.id === targetChannel.id);
    
    const [removed] = channelsOfType.splice(oldIndex, 1);
    channelsOfType.splice(newIndex, 0, removed);
    
    const channelIds = channelsOfType.map(c => c.id);
    await api(`/servers/${activeServer.server.id}/channels/reorder`, { token, method: 'PUT', body: JSON.stringify({ channelIds }) });
    setDraggedChannelId(null);
    refreshActiveServer();
  }

  function canMoveVoiceUserInActiveServer(targetUserId: string) {
    const isSelf = targetUserId === currentUser?.id;
    const targetRole = activeServer?.server.members.find(m => m.user.id === targetUserId)?.role;
    return canMoveVoiceUser(currentUserRole, targetRole, isSelf);
  }

  function handleUserDrop(targetChannelId: string, targetUserId: string) {
    if (!token || !targetUserId || !activeServer) return;
    if (!canMoveVoiceUserInActiveServer(targetUserId)) return;
    if (voiceStates.find(vs => vs.userId === targetUserId)?.channelId === targetChannelId) return;

    if (targetUserId === currentUser?.id) {
      const targetChannel = activeServer.server.channels.find(c => c.id === targetChannelId);
      if (targetChannel) {
        setActiveChannel(targetChannel);
        setPanel('chat');
      }
      window.dispatchEvent(new CustomEvent('konferans:voice-join', { detail: { channelId: targetChannelId } }));
    } else {
      globalSocket?.emit('voice:force_move', { targetUserId, targetChannelId });
    }
  }
  moveVoiceUserRef.current = handleUserDrop;

  const renderMember = (m: Member) => (
    <div key={m.user.id} className="member-row" onContextMenu={(e) => { e.preventDefault(); setMemberMenu({ ...clampMenuPosition(e.clientX, e.clientY, 240, 320), member: m }); }}>
      <div className="avatar" style={{ position: 'relative' }}>
        {m.user.name.slice(0, 1).toUpperCase()}
        <div style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: '50%', backgroundColor: presenceColor(m.user.presenceStatus), border: '2px solid #2f3136', zIndex: 10 }} />
      </div>
      <div>
        <div>{m.user.name}</div>
        <span>{m.role}{m.serverMuted ? ' · muted' : ''}</span>
      </div>
    </div>
  );

  if (!token) return null;
  const isVoicePanel = panel === 'chat' && activeChannel?.type === 'VOICE';

  return (
    <div className={`app ${compactMode ? 'compact-mode' : ''} ${cinematicMode ? 'cinematic-mode' : ''} ${fullscreenMode ? 'fullscreen-mode' : ''}`}>
      <aside className="serverbar">
        <button className={`server-pill ${activeServer === null ? 'active' : ''}`} onClick={() => { setActiveServer(null); setPanel('messages'); }} title="Ana Sayfa" style={{ flexShrink: 0 }}>
          <Home size={22} />
        </button>
        <div style={{ width: '32px', height: '2px', backgroundColor: '#3f4147', margin: '0 auto 8px', borderRadius: '1px', flexShrink: 0 }} />
        
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', alignItems: 'center', scrollbarWidth: 'none' }}>
          {servers.map((server) => (
            <button key={server.id} className={`server-pill ${activeServer?.server.id === server.id ? 'active' : ''}`} onClick={() => openServer(token, server.id)} title={server.name} style={{ flexShrink: 0 }}>
              {server.name.slice(0, 2).toUpperCase()}
            </button>
          ))}
        </div>
        
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', alignItems: 'center', paddingTop: '8px' }}>
          <button className="server-pill" onClick={createServer} title="Sunucu oluştur" style={{ flexShrink: 0 }}><Plus size={22} /></button>
          <button className="server-pill" onClick={joinInvite} title="Davet kodu ile katıl" style={{ flexShrink: 0 }}><UserPlus size={22} /></button>
        </div>
      </aside>

      <aside className="channelbar">
        {activeServer ? (
          <>
            <div className="channel-header">
              <span>{activeServer.server.name}</span>
              <button className="icon-button" title="Kompakt oyun modu" onClick={() => setCompactMode((v) => !v)}><Gamepad2 size={18} /></button>
            </div>
            <div className="channel-section" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Metin kanalları
                {canManage && <button className="icon-button" style={{ width: 28, height: 28, background: 'transparent' }} onClick={() => createChannel('TEXT')}><Plus size={18} /></button>}
              </div>
              {textChannels.map((channel) => (
                <button key={channel.id} 
                  draggable={!!canManage}
                  onDragStart={(e) => { setDraggedChannelId(channel.id); e.dataTransfer.setData('text/plain', channel.id); }}
                  onDragOver={(e) => { e.preventDefault(); if (draggedChannelId && draggedChannelId !== channel.id) e.currentTarget.style.borderTop = '4px solid #4ade80'; }}
                  onDragLeave={(e) => { e.currentTarget.style.borderTop = ''; }}
                  onDrop={(e) => { 
                    e.preventDefault(); 
                    e.currentTarget.style.borderTop = ''; 
                    if (draggedChannelId) handleDrop(channel); 
                  }}
                  onDragEnd={() => setDraggedChannelId(null)}
                  className={`channel ${activeChannel?.id === channel.id && panel === 'chat' ? 'active' : ''} ${draggedChannelId === channel.id ? 'dragging' : ''}`} 
                  onClick={() => { setActiveChannel(channel); setPanel('chat'); }} 
                  onContextMenu={(e) => { if (!canManage) return; e.preventDefault(); setChannelMenu({ ...clampMenuPosition(e.clientX, e.clientY, 200, 120), channel }); }}>
                  <Hash size={16} /> {channel.name}
                </button>
              ))}
              <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Ses / video
                {canManage && <button className="icon-button" style={{ width: 28, height: 28, background: 'transparent' }} onClick={() => createChannel('VOICE')}><Plus size={18} /></button>}
              </div>
              {voiceChannels.map((channel) => {
                const channelUsers = voiceStates.filter(vs => vs.channelId === channel.id);
                return (
                <div 
                  key={channel.id} 
                  data-channel-id={channel.id}
                  style={{ 
                    display: 'flex', flexDirection: 'column',
                    ...(hoveredChannelId === channel.id ? { borderTop: '4px solid #4ade80', backgroundColor: 'rgba(74, 222, 128, 0.2)' } : {})
                  }}
                  onDragOver={(e) => { 
                    e.preventDefault(); 
                    if (draggedChannelId && draggedChannelId !== channel.id) {
                      e.currentTarget.style.borderTop = '4px solid #4ade80'; 
                    } else if (!draggedChannelId && !draggingUser) {
                      e.currentTarget.style.backgroundColor = 'rgba(74, 222, 128, 0.2)';
                    }
                  }}
                  onDragLeave={(e) => { 
                    e.currentTarget.style.borderTop = ''; 
                    e.currentTarget.style.backgroundColor = ''; 
                  }}
                  onDrop={(e) => { 
                    e.preventDefault(); 
                    e.currentTarget.style.borderTop = ''; 
                    e.currentTarget.style.backgroundColor = ''; 
                    const targetUserId = e.dataTransfer.getData('text/plain');
                    if (draggedChannelId) {
                      handleDrop(channel); 
                    } else if (targetUserId) {
                      handleUserDrop(channel.id, targetUserId);
                    }
                  }}
                >
                  <button 
                    draggable={!!canManage}
                    onDragStart={(e) => { 
                      e.dataTransfer.setData('text/plain', channel.id); 
                      setTimeout(() => setDraggedChannelId(channel.id), 0);
                    }}
                    onDragEnd={() => setDraggedChannelId(null)}
                    className={`channel ${activeChannel?.id === channel.id && panel === 'chat' ? 'active' : ''} ${draggedChannelId === channel.id ? 'dragging' : ''}`} 
                    onClick={() => { setActiveChannel(channel); setPanel('chat'); }} 
                    onContextMenu={(e) => { if (!canManage) return; e.preventDefault(); setChannelMenu({ ...clampMenuPosition(e.clientX, e.clientY, 200, 120), channel }); }}>
                    <Mic size={16} /> {channel.name}
                    {channel.requirePushToTalk && <span className="channel-badge">PTT</span>}
                  </button>
                  {channelUsers.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0', marginBottom: '8px' }}>
                      {channelUsers.map(vu => {
                        const isLocalMuted = (JSON.parse(localStorage.getItem('konferans:local-muted') || '[]')).includes(vu.userId);
                        const canDrag = canMoveVoiceUserInActiveServer(vu.userId);
                        return (
                          <VoiceUserItem 
                            key={vu.userId} 
                            vu={vu} 
                            isLocalMuted={isLocalMuted} 
                            setVoiceUserMenu={setVoiceUserMenu} 
                            canDrag={canDrag}
                            onCustomDragStart={(id: string, name: string, x: number, y: number) => {
                              setDraggingUser({ id, name, x, y });
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )})}
            </div>
            
            {afkChannel && (
              <div style={{ borderTop: '1px solid #ffffff10', paddingTop: '12px', paddingBottom: '12px', marginTop: 'auto' }}>
                <div className="section-title" style={{ textAlign: 'center' }}>AFK Kanalı</div>
                <div 
                  data-channel-id={afkChannel.id}
                  style={{ 
                    display: 'flex', flexDirection: 'column',
                    ...(hoveredChannelId === afkChannel.id ? { borderTop: '4px solid #4ade80', backgroundColor: 'rgba(74, 222, 128, 0.2)' } : {})
                  }}
                  onDragOver={(e) => { 
                    e.preventDefault(); 
                    if (draggedChannelId && draggedChannelId !== afkChannel.id) {
                      e.currentTarget.style.borderTop = '4px solid #4ade80';
                    } else if (!draggedChannelId && !draggingUser) {
                      e.currentTarget.style.backgroundColor = 'rgba(74, 222, 128, 0.2)';
                    }
                  }}
                  onDragLeave={(e) => { 
                    e.currentTarget.style.backgroundColor = ''; 
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderTop = 'none';
                    e.currentTarget.style.backgroundColor = 'transparent';
                    const targetUserId = e.dataTransfer.getData('text/plain');
                    if (draggedChannelId && draggedChannelId !== afkChannel.id) {
                      handleDrop(afkChannel);
                    } else if (targetUserId) {
                      handleUserDrop(afkChannel.id, targetUserId);
                    }
                  }}
                >
                  <button 
                    className={`channel ${activeChannel?.id === afkChannel.id && panel === 'chat' ? 'active' : ''}`} 
                    style={{ justifyContent: 'center' }}
                    onClick={() => { setActiveChannel(afkChannel); setPanel('chat'); }} 
                    onContextMenu={(e) => { if (!canManage) return; e.preventDefault(); setChannelMenu({ ...clampMenuPosition(e.clientX, e.clientY, 200, 120), channel: afkChannel }); }}>
                    <Mic size={16} color="#9ca3af" /> <span style={{ color: '#9ca3af' }}>{afkChannel.name}</span>
                  </button>
                  {(() => {
                    const channelUsers = voiceStates.filter(vs => vs.channelId === afkChannel.id);
                    if (channelUsers.length === 0) return null;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0', marginBottom: '8px' }}>
                        {channelUsers.map(vu => {
                          const canDrag = canMoveVoiceUserInActiveServer(vu.userId);
                          return (
                            <VoiceUserItem 
                              key={vu.userId} 
                              vu={vu} 
                              isLocalMuted={false} 
                              setVoiceUserMenu={setVoiceUserMenu} 
                              canDrag={canDrag}
                              onCustomDragStart={(id: string, name: string, x: number, y: number) => {
                                setDraggingUser({ id, name, x, y });
                              }}
                            />
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
            
            {myVoiceState && myVoiceChannel && (
              <div className="voice-connection-card">
                <span>Bağlı</span>
                <strong>{myVoiceChannel.name}</strong>
                <button className="voice-leave-button" onClick={leaveCurrentVoiceChannel}>
                  <PhoneOff size={14} /> Kanaldan ayrıl
                </button>
              </div>
            )}

            {canManage && (
              <div style={{ padding: '12px 14px', backgroundColor: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
                <button className={`channel ${panel === 'admin' ? 'active' : ''}`} onClick={() => setPanel('admin')}><Settings size={16} /> Sunucu Yönetimi</button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="channel-header"><span>Ana Sayfa</span></div>
            <div className="channel-section">
              <button className={`channel ${panel === 'messages' ? 'active' : ''}`} onClick={() => setPanel('messages')}><MessageCircle size={16} /> Mesajlar</button>
              <button className={`channel ${panel === 'friends' ? 'active' : ''}`} onClick={() => setPanel('friends')}><UserPlus size={16} /> Arkadaşlar</button>
              <button className={`channel ${panel === 'notifications' ? 'active' : ''}`} onClick={() => setPanel('notifications')}><Bell size={16} /> Bildirimler</button>
              <button className={`channel ${panel === 'settings' ? 'active' : ''}`} onClick={() => setPanel('settings')}><Settings size={16} /> Uygulama ayarları</button>
              <button className={`channel ${panel === 'integrations' ? 'active' : ''}`} onClick={() => { setActiveServer(null); setPanel('integrations'); }}><Code2 size={16} /> Site entegrasyonu</button>
            </div>
          </>
        )}
      </aside>

      <main className={`main ${isVoicePanel ? 'voice-main' : ''}`}>
        {!isVoicePanel && (
          <div className="topbar">
            <strong>{panel !== 'chat' ? panelTitle(panel) : activeChannel ? `${activeChannel.type === 'TEXT' ? '#' : '🔊'} ${activeChannel.name}` : 'Kanal seç'}</strong>
          </div>
        )}
        <div className="content">
          {panel === 'chat' && activeChannel?.type === 'TEXT' && <ChatPanel token={token} channel={activeChannel} />}
          {panel === 'chat' && activeChannel?.type === 'VOICE' && (
            <div className="voice-layout">
              <div className="voice-room-pane">
                <VoiceRoom token={token} channel={activeChannel} />
              </div>
              {activeChannel.name.toLowerCase() !== 'afk' && (
                <div className="voice-chat-pane">
                  <ChatPanel token={token} channel={activeChannel} />
                </div>
              )}
            </div>
          )}
          {panel === 'messages' && <FriendsPanel token={token} initialTab="messages" initialUser={directUser} onInitialUserConsumed={() => setDirectUser(null)} />}
          {panel === 'friends' && <FriendsPanel token={token} initialTab="friends" initialUser={directUser} onInitialUserConsumed={() => setDirectUser(null)} />}
          {panel === 'settings' && <SettingsPanel token={token} />}
          {panel === 'notifications' && <NotificationsPanel token={token} />}
          {panel === 'admin' && activeServer && <ServerAdminPanel token={token} server={activeServer.server} role={activeServer.role} onChanged={refreshActiveServer} />}
          {panel === 'integrations' && (activeServer ? <IntegrationsPanel token={token} server={activeServer.server} /> : <div className="utility-panel"><div className="panel-title">Site entegrasyonu</div><p className="panel-muted">Lütfen sol üstten bir sunucuya girdikten sonra Sunucu Yönetimi üzerinden bu panele ulaşın veya entegrasyonları ayarlamak istediğiniz sunucuyu seçin.</p></div>)}
        </div>
      </main>

      {activeServer && (
        <aside className="members">
          {(() => {
            const groups = groupMembers(activeServer.server.members);
            return (
              <>
                {groups.OWNER.length > 0 && <><div className="section-title">Kurucu</div>{groups.OWNER.map(renderMember)}</>}
                {groups.ADMIN.length > 0 && <><div className="section-title">Yöneticiler</div>{groups.ADMIN.map(renderMember)}</>}
                {groups.MODERATOR.length > 0 && <><div className="section-title">Moderatörler</div>{groups.MODERATOR.map(renderMember)}</>}
                {groups.ONLINE.length > 0 && <><div className="section-title">Çevrimiçi</div>{groups.ONLINE.map(renderMember)}</>}
                {groups.OFFLINE.length > 0 && <><div className="section-title">Çevrimdışı</div>{groups.OFFLINE.map(renderMember)}</>}
              </>
            );
          })()}
        </aside>
      )}

      {channelMenu && (
        <div style={{ ...menuSurfaceStyle, top: channelMenu.y, left: channelMenu.x }}>
          <button style={{ backgroundColor: 'transparent', color: '#dcddde', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4752c4'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dcddde'; }} onClick={() => editChannel(channelMenu.channel.id, channelMenu.channel.name)}>İsim Değiştir</button>
          <button style={{ backgroundColor: 'transparent', color: '#ed4245', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ed4245'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#ed4245'; }} onClick={() => deleteChannel(channelMenu.channel.id, channelMenu.channel.name)}>Kanalı Sil</button>
        </div>
      )}

      {memberMenu && (
        <div style={{ ...menuSurfaceStyle, top: memberMenu.y, left: memberMenu.x }}>
          <div style={{ padding: '4px 8px', fontSize: '12px', color: '#9ca3af', fontWeight: 'bold' }}>{memberMenu.member.user.name}</div>
          <button style={{ backgroundColor: 'transparent', color: '#dcddde', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4752c4'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dcddde'; }} onClick={() => openDirectMessage(memberMenu.member.user)}>Özel Mesaj Gönder</button>
          <button style={{ backgroundColor: 'transparent', color: '#dcddde', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4752c4'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dcddde'; }} onClick={() => { handleAddFriend(memberMenu.member.user.id); setMemberMenu(null); }}>Arkadaş Ekle</button>
          {canManage && memberMenu.member.role !== 'OWNER' && roleRank[memberMenu.member.role] <= roleRank[currentUserRole] && (
            <>
              <div style={{ padding: '4px 8px', fontSize: '12px', color: '#9ca3af', fontWeight: 'bold', borderTop: '1px solid #3f4147', marginTop: '4px', paddingTop: '8px' }}>Rol Atama</div>
              {roleRank[currentUserRole] >= roleRank['ADMIN'] && (
                <button style={{ backgroundColor: 'transparent', color: '#dcddde', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4752c4'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dcddde'; }} onClick={() => assignRole(memberMenu.member.id, 'ADMIN')}>Yönetici Yap</button>
              )}
              {roleRank[currentUserRole] >= roleRank['MODERATOR'] && (
                <button style={{ backgroundColor: 'transparent', color: '#dcddde', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4752c4'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dcddde'; }} onClick={() => assignRole(memberMenu.member.id, 'MODERATOR')}>Moderatör Yap</button>
              )}
              <button style={{ backgroundColor: 'transparent', color: '#dcddde', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4752c4'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dcddde'; }} onClick={() => assignRole(memberMenu.member.id, 'MEMBER')}>Üye Yap</button>
            </>
          )}
        </div>
      )}

      {voiceUserMenu && (
        <div style={{ ...menuSurfaceStyle, top: voiceUserMenu.y, left: voiceUserMenu.x }}>
          <div style={{ padding: '4px 8px', fontSize: '12px', color: '#9ca3af', fontWeight: 'bold' }}>{voiceUserMenu.voiceUser.name}</div>
          <button style={{ backgroundColor: 'transparent', color: '#dcddde', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4752c4'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dcddde'; }} onClick={() => openDirectMessage({ id: voiceUserMenu.voiceUser.userId, name: voiceUserMenu.voiceUser.name })}>Özel Mesaj Gönder</button>
          <button style={{ backgroundColor: 'transparent', color: '#dcddde', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4752c4'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dcddde'; }} onClick={() => handleAddFriend(voiceUserMenu.voiceUser.userId)}>Arkadaş Ekle</button>
          <button style={{ backgroundColor: 'transparent', color: '#dcddde', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4752c4'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dcddde'; }} onClick={() => handleLocalMute(voiceUserMenu.voiceUser.userId)}>
            { (JSON.parse(localStorage.getItem('konferans:local-muted') || '[]')).includes(voiceUserMenu.voiceUser.userId) ? 'Yerel Sesi Aç' : 'Yerel Sesi Kapat' }
          </button>
          {canManage && (
            <button style={{ backgroundColor: 'transparent', color: '#ed4245', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ed4245'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#ed4245'; }} onClick={() => handleForceMute(voiceUserMenu.voiceUser.userId, voiceUserMenu.voiceUser.channelId)}>
              Mikrofonunu Kapat (Admin)
            </button>
          )}
          {canMoveVoiceUserInActiveServer(voiceUserMenu.voiceUser.userId) && (
            <>
              <div style={{ padding: '4px 8px', fontSize: '12px', color: '#9ca3af', fontWeight: 'bold' }}>Kanal Değiştir</div>
              {activeServer?.server.channels.filter(c => c.type === 'VOICE' && c.id !== voiceUserMenu.voiceUser.channelId).map(c => (
                <button key={`move-${c.id}`} style={{ backgroundColor: 'transparent', color: '#dcddde', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: '2px', fontSize: '14px' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#4752c4'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#dcddde'; }} onClick={() => {
                  handleUserDrop(c.id, voiceUserMenu.voiceUser.userId);
                  setVoiceUserMenu(null);
                }}>
                  {c.name}'e Taşı
                </button>
              ))}
            </>
          )}
        </div>
      )}
      
      {draggingUser && (
        <div style={{
          position: 'fixed',
          left: draggingUser.x + 10,
          top: draggingUser.y + 10,
          pointerEvents: 'none',
          zIndex: 9999,
          background: '#1f2937',
          color: 'white',
          padding: '6px 12px',
          borderRadius: '4px',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          border: '1px solid #4ade80',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
          {draggingUser.name}
        </div>
      )}
    </div>
  );
}

function panelTitle(panel: Panel) {
  if (panel === 'messages') return 'Mesajlar';
  if (panel === 'friends') return 'Arkadaşlar ve özel mesajlar';
  if (panel === 'settings') return 'Oyun / ses ayarları';
  if (panel === 'notifications') return 'Bildirimler';
  if (panel === 'admin') return 'Sunucu yönetimi';
  if (panel === 'integrations') return 'Site entegrasyonu';
  return "Konferans";
}
