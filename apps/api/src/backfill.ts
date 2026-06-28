import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfill() {
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
      console.log(`Added Konferans to server ${server.name}`);
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
      console.log(`Added AFK to server ${server.name}`);
    }
  }
  
  console.log('Eski sunucular için kanal ekleme işlemi başarıyla tamamlandı!');
  process.exit(0);
}

backfill();
