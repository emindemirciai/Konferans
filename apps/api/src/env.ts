import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  INVITE_ONLY: z.string().default('true'),
  ALLOW_PUBLIC_REGISTRATION: z.string().default('false'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
  LIVEKIT_API_KEY: z.string(),
  LIVEKIT_API_SECRET: z.string(),
  LIVEKIT_WS_URL: z.string(),
  LIVEKIT_PUBLIC_WS_URL: z.string().default('ws://localhost:7880'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(180),
  TRUST_PROXY: z.string().default('true'),
  MAX_JSON_BODY: z.string().default('2mb'),
  ENABLE_SYSTEM_STATUS: z.string().default('true'),
  BACKUP_DIR: z.string().default('/backups'),
});

export const env = schema.parse(process.env);
export const isInviteOnly = env.INVITE_ONLY === 'true';
export const allowPublicRegistration = env.ALLOW_PUBLIC_REGISTRATION === 'true';
export const smtpSecure = env.SMTP_SECURE === 'true';
