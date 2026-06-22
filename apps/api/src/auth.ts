import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from './env.js';
import { prisma } from './db.js';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  globalRole: 'USER' | 'ADMIN';
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as any });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, env.JWT_SECRET) as AuthUser;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    req.user = { id: user.id, email: user.email, name: user.name, globalRole: user.globalRole };
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date(), presenceStatus: user.presenceStatus === 'INVISIBLE' ? 'INVISIBLE' : 'ONLINE' } }).catch(() => null);
    next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

export async function requireServerMember(userId: string, serverId: string) {
  const member = await prisma.serverMember.findUnique({
    where: { serverId_userId: { serverId, userId } },
  });
  if (!member || member.status !== 'ACTIVE') throw new Error('Not an active server member');
  return member;
}

export const roleRank: Record<string, number> = {
  OWNER: 50,
  ADMIN: 40,
  MODERATOR: 30,
  MEMBER: 20,
  GUEST: 10,
};

export function canManage(role: string) {
  return roleRank[role] >= roleRank.MODERATOR;
}

export function canAdmin(role: string) {
  return roleRank[role] >= roleRank.ADMIN;
}

export function canModerate(actorRole: string, targetRole = 'MEMBER') {
  return roleRank[actorRole] >= roleRank.MODERATOR && roleRank[actorRole] > roleRank[targetRole];
}
