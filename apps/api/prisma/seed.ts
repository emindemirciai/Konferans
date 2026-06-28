import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@konferans.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const name = process.env.SEED_ADMIN_NAME || "Konferans Admin";
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      emailVerified: true,
      globalRole: 'ADMIN',
      settings: { create: {} },
      notificationPreference: { create: {} },
    },
    update: {
      passwordHash,
      emailVerified: true,
      globalRole: 'ADMIN',
    },
  });

  const server = await prisma.server.upsert({
    where: { slug: 'konferans-hq' },
    create: {
      name: "Konferans HQ",
      slug: 'konferans-hq',
      ownerId: admin.id,
      members: { create: { userId: admin.id, role: 'OWNER' } },
      channels: {
        create: [
          { name: 'genel-sohbet', type: 'TEXT', position: 1 },
          { name: 'oyun-sesi', type: 'VOICE', position: 2, bitrate: 64000 },
        ],
      },
    },
    update: {},
  });

  await prisma.serverWidget.upsert({
    where: { serverId: server.id },
    create: { serverId: server.id, enabled: true, allowGuestPreview: true, theme: 'gaming' },
    update: { enabled: true, allowGuestPreview: true, theme: 'gaming' },
  });

  const inviteCode = `KF-${nanoid(10)}`;
  await prisma.invite.create({
    data: {
      code: inviteCode,
      scope: 'PLATFORM',
      serverId: server.id,
      createdById: admin.id,
      maxUses: 100,
    },
  });

  console.log('Seed completed');
  console.log(`Admin: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Invite code: ${inviteCode}`);
}

main().finally(async () => prisma.$disconnect());
