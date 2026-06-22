import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfill() {
  const servers = await prisma.server.findMany({ include: { channels: true } });
  
  for (const server of servers) {
    const hasLetsMeet = server.channels.some((c: any) => c.name.toLowerCase() === "let's meet" && c.type === 'VOICE');
    const hasAfk = server.channels.some((c: any) => c.name.toLowerCase() === 'afk' && c.type === 'VOICE');
    
    let position = server.channels.length + 1;
    
    if (!hasLetsMeet) {
      await prisma.channel.create({
        data: {
          serverId: server.id,
          name: "Let's Meet",
          type: 'VOICE',
          position: position++,
          category: 'Ses',
          bitrate: 64000,
          allowVideo: true,
          allowScreenShare: true,
          lowLatencyMode: true
        }
      });
      console.log(`Added Let's Meet to server ${server.name}`);
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
