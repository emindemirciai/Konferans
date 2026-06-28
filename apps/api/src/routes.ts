import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import {
  ChannelPermissionSchema,
  CreateChannelSchema,
  CreateDirectMessageSchema,
  CreateIntegrationSchema,
  CreateMessageSchema,
  CreateServerSchema,
  CreateSsoSessionSchema,
  CreateWebhookSchema,
  FileObjectSchema,
  FriendRequestResponseSchema,
  FriendRequestSchema,
  LiveKitTokenSchema,
  LoginSchema,
  ModerationActionSchema,
  NotificationPreferenceSchema,
  PushSubscriptionSchema,
  ReactionSchema,
  RegisterSchema,
  ServerWidgetSchema,
  UpdateChannelSchema,
  UpdateMemberRoleSchema,
  UpdateMessageSchema,
  UserSettingsSchema,
} from '@konferans/shared';
import { allowPublicRegistration, env, isInviteOnly } from './env.js';
import { prisma } from './db.js';
import { canAdmin, canManage, canModerate, requireAuth, requireServerMember, signToken } from './auth.js';
import { createLiveKitToken, roomNameForVoiceChannel } from './livekit.js';
import { sendVerificationEmail } from './mailer.js';

const router = Router();
const google = new OAuth2Client(env.GOOGLE_CLIENT_ID);

function publicUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    presenceStatus: user.presenceStatus,
    lastSeenAt: user.lastSeenAt,
  };
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'server'}-${nanoid(6)}`;
}

async function validateInvite(code?: string, required = false, consume = false) {
  if (!code) {
    if (required) throw new Error('Davet kodu zorunlu.');
    return null;
  }
  const invite = await prisma.invite.findUnique({ where: { code } });
  if (!invite || !invite.isActive) throw new Error('Davet kodu geçersiz.');
  if (invite.maxUses > 0 && invite.uses >= invite.maxUses) throw new Error('Davet kodu kullanım limiti dolmuş.');
  if (invite.expiresAt && invite.expiresAt < new Date()) throw new Error('Davet kodunun süresi dolmuş.');
  if (consume) await prisma.invite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
  return invite;
}

async function attachInvitedServer(userId: string, serverId?: string | null) {
  if (!serverId) return;
  const ban = await prisma.serverBan.findUnique({ where: { serverId_userId: { serverId, userId } } }).catch(() => null);
  if (ban) throw new Error('Bu sunucuya katılımın engellenmiş.');
  await prisma.serverMember.upsert({
    where: { serverId_userId: { serverId, userId } },
    create: { serverId, userId, role: 'MEMBER', status: 'ACTIVE' },
    update: { status: 'ACTIVE' },
  });
}

async function autoCreateUserServer(userId: string, userName: string) {
  const server = await prisma.server.create({
    data: {
      name: `${userName} Sunucusu`,
      slug: slugify(userName),
      ownerId: userId,
      members: { create: { userId, role: 'OWNER' } },
      channels: {
        create: [
          { name: 'Genel', type: 'TEXT', position: 1 },
          { name: "Konferans", type: 'VOICE', position: 2, bitrate: 64000, allowVideo: true, allowScreenShare: true, lowLatencyMode: true },
          { name: 'AFK', type: 'VOICE', position: 3, bitrate: 64000, allowVideo: false, allowScreenShare: false, lowLatencyMode: true },
        ],
      },
    },
  });
  return server;
}

async function logAudit(serverId: string, actorId: string | undefined, event: any, targetId?: string, metadata?: unknown) {
  await prisma.auditLog.create({ data: { serverId, actorId, event, targetId, metadata: metadata as any } }).catch(() => null);
}

async function canUseChannel(userId: string, channelId: string, capability: 'view' | 'send' | 'joinVoice' | 'publishVideo' | 'shareScreen') {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error('Kanal bulunamadı.');
  const member = await requireServerMember(userId, channel.serverId);
  if (member.role === 'OWNER') return { channel, member, allowed: true };
  if (channel.isLocked && !canManage(member.role)) return { channel, member, allowed: false };

  const permission = await prisma.channelPermission.findUnique({ where: { channelId_role: { channelId, role: member.role } } });
  if (!permission) return { channel, member, allowed: true };

  const allowed =
    capability === 'view' ? permission.canView :
    capability === 'send' ? permission.canSendMessage :
    capability === 'joinVoice' ? permission.canJoinVoice :
    capability === 'publishVideo' ? permission.canPublishVideo :
    permission.canShareScreen;
  return { channel, member, allowed };
}

router.get('/health', (_req, res) => {
  res.json({ ok: true, name: "Konferans API", version: '0.4.0', time: new Date().toISOString() });
});

router.post('/auth/register', async (req, res) => {
  try {
    const input = RegisterSchema.parse(req.body);
    const inviteRequired = isInviteOnly && !allowPublicRegistration;
    const invite = await validateInvite(input.inviteCode, inviteRequired, true);
    const exists = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (exists) return res.status(409).json({ message: 'Bu e-posta zaten kayıtlı.' });

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
        provider: 'EMAIL',
        settings: { create: {} },
      },
    });

    await attachInvitedServer(user.id, invite?.serverId);
    if (!invite?.serverId) await autoCreateUserServer(user.id, user.name);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await prisma.verificationCode.create({ data: { userId: user.id, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
    await sendVerificationEmail(user.email, code);

    res.status(201).json({ message: 'Kayıt oluşturuldu. E-posta doğrulama kodunu gir.', user: publicUser(user) });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Kayıt başarısız.' });
  }
});

router.post('/auth/verify-email', async (req, res) => {
  const schema = z.object({ email: z.string().email(), code: z.string().min(6).max(6) });
  try {
    const { email, code } = schema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    const verification = await prisma.verificationCode.findFirst({ where: { userId: user.id, code, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!verification) return res.status(400).json({ message: 'Kod geçersiz veya süresi doldu.' });
    await prisma.$transaction([
      prisma.verificationCode.update({ where: { id: verification.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
    ]);
    res.json({ message: 'E-posta doğrulandı.' });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Doğrulama başarısız.' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const input = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !user.passwordHash) return res.status(401).json({ message: 'E-posta veya şifre hatalı.' });
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'E-posta veya şifre hatalı.' });
    if (!user.emailVerified) return res.status(403).json({ message: 'E-posta doğrulaması gerekli.' });

    await prisma.user.update({ where: { id: user.id }, data: { presenceStatus: 'ONLINE', lastSeenAt: new Date() } });
    const token = signToken({ id: user.id, email: user.email, name: user.name, globalRole: user.globalRole });
    res.json({ token, user: publicUser(user) });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Giriş başarısız.' });
  }
});

router.post('/auth/google', async (req, res) => {
  try {
    const schema = z.object({ credential: z.string(), inviteCode: z.string().optional() });
    const { credential, inviteCode } = schema.parse(req.body);
    if (!env.GOOGLE_CLIENT_ID) throw new Error('Google Client ID yapılandırılmamış.');

    const ticket = await google.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) throw new Error('Google hesabı doğrulanamadı.');

    const existingUser = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });
    const inviteRequired = !existingUser && isInviteOnly && !allowPublicRegistration;
    const invite = await validateInvite(inviteCode, inviteRequired, !existingUser);

    const user = await prisma.user.upsert({
      where: { email: payload.email.toLowerCase() },
      create: {
        email: payload.email.toLowerCase(),
        name: payload.name || payload.email.split('@')[0],
        avatarUrl: payload.picture,
        googleSub: payload.sub,
        provider: 'GOOGLE',
        emailVerified: true,
        presenceStatus: 'ONLINE',
        lastSeenAt: new Date(),
        settings: { create: {} },
      },
      update: { googleSub: payload.sub, avatarUrl: payload.picture, emailVerified: true, presenceStatus: 'ONLINE', lastSeenAt: new Date() },
    });

    await attachInvitedServer(user.id, invite?.serverId);
    if (!existingUser && !invite?.serverId) await autoCreateUserServer(user.id, user.name);

    const token = signToken({ id: user.id, email: user.email, name: user.name, globalRole: user.globalRole });
    res.json({ token, user: publicUser(user) });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Google girişi başarısız.' });
  }
});

router.get('/auth/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { settings: true } });
  res.json({ user: publicUser(user), settings: user?.settings });
});

router.put('/presence', requireAuth, async (req, res) => {
  const schema = z.object({ status: z.enum(['ONLINE', 'IDLE', 'DO_NOT_DISTURB', 'INVISIBLE']) });
  try {
    const { status } = schema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.user!.id }, data: { presenceStatus: status, lastSeenAt: new Date() } });
    res.json({ user: publicUser(user) });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Durum güncellenemedi.' });
  }
});

router.get('/servers', requireAuth, async (req, res) => {
  const memberships = await prisma.serverMember.findMany({
    where: { userId: req.user!.id, status: 'ACTIVE' },
    include: { server: true },
    orderBy: { joinedAt: 'asc' },
  });
  res.json({ servers: memberships.map((m) => ({ ...m.server, role: m.role })) });
});

router.post('/servers', requireAuth, async (req, res) => {
  try {
    const input = CreateServerSchema.parse(req.body);
    const server = await prisma.server.create({
      data: {
        name: input.name,
        slug: slugify(input.name),
        ownerId: req.user!.id,
        isPublic: input.isPublic ?? false,
        description: input.description,
        members: { create: { userId: req.user!.id, role: 'OWNER' } },
        channels: {
          create: [
            { name: 'Genel', type: 'TEXT', position: 1, category: 'Genel' },
            { name: "Konferans", type: 'VOICE', position: 2, category: 'Ses', bitrate: 64000, allowVideo: true, allowScreenShare: true, lowLatencyMode: true },
            { name: 'AFK', type: 'VOICE', position: 3, category: 'Ses', bitrate: 64000, allowVideo: false, allowScreenShare: false, lowLatencyMode: true },
          ],
        },
        widget: { create: { enabled: false, theme: 'gaming' } },
      },
      include: { channels: true },
    });
    await logAudit(server.id, req.user!.id, 'SERVER_CREATED', server.id, { name: server.name });
    res.status(201).json({ server });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Sunucu oluşturulamadı.' });
  }
});

router.get('/servers/:serverId', requireAuth, async (req, res) => {
  try {
    const member = await requireServerMember(req.user!.id, (req.params.serverId as string));
    const server = await prisma.server.findUnique({
      where: { id: (req.params.serverId as string) },
      include: {
        channels: { orderBy: { position: 'asc' }, include: { permissions: true } },
        members: { where: { status: 'ACTIVE' }, include: { user: true }, orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }] },
        widget: true,
      },
    });
    res.json({ server, role: member.role });
  } catch {
    res.status(403).json({ message: 'Bu sunucuya erişimin yok.' });
  }
});

router.patch('/servers/:serverId', requireAuth, async (req, res) => {
  try {
    const member = await requireServerMember(req.user!.id, (req.params.serverId as string));
    if (!canAdmin(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const schema = z.object({ name: z.string().min(2).max(60).optional(), isPublic: z.boolean().optional(), description: z.string().max(300).optional() });
    const input = schema.parse(req.body);
    const server = await prisma.server.update({ where: { id: (req.params.serverId as string) }, data: input });
    await logAudit(server.id, req.user!.id, 'SERVER_UPDATED', server.id, input);
    res.json({ server });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Sunucu güncellenemedi.' });
  }
});

router.delete('/servers/:serverId', requireAuth, async (req, res) => {
  try {
    const member = await requireServerMember(req.user!.id, (req.params.serverId as string));
    if (!canAdmin(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    await prisma.server.delete({ where: { id: (req.params.serverId as string) } });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Sunucu silinemedi.' });
  }
});

router.post('/servers/:serverId/channels', requireAuth, async (req, res) => {
  try {
    const member = await requireServerMember(req.user!.id, (req.params.serverId as string));
    if (!canManage(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const input = CreateChannelSchema.parse({ ...req.body, serverId: (req.params.serverId as string) });
    const count = await prisma.channel.count({ where: { serverId: (req.params.serverId as string) } });
    const channel = await prisma.channel.create({ data: { ...input, position: count + 1 } });
    await logAudit((req.params.serverId as string), req.user!.id, 'CHANNEL_CREATED', channel.id, { name: channel.name, type: channel.type });
    res.status(201).json({ channel });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Kanal oluşturulamadı.' });
  }
});

router.put('/servers/:serverId/channels/reorder', requireAuth, async (req, res) => {
  try {
    const member = await requireServerMember(req.user!.id, (req.params.serverId as string));
    if (!canManage(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const schema = z.object({ channelIds: z.array(z.string().cuid()) });
    const { channelIds } = schema.parse(req.body);
    
    const serverChannels = await prisma.channel.findMany({ where: { serverId: (req.params.serverId as string) } });
    const serverChannelIds = new Set(serverChannels.map(c => c.id));
    
    const updates = channelIds
      .filter(id => serverChannelIds.has(id))
      .map((id, index) => prisma.channel.update({ where: { id }, data: { position: index + 1 } }));
      
    await prisma.$transaction(updates);
    
    await logAudit((req.params.serverId as string), req.user!.id, 'CHANNEL_UPDATED', undefined, { action: 'reorder' });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Kanallar sıralanamadı.' });
  }
});

router.patch('/channels/:channelId', requireAuth, async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: (req.params.channelId as string) } });
    if (!channel) return res.status(404).json({ message: 'Kanal bulunamadı.' });
    const member = await requireServerMember(req.user!.id, channel.serverId);
    if (!canManage(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const input = UpdateChannelSchema.parse(req.body);
    const updated = await prisma.channel.update({ where: { id: channel.id }, data: input });
    await logAudit(channel.serverId, req.user!.id, 'CHANNEL_UPDATED', channel.id, input);
    res.json({ channel: updated });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Kanal güncellenemedi.' });
  }
});

router.put('/channels/:channelId/permissions', requireAuth, async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: (req.params.channelId as string) } });
    if (!channel) return res.status(404).json({ message: 'Kanal bulunamadı.' });
    const member = await requireServerMember(req.user!.id, channel.serverId);
    if (!canAdmin(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const input = ChannelPermissionSchema.parse(req.body);
    const permission = await prisma.channelPermission.upsert({
      where: { channelId_role: { channelId: channel.id, role: input.role } },
      create: { serverId: channel.serverId, channelId: channel.id, ...input },
      update: input,
    });
    await logAudit(channel.serverId, req.user!.id, 'CHANNEL_UPDATED', channel.id, { permission });
    res.json({ permission });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Kanal izni güncellenemedi.' });
  }
});

router.post('/servers/:serverId/invites', requireAuth, async (req, res) => {
  try {
    const member = await requireServerMember(req.user!.id, (req.params.serverId as string));
    if (!canManage(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const schema = z.object({ maxUses: z.coerce.number().int().min(1).max(1000).default(25), expiresInHours: z.coerce.number().int().min(1).max(720).optional() });
    const input = schema.parse(req.body ?? {});
    const invite = await prisma.invite.create({
      data: {
        code: `KF-${nanoid(10)}`,
        scope: 'SERVER',
        serverId: (req.params.serverId as string),
        createdById: req.user!.id,
        maxUses: input.maxUses,
        expiresAt: input.expiresInHours ? new Date(Date.now() + input.expiresInHours * 3600000) : undefined,
      },
    });
    await logAudit((req.params.serverId as string), req.user!.id, 'INVITE_CREATED', invite.id, { code: invite.code, maxUses: invite.maxUses });
    res.status(201).json({ invite, url: `${env.PUBLIC_WEB_URL}/invite/${invite.code}` });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Davet oluşturulamadı.' });
  }
});

router.post('/invites/join', requireAuth, async (req, res) => {
  try {
    const schema = z.object({ code: z.string().min(4) });
    const { code } = schema.parse(req.body);
    const invite = await validateInvite(code, true, true);
    if (!invite?.serverId) return res.status(400).json({ message: 'Bu davet bir sunucuya bağlı değil.' });
    await attachInvitedServer(req.user!.id, invite.serverId);
    res.json({ message: 'Sunucuya katıldın.', serverId: invite.serverId });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Davet kullanılamadı.' });
  }
});

router.get('/servers/:serverId/members', requireAuth, async (req, res) => {
  try {
    await requireServerMember(req.user!.id, (req.params.serverId as string));
    const members = await prisma.serverMember.findMany({ where: { serverId: (req.params.serverId as string), status: 'ACTIVE' }, include: { user: true }, orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }] });
    res.json({ members });
  } catch {
    res.status(403).json({ message: 'Üyelere erişimin yok.' });
  }
});

router.patch('/servers/:serverId/members/:memberId/role', requireAuth, async (req, res) => {
  try {
    const actor = await requireServerMember(req.user!.id, (req.params.serverId as string));
    if (!canManage(actor.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const target = await prisma.serverMember.findUnique({ where: { id: (req.params.memberId as string) } });
    if (!target || target.serverId !== (req.params.serverId as string)) return res.status(404).json({ message: 'Üye bulunamadı.' });
    if (target.role === 'OWNER') return res.status(403).json({ message: 'Owner rolü değiştirilemez.' });
    const input = UpdateMemberRoleSchema.parse(req.body);
    
    const rankMap: Record<string, number> = { OWNER: 50, ADMIN: 40, MODERATOR: 30, MEMBER: 20, GUEST: 10 };
    if (rankMap[target.role] > rankMap[actor.role]) return res.status(403).json({ message: 'Kendinizden üst rütbeli birinin rolünü değiştiremezsiniz.' });
    if (rankMap[input.role] > rankMap[actor.role]) return res.status(403).json({ message: 'Kendi rütbenizden daha yüksek bir rol atayamazsınız.' });

    const member = await prisma.serverMember.update({ where: { id: target.id }, data: { role: input.role } });
    await logAudit((req.params.serverId as string), req.user!.id, 'MEMBER_ROLE_UPDATED', target.userId, { from: target.role, to: input.role });
    res.json({ member });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Rol güncellenemedi.' });
  }
});

router.post('/servers/:serverId/members/:memberId/moderation', requireAuth, async (req, res) => {
  try {
    const actor = await requireServerMember(req.user!.id, (req.params.serverId as string));
    const target = await prisma.serverMember.findUnique({ where: { id: (req.params.memberId as string) }, include: { user: true } });
    if (!target || target.serverId !== (req.params.serverId as string)) return res.status(404).json({ message: 'Üye bulunamadı.' });
    if (!canModerate(actor.role, target.role)) return res.status(403).json({ message: 'Bu üyeyi yönetme yetkin yok.' });
    const input = ModerationActionSchema.parse(req.body);
    const expiresAt = input.durationMinutes ? new Date(Date.now() + input.durationMinutes * 60000) : undefined;

    const update: any = {};
    if (input.type === 'MUTE') Object.assign(update, { serverMuted: true, mutedUntil: expiresAt });
    if (input.type === 'UNMUTE') Object.assign(update, { serverMuted: false, mutedUntil: null });
    if (input.type === 'DEAFEN') Object.assign(update, { serverDeafened: true });
    if (input.type === 'UNDEAFEN') Object.assign(update, { serverDeafened: false });
    if (input.type === 'KICK') Object.assign(update, { status: 'KICKED' });
    if (input.type === 'BAN') {
      Object.assign(update, { status: 'BANNED' });
      await prisma.serverBan.upsert({
        where: { serverId_userId: { serverId: (req.params.serverId as string), userId: target.userId } },
        create: { serverId: (req.params.serverId as string), userId: target.userId, createdById: req.user!.id, reason: input.reason, expiresAt },
        update: { reason: input.reason, expiresAt },
      });
    }
    if (input.type === 'UNBAN') {
      Object.assign(update, { status: 'ACTIVE' });
      await prisma.serverBan.deleteMany({ where: { serverId: (req.params.serverId as string), userId: target.userId } });
    }

    const [member, action] = await prisma.$transaction([
      prisma.serverMember.update({ where: { id: target.id }, data: update }),
      prisma.moderationAction.create({ data: { serverId: (req.params.serverId as string), actorId: req.user!.id, targetUserId: target.userId, type: input.type, reason: input.reason, durationMinutes: input.durationMinutes, expiresAt } }),
    ]);
    await logAudit((req.params.serverId as string), req.user!.id, 'MEMBER_MODERATED', target.userId, input);
    res.json({ member, action });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Moderasyon işlemi başarısız.' });
  }
});

router.get('/servers/:serverId/audit-logs', requireAuth, async (req, res) => {
  try {
    const member = await requireServerMember(req.user!.id, (req.params.serverId as string));
    if (!canManage(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const logs = await prisma.auditLog.findMany({ where: { serverId: (req.params.serverId as string) }, include: { actor: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ logs });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Loglar alınamadı.' });
  }
});

router.get('/servers/:serverId/widget', requireAuth, async (req, res) => {
  try {
    await requireServerMember(req.user!.id, (req.params.serverId as string));
    const widget = await prisma.serverWidget.upsert({ where: { serverId: (req.params.serverId as string) }, create: { serverId: (req.params.serverId as string) }, update: {} });
    res.json({ widget, embedUrl: `${env.PUBLIC_WEB_URL}/embed/${(req.params.serverId as string)}` });
  } catch {
    res.status(403).json({ message: 'Widget ayarlarına erişimin yok.' });
  }
});

router.put('/servers/:serverId/widget', requireAuth, async (req, res) => {
  try {
    const member = await requireServerMember(req.user!.id, (req.params.serverId as string));
    if (!canAdmin(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const input = ServerWidgetSchema.parse(req.body);
    const widget = await prisma.serverWidget.upsert({ where: { serverId: (req.params.serverId as string) }, create: { serverId: (req.params.serverId as string), ...input }, update: input });
    await logAudit((req.params.serverId as string), req.user!.id, 'WIDGET_UPDATED', widget.id, input);
    res.json({ widget, embedUrl: `${env.PUBLIC_WEB_URL}/embed/${(req.params.serverId as string)}` });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Widget güncellenemedi.' });
  }
});

router.get('/channels/:channelId/messages', requireAuth, async (req, res) => {
  try {
    const { channel, allowed } = await canUseChannel(req.user!.id, (req.params.channelId as string), 'view');
    if (!allowed) return res.status(403).json({ message: 'Bu kanalı görüntüleme yetkin yok.' });
    const messages = await prisma.message.findMany({
      where: { channelId: channel.id, deletedAt: null },
      include: { author: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    res.json({ messages });
  } catch (error: any) {
    res.status(403).json({ message: error.message || 'Bu kanala erişimin yok.' });
  }
});

router.post('/messages', requireAuth, async (req, res) => {
  try {
    const input = CreateMessageSchema.parse(req.body);
    const { channel, member, allowed } = await canUseChannel(req.user!.id, input.channelId, 'send');
    if (!allowed) return res.status(403).json({ message: 'Bu kanala mesaj gönderme yetkin yok.' });
    if (member.serverMuted && (!member.mutedUntil || member.mutedUntil > new Date())) return res.status(403).json({ message: 'Sunucuda susturuldun.' });
    const message = await prisma.message.create({ data: { channelId: input.channelId, authorId: req.user!.id, content: input.content, attachments: input.attachments as any }, include: { author: true } });
    res.status(201).json({ message });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Mesaj gönderilemedi.' });
  }
});

router.post('/livekit/token', requireAuth, async (req, res) => {
  try {
    const input = LiveKitTokenSchema.parse(req.body);
    const { channel, member, allowed } = await canUseChannel(req.user!.id, input.channelId, 'joinVoice');
    if (!allowed || channel.type !== 'VOICE') return res.status(403).json({ message: 'Bu ses kanalına girme yetkin yok.' });
    if (member.serverMuted && member.mutedUntil && member.mutedUntil <= new Date()) {
      await prisma.serverMember.update({ where: { id: member.id }, data: { serverMuted: false, mutedUntil: null } });
      member.serverMuted = false;
    }
    const publishPermission = await canUseChannel(req.user!.id, input.channelId, 'publishVideo');
    const screenPermission = await canUseChannel(req.user!.id, input.channelId, 'shareScreen');
    const roomName = roomNameForVoiceChannel(channel.serverId, channel.id);
    
    const isAfkChannel = channel.name.toLowerCase() === 'afk';
    const finalServerMuted = isAfkChannel ? true : member.serverMuted;
    const finalServerDeafened = isAfkChannel ? true : member.serverDeafened;
    const finalAllowVideo = isAfkChannel ? false : (channel.allowVideo && publishPermission.allowed);
    const finalAllowScreenShare = isAfkChannel ? false : (channel.allowScreenShare && screenPermission.allowed);

    const token = await createLiveKitToken({
      roomName,
      identity: req.user!.id,
      name: req.user!.name,
      metadata: {
        serverId: channel.serverId,
        channelId: channel.id,
        role: member.role,
        serverMuted: finalServerMuted,
        serverDeafened: finalServerDeafened,
        allowVideo: finalAllowVideo,
        allowScreenShare: finalAllowScreenShare,
        requirePushToTalk: channel.requirePushToTalk,
        lowLatencyMode: channel.lowLatencyMode,
      },
    });
    await prisma.serverMember.update({ where: { id: member.id }, data: { lastVoiceChannelId: channel.id } });
    res.json({
      token,
      roomName,
      wsUrl: env.LIVEKIT_PUBLIC_WS_URL,
      policy: {
        serverMuted: finalServerMuted,
        serverDeafened: finalServerDeafened,
        allowVideo: finalAllowVideo,
        allowScreenShare: finalAllowScreenShare,
        requirePushToTalk: channel.requirePushToTalk,
        lowLatencyMode: channel.lowLatencyMode,
      },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'LiveKit token oluşturulamadı.' });
  }
});

router.get('/settings', requireAuth, async (req, res) => {
  const settings = await prisma.userSettings.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id }, update: {} });
  res.json({ settings });
});

router.put('/settings', requireAuth, async (req, res) => {
  try {
    const input = UserSettingsSchema.partial().parse(req.body);
    const settings = await prisma.userSettings.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, ...input }, update: input });
    res.json({ settings });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Ayar kaydedilemedi.' });
  }
});

router.get('/friends', requireAuth, async (req, res) => {
  const requests = await prisma.friendRequest.findMany({
    where: { OR: [{ senderId: req.user!.id }, { receiverId: req.user!.id }] },
    include: { sender: true, receiver: true },
    orderBy: { updatedAt: 'desc' },
  });
  const friends = requests
    .filter((r) => r.status === 'ACCEPTED')
    .map((r) => publicUser(r.senderId === req.user!.id ? r.receiver : r.sender));
  res.json({ friends, requests });
});

router.post('/friends/request', requireAuth, async (req, res) => {
  try {
    const input = FriendRequestSchema.parse(req.body);
    const receiver = input.targetUserId
      ? await prisma.user.findUnique({ where: { id: input.targetUserId } })
      : await prisma.user.findUnique({ where: { email: input.email!.toLowerCase() } });
    if (!receiver) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    if (receiver.id === req.user!.id) return res.status(400).json({ message: 'Kendine arkadaşlık isteği gönderemezsin.' });
    const request = await prisma.friendRequest.upsert({
      where: { senderId_receiverId: { senderId: req.user!.id, receiverId: receiver.id } },
      create: { senderId: req.user!.id, receiverId: receiver.id },
      update: { status: 'PENDING' },
      include: { sender: true, receiver: true },
    });
    res.status(201).json({ request });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Arkadaşlık isteği gönderilemedi.' });
  }
});

router.get('/direct/conversations', requireAuth, async (req, res) => {
  const recentMessages = await prisma.directMessage.findMany({
    where: {
      OR: [{ senderId: req.user!.id }, { receiverId: req.user!.id }],
      deletedAt: null,
    },
    include: { sender: true, receiver: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const byUserId = new Map<string, { user: ReturnType<typeof publicUser>; lastMessage: any }>();
  for (const message of recentMessages) {
    const otherUser = message.senderId === req.user!.id ? message.receiver : message.sender;
    if (!byUserId.has(otherUser.id)) {
      byUserId.set(otherUser.id, { user: publicUser(otherUser), lastMessage: message });
    }
  }

  const conversations = Array.from(byUserId.values());
  conversations.sort((a, b) => {
    const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  res.json({ conversations });
});

router.patch('/friends/requests/:requestId', requireAuth, async (req, res) => {
  try {
    const input = FriendRequestResponseSchema.parse(req.body);
    const request = await prisma.friendRequest.findUnique({ where: { id: (req.params.requestId as string) } });
    if (!request || request.receiverId !== req.user!.id) return res.status(404).json({ message: 'İstek bulunamadı.' });
    const status = input.action === 'ACCEPT' ? 'ACCEPTED' : input.action === 'DECLINE' ? 'DECLINED' : 'BLOCKED';
    const updated = await prisma.friendRequest.update({ where: { id: request.id }, data: { status }, include: { sender: true, receiver: true } });
    res.json({ request: updated });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Arkadaşlık isteği yanıtlanamadı.' });
  }
});

router.get('/direct/:userId/messages', requireAuth, async (req, res) => {
  const targetUserId = req.params.userId as string;
  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [
        { senderId: req.user!.id, receiverId: targetUserId },
        { senderId: targetUserId, receiverId: req.user!.id },
      ],
      deletedAt: null,
    },
    include: { sender: true, receiver: true },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  res.json({ messages });
});

router.post('/direct/:userId/messages', requireAuth, async (req, res) => {
  try {
    const targetUserId = req.params.userId as string;
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    if (targetUserId === req.user!.id) return res.status(400).json({ message: 'Kendine özel mesaj gönderemezsin.' });
    const input = CreateDirectMessageSchema.parse({ ...req.body, receiverId: targetUserId });
    const message = await prisma.directMessage.create({ data: { senderId: req.user!.id, receiverId: input.receiverId, content: input.content }, include: { sender: true, receiver: true } });
    res.status(201).json({ message });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Özel mesaj gönderilemedi.' });
  }
});


router.get('/config', (_req, res) => {
  res.json({
    name: "Konferans",
    version: '0.4.0',
    inviteOnly: isInviteOnly,
    allowPublicRegistration,
    googleEnabled: Boolean(env.GOOGLE_CLIENT_ID),
    livekitWsUrl: env.LIVEKIT_PUBLIC_WS_URL,
    webUrl: env.PUBLIC_WEB_URL,
  });
});

async function createNotification(input: {
  userId: string;
  actorId?: string;
  serverId?: string;
  channelId?: string;
  type: 'FRIEND_REQUEST' | 'FRIEND_ACCEPTED' | 'DIRECT_MESSAGE' | 'MENTION' | 'SERVER_INVITE' | 'MODERATION' | 'SYSTEM';
  title: string;
  body?: string;
  metadata?: unknown;
}) {
  const preference = await prisma.notificationPreference.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId },
    update: {},
  });
  if (!preference.pushEnabled && input.type !== 'SYSTEM') {
    return null;
  }
  return prisma.notification.create({ data: { ...input, metadata: input.metadata as any } }).catch(() => null);
}

router.get('/notifications', requireAuth, async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    include: { actor: true },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  const unread = notifications.filter((n) => !n.readAt).length;
  res.json({ notifications, unread });
});

router.post('/notifications/read-all', requireAuth, async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

router.patch('/notifications/:notificationId/read', requireAuth, async (req, res) => {
  const notification = await prisma.notification.updateMany({ where: { id: (req.params.notificationId as string), userId: req.user!.id }, data: { readAt: new Date() } });
  res.json({ ok: notification.count > 0 });
});

router.get('/notification-preferences', requireAuth, async (req, res) => {
  const preferences = await prisma.notificationPreference.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id }, update: {} });
  res.json({ preferences });
});

router.put('/notification-preferences', requireAuth, async (req, res) => {
  try {
    const input = NotificationPreferenceSchema.parse(req.body);
    const preferences = await prisma.notificationPreference.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, ...input }, update: input });
    res.json({ preferences });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Bildirim ayarları kaydedilemedi.' });
  }
});

router.post('/push-subscriptions', requireAuth, async (req, res) => {
  try {
    const input = PushSubscriptionSchema.parse(req.body);
    const subscription = await prisma.pushSubscription.create({
      data: {
        userId: req.user!.id,
        provider: input.provider,
        endpoint: input.endpoint,
        token: input.token,
        keys: input.keys as any,
        platform: input.platform,
        deviceName: input.deviceName,
      },
    });
    res.status(201).json({ subscription });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Push aboneliği kaydedilemedi.' });
  }
});

router.delete('/push-subscriptions/:subscriptionId', requireAuth, async (req, res) => {
  await prisma.pushSubscription.updateMany({ where: { id: (req.params.subscriptionId as string), userId: req.user!.id }, data: { isActive: false } });
  res.json({ ok: true });
});

router.post('/files', requireAuth, async (req, res) => {
  try {
    const input = FileObjectSchema.parse(req.body);
    if (input.channelId) {
      const { channel, allowed } = await canUseChannel(req.user!.id, input.channelId, 'send');
      if (!allowed || channel.type !== 'TEXT') return res.status(403).json({ message: 'Bu kanala dosya ekleme yetkin yok.' });
    }
    if (input.serverId) await requireServerMember(req.user!.id, input.serverId);
    const file = await prisma.fileObject.create({ data: { ...input, uploaderId: req.user!.id, metadata: input.metadata as any } });
    if (file.serverId) await logAudit(file.serverId, req.user!.id, 'FILE_ATTACHED', file.id, { name: file.name, sizeBytes: file.sizeBytes });
    res.status(201).json({ file });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Dosya kaydedilemedi.' });
  }
});

router.patch('/messages/:messageId', requireAuth, async (req, res) => {
  try {
    const input = UpdateMessageSchema.parse(req.body);
    const current = await prisma.message.findUnique({ where: { id: (req.params.messageId as string) }, include: { channel: true } });
    if (!current || current.deletedAt) return res.status(404).json({ message: 'Mesaj bulunamadı.' });
    const member = await requireServerMember(req.user!.id, current.channel.serverId);
    if (current.authorId !== req.user!.id && !canManage(member.role)) return res.status(403).json({ message: 'Bu mesajı düzenleme yetkin yok.' });
    const message = await prisma.message.update({ where: { id: current.id }, data: { content: input.content, editedAt: new Date() }, include: { author: true, reactions: true } });
    await logAudit(current.channel.serverId, req.user!.id, 'MESSAGE_EDITED', current.id);
    res.json({ message });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Mesaj düzenlenemedi.' });
  }
});

router.delete('/messages/:messageId', requireAuth, async (req, res) => {
  try {
    const current = await prisma.message.findUnique({ where: { id: (req.params.messageId as string) }, include: { channel: true } });
    if (!current || current.deletedAt) return res.status(404).json({ message: 'Mesaj bulunamadı.' });
    const member = await requireServerMember(req.user!.id, current.channel.serverId);
    if (current.authorId !== req.user!.id && !canManage(member.role)) return res.status(403).json({ message: 'Bu mesajı silme yetkin yok.' });
    await prisma.message.update({ where: { id: current.id }, data: { deletedAt: new Date() } });
    await logAudit(current.channel.serverId, req.user!.id, 'MESSAGE_DELETED', current.id);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Mesaj silinemedi.' });
  }
});

router.put('/messages/:messageId/reactions', requireAuth, async (req, res) => {
  try {
    const input = ReactionSchema.parse(req.body);
    const message = await prisma.message.findUnique({ where: { id: (req.params.messageId as string) }, include: { channel: true } });
    if (!message || message.deletedAt) return res.status(404).json({ message: 'Mesaj bulunamadı.' });
    const { allowed } = await canUseChannel(req.user!.id, message.channelId, 'view');
    if (!allowed) return res.status(403).json({ message: 'Bu mesaja reaksiyon ekleme yetkin yok.' });
    const reaction = await prisma.messageReaction.upsert({
      where: { messageId_userId_emoji: { messageId: message.id, userId: req.user!.id, emoji: input.emoji } },
      create: { messageId: message.id, userId: req.user!.id, emoji: input.emoji },
      update: {},
    });
    await logAudit(message.channel.serverId, req.user!.id, 'MESSAGE_REACTION_UPDATED', message.id, { emoji: input.emoji });
    res.json({ reaction });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Reaksiyon eklenemedi.' });
  }
});

router.delete('/messages/:messageId/reactions', requireAuth, async (req, res) => {
  try {
    const input = ReactionSchema.parse(req.body);
    await prisma.messageReaction.deleteMany({ where: { messageId: (req.params.messageId as string), userId: req.user!.id, emoji: input.emoji } });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Reaksiyon kaldırılamadı.' });
  }
});

router.get('/embed/:serverId/public', async (req, res) => {
  const widget = await prisma.serverWidget.findUnique({ where: { serverId: (req.params.serverId as string) }, include: { server: { include: { channels: true } } } });
  if (!widget?.enabled) return res.status(404).json({ message: 'Widget aktif değil.' });
  if (!widget.allowGuestPreview && !widget.requireSso) return res.status(403).json({ message: 'Widget önizleme kapalı.' });
  res.json({
    widget,
    server: {
      id: widget.server.id,
      name: widget.server.name,
      description: widget.server.description,
      channels: widget.server.channels.filter((c) => c.type === 'VOICE').map((c) => ({ id: c.id, name: c.name, allowVideo: c.allowVideo, allowScreenShare: c.allowScreenShare })),
    },
  });
});

router.post('/servers/:serverId/integrations', requireAuth, async (req, res) => {
  try {
    const member = await requireServerMember(req.user!.id, (req.params.serverId as string));
    if (!canAdmin(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const input = CreateIntegrationSchema.parse(req.body);
    const rawSecret = `lmsec_${nanoid(36)}`;
    const integration = await prisma.integrationApp.create({
      data: {
        serverId: (req.params.serverId as string),
        name: input.name,
        clientId: `lm_${nanoid(24)}`,
        clientSecretHash: await bcrypt.hash(rawSecret, 12),
        allowedOrigins: input.allowedOrigins as any,
        scopes: input.scopes as any,
      },
    });
    await logAudit((req.params.serverId as string), req.user!.id, 'INTEGRATION_CREATED', integration.id, { name: input.name, scopes: input.scopes });
    res.status(201).json({ integration, clientSecret: rawSecret, warning: 'Bu secret sadece bir kez gösterilir.' });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Entegrasyon oluşturulamadı.' });
  }
});

router.get('/servers/:serverId/integrations', requireAuth, async (req, res) => {
  try {
    const member = await requireServerMember(req.user!.id, (req.params.serverId as string));
    if (!canAdmin(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const integrations = await prisma.integrationApp.findMany({ where: { serverId: (req.params.serverId as string) }, orderBy: { createdAt: 'desc' } });
    res.json({ integrations });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Entegrasyonlar alınamadı.' });
  }
});

router.post('/servers/:serverId/webhooks', requireAuth, async (req, res) => {
  try {
    const member = await requireServerMember(req.user!.id, (req.params.serverId as string));
    if (!canAdmin(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const input = CreateWebhookSchema.parse(req.body);
    if (input.channelId) {
      const channel = await prisma.channel.findUnique({ where: { id: input.channelId } });
      if (!channel || channel.serverId !== (req.params.serverId as string)) return res.status(400).json({ message: 'Kanal bu sunucuya ait değil.' });
    }
    const rawSecret = `whsec_${nanoid(36)}`;
    const webhook = await prisma.webhook.create({ data: { serverId: (req.params.serverId as string), channelId: input.channelId, name: input.name, secretHash: await bcrypt.hash(rawSecret, 12), events: input.events as any } });
    await logAudit((req.params.serverId as string), req.user!.id, 'WEBHOOK_CREATED', webhook.id, { name: input.name, events: input.events });
    res.status(201).json({ webhook, secret: rawSecret, warning: 'Bu webhook secret sadece bir kez gösterilir.' });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Webhook oluşturulamadı.' });
  }
});

router.post('/sso/sessions', requireAuth, async (req, res) => {
  try {
    const input = CreateSsoSessionSchema.parse(req.body);
    if (input.serverId) await requireServerMember(req.user!.id, input.serverId);
    const token = `sso_${nanoid(40)}`;
    const session = await prisma.websiteSsoSession.create({
      data: {
        serverId: input.serverId,
        integrationAppId: input.integrationAppId,
        userId: req.user!.id,
        oneTimeToken: token,
        redirectUrl: input.redirectUrl,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      },
    });
    if (input.serverId) await logAudit(input.serverId, req.user!.id, 'SSO_SESSION_CREATED', session.id);
    res.status(201).json({ token, expiresAt: session.expiresAt });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'SSO oturumu oluşturulamadı.' });
  }
});

router.post('/sso/consume/:token', async (req, res) => {
  try {
    const session = await prisma.websiteSsoSession.findUnique({ where: { oneTimeToken: (req.params.token as string) }, include: { user: true } });
    if (!session || session.usedAt || session.expiresAt < new Date()) return res.status(400).json({ message: 'SSO token geçersiz veya süresi dolmuş.' });
    await prisma.websiteSsoSession.update({ where: { id: session.id }, data: { usedAt: new Date() } });
    const token = signToken({ id: session.user.id, email: session.user.email, name: session.user.name, globalRole: session.user.globalRole });
    res.json({ token, user: publicUser(session.user), redirectUrl: session.redirectUrl });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'SSO token kullanılamadı.' });
  }
});

router.get('/system/status', requireAuth, async (req, res) => {
  if (req.user!.globalRole !== 'ADMIN') return res.status(403).json({ message: 'Sistem yöneticisi yetkisi gerekli.' });
  const [users, servers, messages, channels, activePushSubscriptions] = await Promise.all([
    prisma.user.count(),
    prisma.server.count(),
    prisma.message.count({ where: { deletedAt: null } }),
    prisma.channel.count(),
    prisma.pushSubscription.count({ where: { isActive: true } }),
  ]);
  res.json({ ok: true, version: '0.4.0', uptimeSeconds: Math.round(process.uptime()), users, servers, messages, channels, activePushSubscriptions, time: new Date().toISOString() });
});

router.get('/system/backups', requireAuth, async (req, res) => {
  if (req.user!.globalRole !== 'ADMIN') return res.status(403).json({ message: 'Sistem yöneticisi yetkisi gerekli.' });
  const backups = await prisma.backupRun.findMany({ orderBy: { startedAt: 'desc' }, take: 50 });
  res.json({ backups });
});

router.get('/system/backfill', async (req, res) => {
  const servers = await prisma.server.findMany({ include: { channels: true } });
  
  for (const server of servers) {
    const hasConference = server.channels.some((c: any) => c.name.toLowerCase() === 'konferans' && c.type === 'VOICE');
    const hasAfk = server.channels.some((c: any) => c.name.toLowerCase() === 'afk' && c.type === 'VOICE');
    
    let position = server.channels.length + 1;
    
    if (!hasConference) {
      await prisma.channel.create({
        data: {
          serverId: server.id,
          name: "Konferans",
          type: 'VOICE',
          position: position++,
          category: 'Ses',
          bitrate: 64000,
          allowVideo: true,
          allowScreenShare: true,
          lowLatencyMode: true
        }
      });
    }
    
    if (!hasAfk) {
      await prisma.channel.create({
        data: {
          serverId: server.id,
          name: 'AFK',
          type: 'VOICE',
          position: position++,
          category: 'Ses',
          bitrate: 64000,
          allowVideo: false,
          allowScreenShare: false,
          lowLatencyMode: true
        }
      });
    }
  }
  
  res.json({ ok: true, message: 'Backfill complete.' });
});

router.patch('/channels/:channelId', requireAuth, async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: (req.params.channelId as string) } });
    if (!channel) return res.status(404).json({ message: 'Kanal bulunamadı.' });
    const member = await requireServerMember(req.user!.id, channel.serverId);
    if (!canManage(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    const input = UpdateChannelSchema.parse(req.body);
    const updated = await prisma.channel.update({ where: { id: channel.id }, data: input });
    res.json({ channel: updated });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Kanal güncellenemedi.' });
  }
});

router.delete('/channels/:channelId', requireAuth, async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: (req.params.channelId as string) } });
    if (!channel) return res.status(404).json({ message: 'Kanal bulunamadı.' });
    
    const protectedNames = ['genel', 'konferans', 'afk'];
    if (protectedNames.includes(channel.name.toLowerCase())) {
      return res.status(403).json({ message: 'Bu varsayılan kanal silinemez.' });
    }

    const member = await requireServerMember(req.user!.id, channel.serverId);
    if (!canManage(member.role)) return res.status(403).json({ message: 'Yetkin yok.' });
    await prisma.channel.delete({ where: { id: channel.id } });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ message: error.message || 'Kanal silinemedi.' });
  }
});

export { router };
