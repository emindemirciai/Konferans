import { z } from 'zod';

export const ChannelType = z.enum(['TEXT', 'VOICE']);
export type ChannelType = z.infer<typeof ChannelType>;

export const MemberRole = z.enum(['OWNER', 'ADMIN', 'MODERATOR', 'MEMBER', 'GUEST']);
export type MemberRole = z.infer<typeof MemberRole>;

export const PresenceStatus = z.enum(['ONLINE', 'IDLE', 'DO_NOT_DISTURB', 'INVISIBLE', 'OFFLINE']);
export type PresenceStatus = z.infer<typeof PresenceStatus>;

export const ModerationActionType = z.enum(['MUTE', 'UNMUTE', 'DEAFEN', 'UNDEAFEN', 'KICK', 'BAN', 'UNBAN']);
export type ModerationActionType = z.infer<typeof ModerationActionType>;

export const PushProvider = z.enum(['WEB_PUSH', 'EXPO', 'FCM', 'APNS']);
export type PushProvider = z.infer<typeof PushProvider>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(60),
  inviteCode: z.string().min(4).max(64).optional(),
});

export const CreateServerSchema = z.object({
  name: z.string().min(2).max(60),
  isPublic: z.boolean().optional(),
  description: z.string().max(300).optional(),
});

export const CreateChannelSchema = z.object({
  serverId: z.string().cuid(),
  name: z.string().min(2).max(60),
  type: ChannelType,
  category: z.string().min(1).max(60).optional(),
  bitrate: z.number().int().min(16000).max(128000).optional(),
  userLimit: z.number().int().min(1).max(200).optional(),
  allowVideo: z.boolean().optional(),
  allowScreenShare: z.boolean().optional(),
  requirePushToTalk: z.boolean().optional(),
  lowLatencyMode: z.boolean().optional(),
  slowModeSeconds: z.number().int().min(0).max(3600).optional(),
  topic: z.string().max(300).optional(),
});

export const UpdateChannelSchema = CreateChannelSchema.omit({ serverId: true, type: true }).partial().extend({
  isLocked: z.boolean().optional(),
});

export const ChannelPermissionSchema = z.object({
  role: MemberRole,
  canView: z.boolean().optional(),
  canSendMessage: z.boolean().optional(),
  canJoinVoice: z.boolean().optional(),
  canPublishVideo: z.boolean().optional(),
  canShareScreen: z.boolean().optional(),
  canManageChannel: z.boolean().optional(),
});

export const AttachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  url: z.string().url(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export const CreateMessageSchema = z.object({
  channelId: z.string().cuid(),
  content: z.string().min(1).max(4000),
  attachments: z.array(AttachmentSchema).optional(),
});

export const UpdateMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const ReactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

export const CreateDirectMessageSchema = z.object({
  receiverId: z.string().cuid(),
  content: z.string().min(1).max(4000),
  attachments: z.array(AttachmentSchema).optional(),
});

export const LiveKitTokenSchema = z.object({
  channelId: z.string().cuid(),
});

export const UserSettingsSchema = z.object({
  pushToTalkEnabled: z.boolean().default(false),
  pushToTalkKey: z.string().default('Space'),
  voiceActivationThreshold: z.number().int().min(-100).max(0).default(-50),
  lowPowerMode: z.boolean().default(true),
  performanceMode: z.boolean().default(true),
  overlayCompactMode: z.boolean().default(true),
  showOnlyActiveSpeakers: z.boolean().default(false),
  echoCancellation: z.boolean().default(true),
  noiseSuppression: z.boolean().default(true),
  autoGainControl: z.boolean().default(true),
  inputVolume: z.number().min(0).max(2).default(1),
  outputVolume: z.number().min(0).max(2).default(1),
  startMuted: z.boolean().default(false),
  cameraEnabledByDefault: z.boolean().default(false),
  screenShareQuality: z.enum(['LOW', 'BALANCED', 'HIGH']).default('BALANCED'),
  autoJoinLastVoice: z.boolean().default(true),
  mobileDataSaver: z.boolean().default(true),
  hardwareAccelerationHint: z.boolean().default(true),
  animatedUi: z.boolean().default(false),
  compactOverlayOpacity: z.number().min(0.4).max(1).default(0.92),
  maxIncomingVideoTracks: z.number().int().min(0).max(16).default(4),
});

export const FriendRequestSchema = z.object({
  email: z.string().email(),
});

export const FriendRequestResponseSchema = z.object({
  action: z.enum(['ACCEPT', 'DECLINE', 'BLOCK']),
});

export const UpdateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MODERATOR', 'MEMBER', 'GUEST']),
});

