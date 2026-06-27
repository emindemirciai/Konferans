import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { CreateDirectMessageSchema, CreateMessageSchema } from '@lets-meet/shared';
import { env } from './env.js';
import { verifyToken } from './auth.js';
import { prisma } from './db.js';

export type VoiceState = { userId: string; name: string; channelId: string; serverId: string; muted: boolean; deafened: boolean; camera: boolean; screenShare: boolean };
const voiceStates = new Map<string, Map<string, VoiceState>>();

async function activeMember(userId: string, serverId: string) {
  return prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId } } }).then((m) => (m?.status === 'ACTIVE' ? m : null));
}

export function attachSocket(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: env.CORS_ORIGIN.split(',').map((x) => x.trim()),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Unauthorized'));
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    await prisma.user.update({ where: { id: user.id }, data: { presenceStatus: 'ONLINE', lastSeenAt: new Date() } }).catch(() => null);
    io.emit('presence:update', { userId: user.id, name: user.name, status: 'ONLINE' });

    socket.on('presence:set', async ({ status }, ack) => {
      try {
        const allowed = ['ONLINE', 'IDLE', 'DO_NOT_DISTURB', 'INVISIBLE'];
        if (!allowed.includes(status)) throw new Error('Invalid status');
        await prisma.user.update({ where: { id: user.id }, data: { presenceStatus: status, lastSeenAt: new Date() } });
        io.emit('presence:update', { userId: user.id, name: user.name, status });
        ack?.({ ok: true });
      } catch (error: any) {
        ack?.({ ok: false, message: error.message });
      }
    });

    socket.on('server:join', async ({ serverId }) => {
      const member = await activeMember(user.id, serverId);
      if (!member) return;
      socket.join(`server:${serverId}`);
      socket.to(`server:${serverId}`).emit('presence:server-join', { userId: user.id, name: user.name, serverId });
      
      // Send current voice states for this server
      const states = Array.from(voiceStates.get(serverId)?.values() || []);
      socket.emit('voice:states_sync', { serverId, states });
    });

    socket.on('channel:join', async ({ channelId }) => {
      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel) return;
      const member = await activeMember(user.id, channel.serverId);
      if (!member) return;
      socket.join(`channel:${channelId}`);
      socket.to(`channel:${channelId}`).emit('presence:join', { userId: user.id, name: user.name, channelId });
    });

    socket.on('typing:start', async ({ channelId }) => {
      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel) return;
      const member = await activeMember(user.id, channel.serverId);
      if (!member) return;
      socket.to(`channel:${channelId}`).emit('typing:start', { userId: user.id, name: user.name, channelId });
    });

    socket.on('typing:stop', async ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit('typing:stop', { userId: user.id, name: user.name, channelId });
    });

    socket.on('voice:join', async ({ channelId }) => {
      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel) return;
      const member = await activeMember(user.id, channel.serverId);
      if (!member) return;
      
      if (!voiceStates.has(channel.serverId)) voiceStates.set(channel.serverId, new Map());
      const state = { userId: user.id, name: user.name, channelId, serverId: channel.serverId, muted: true, deafened: false, camera: false, screenShare: false };
      voiceStates.get(channel.serverId)!.set(user.id, state);
      
      io.to(`server:${channel.serverId}`).emit('voice:update', state);
      
      // Also remember which channel user is in for disconnect cleanup
      socket.data.currentVoiceChannelId = channelId;
      socket.data.currentVoiceServerId = channel.serverId;
    });

    socket.on('voice:leave', async ({ channelId }) => {
      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel) return;
      
      const serverVoiceStates = voiceStates.get(channel.serverId);
      const currentState = serverVoiceStates?.get(user.id);
      if (!currentState || currentState.channelId !== channelId) return;
      serverVoiceStates?.delete(user.id);
      
      io.to(`server:${channel.serverId}`).emit('voice:remove', { userId: user.id, channelId });
      
      if (socket.data.currentVoiceChannelId === channelId) {
        socket.data.currentVoiceChannelId = null;
        socket.data.currentVoiceServerId = null;
      }
    });

    socket.on('voice:state', async ({ channelId, muted, deafened, camera, screenShare }) => {
      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel) return;
      const member = await activeMember(user.id, channel.serverId);
      if (!member) return;
      
      if (!voiceStates.has(channel.serverId)) voiceStates.set(channel.serverId, new Map());
      const state = voiceStates.get(channel.serverId)!.get(user.id) || { userId: user.id, name: user.name, channelId, serverId: channel.serverId, muted, deafened, camera, screenShare };
      state.muted = muted;
      state.deafened = deafened;
      state.camera = camera;
      state.screenShare = screenShare;
      voiceStates.get(channel.serverId)!.set(user.id, state);

      io.to(`server:${channel.serverId}`).emit('voice:update', state);
    });

    socket.on('voice:force_mute', async ({ targetUserId, channelId }) => {
      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel) return;
      const member = await activeMember(user.id, channel.serverId);
      if (!member || !['OWNER', 'ADMIN'].includes(member.role)) return; // Only Admin/Owner can force mute
      
      io.to(`user:${targetUserId}`).emit('voice:force_mute');
    });

    socket.on('voice:force_move', async ({ targetUserId, targetChannelId }) => {
      if (typeof targetUserId !== 'string' || typeof targetChannelId !== 'string') return;
      const channel = await prisma.channel.findUnique({ where: { id: targetChannelId } });
      if (!channel || channel.type !== 'VOICE') return;
      const member = await activeMember(user.id, channel.serverId);
      if (!member) return;
      
      const targetMember = await activeMember(targetUserId, channel.serverId);
      if (!targetMember) return;

      const actorIsOwner = member.role === 'OWNER';
      const actorIsAdmin = member.role === 'ADMIN';
      if (!actorIsOwner && !actorIsAdmin) return;
      if (actorIsAdmin && targetMember.role === 'OWNER') return;
      if (!voiceStates.get(channel.serverId)?.has(targetUserId)) return;
      
      io.to(`user:${targetUserId}`).emit('voice:force_move', { channelId: targetChannelId });
    });


    socket.on('message:create', async (payload, ack) => {
      try {
        const input = CreateMessageSchema.parse(payload);
        const channel = await prisma.channel.findUnique({ where: { id: input.channelId }, include: { permissions: true } });
        if (!channel) throw new Error('Invalid channel');
        const member = await activeMember(user.id, channel.serverId);
        if (!member) throw new Error('Forbidden');
        if (member.serverMuted && (!member.mutedUntil || member.mutedUntil > new Date())) throw new Error('Muted');
        const permission = channel.permissions.find((p) => p.role === member.role);
        if (channel.isLocked && !['OWNER', 'ADMIN', 'MODERATOR'].includes(member.role)) throw new Error('Channel locked');
        if (permission && !permission.canSendMessage) throw new Error('No message permission');
        const message = await prisma.message.create({
          data: { channelId: input.channelId, authorId: user.id, content: input.content, attachments: input.attachments as any },
          include: { author: true },
        });
        io.to(`channel:${input.channelId}`).emit('message:new', { message });
        ack?.({ ok: true, message });
      } catch (error: any) {
        ack?.({ ok: false, message: error.message });
      }
    });

    socket.on('direct:create', async (payload, ack) => {
      try {
        const input = CreateDirectMessageSchema.parse(payload);
        const receiver = await prisma.user.findUnique({ where: { id: input.receiverId } });
        if (!receiver) throw new Error('Kullanıcı bulunamadı.');
        if (receiver.id === user.id) throw new Error('Kendine özel mesaj gönderemezsin.');
        const message = await prisma.directMessage.create({ data: { senderId: user.id, receiverId: input.receiverId, content: input.content }, include: { sender: true, receiver: true } });
        io.to(`user:${input.receiverId}`).emit('direct:new', { message });
        socket.emit('direct:new', { message });
        ack?.({ ok: true, message });
      } catch (error: any) {
        ack?.({ ok: false, message: error.message });
      }
    });

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('channel:')) socket.to(room).emit('presence:leave', { userId: user.id, name: user.name });
      }
    });

    socket.on('disconnect', async () => {
      await prisma.user.update({ where: { id: user.id }, data: { presenceStatus: 'OFFLINE', lastSeenAt: new Date() } }).catch(() => null);
      io.emit('presence:update', { userId: user.id, name: user.name, status: 'OFFLINE' });
      
      const vChanId = socket.data.currentVoiceChannelId;
      const vSrvId = socket.data.currentVoiceServerId;
      if (vChanId && vSrvId && voiceStates.has(vSrvId)) {
        voiceStates.get(vSrvId)!.delete(user.id);
        io.to(`server:${vSrvId}`).emit('voice:remove', { userId: user.id, channelId: vChanId });
      }
    });
  });

  return io;
}