export const ModerationActionSchema = z.object({
  type: ModerationActionType,
  reason: z.string().max(500).optional(),
  durationMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
});

export const ServerWidgetSchema = z.object({
  enabled: z.boolean().default(false),
  allowGuestPreview: z.boolean().default(false),
  defaultChannelId: z.string().cuid().optional().nullable(),
  theme: z.enum(['dark', 'compact', 'gaming']).default('dark'),
  requireSso: z.boolean().default(false),
  allowedOrigins: z.array(z.string()).optional(),
});

export const PushSubscriptionSchema = z.object({
  provider: PushProvider,
  endpoint: z.string().url().optional(),
  token: z.string().min(8).optional(),
  keys: z.record(z.any()).optional(),
  platform: z.string().max(40).optional(),
  deviceName: z.string().max(80).optional(),
});

export const NotificationPreferenceSchema = z.object({
  directMessages: z.boolean().optional(),
  mentions: z.boolean().optional(),
  friendRequests: z.boolean().optional(),
  moderation: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export const FileObjectSchema = z.object({
  serverId: z.string().cuid().optional(),
  channelId: z.string().cuid().optional(),
  messageId: z.string().cuid().optional(),
  name: z.string().min(1).max(180),
  url: z.string().url(),
  storageKey: z.string().max(300).optional(),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.number().int().min(0).max(100 * 1024 * 1024),
  sha256: z.string().max(128).optional(),
  metadata: z.record(z.any()).optional(),
});

export const CreateIntegrationSchema = z.object({
  name: z.string().min(2).max(80),
  allowedOrigins: z.array(z.string()).default([]),
  scopes: z.array(z.enum(['embed:read', 'sso:create', 'voice:join', 'messages:read'])).default(['embed:read']),
});

export const CreateWebhookSchema = z.object({
  name: z.string().min(2).max(80),
  channelId: z.string().cuid().optional(),
  events: z.array(z.string()).default(['message.created']),
});

export const CreateSsoSessionSchema = z.object({
  serverId: z.string().cuid().optional(),
  integrationAppId: z.string().cuid().optional(),
  redirectUrl: z.string().url().optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type CreateServerInput = z.infer<typeof CreateServerSchema>;
export type CreateChannelInput = z.infer<typeof CreateChannelSchema>;
export type UpdateChannelInput = z.infer<typeof UpdateChannelSchema>;
export type CreateMessageInput = z.infer<typeof CreateMessageSchema>;
export type CreateDirectMessageInput = z.infer<typeof CreateDirectMessageSchema>;
export type LiveKitTokenInput = z.infer<typeof LiveKitTokenSchema>;
export type UserSettingsInput = z.infer<typeof UserSettingsSchema>;

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  emailVerified: boolean;
  presenceStatus?: PresenceStatus;
};

export type ApiServer = {
  id: string;
  name: string;
  slug: string;
  role: MemberRole;
  isPublic: boolean;
};

export type ApiChannel = {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  category?: string | null;
  position: number;
  bitrate: number;
  userLimit?: number | null;
  isLocked: boolean;
  allowVideo: boolean;
  allowScreenShare: boolean;
  requirePushToTalk: boolean;
  lowLatencyMode: boolean;
};
