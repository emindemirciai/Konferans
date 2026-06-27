# Let's Meet

Let's Meet; topluluklar, ekipler ve oyun grupları için geliştirilen Discord benzeri, self-host edilebilir bir iletişim platformudur. Web arayüzü, Express API, Socket.IO gerçek zamanlı olayları, PostgreSQL/Prisma veri katmanı ve LiveKit tabanlı ses/görüntü altyapısı tek bir monorepo içinde tutulur.

## Güncel Durum

Bu sürümde kanal, sohbet, sesli oda ve özel mesaj deneyimi yeniden düzenlendi. Son kullanıcı tarafındaki ana akış artık daha stabil ve daha Discord benzeri çalışır.

### Öne Çıkan Özellikler

- Sunucu ve kanal tabanlı metin sohbeti
- LiveKit ile sesli odaya bağlanma, kamera ve ekran paylaşımı
- Kullanıcının kanaldan ayrılıp uygulamada sadece çevrim içi kalabilmesi
- Owner ve admin yetkilerine göre kullanıcıları ses kanalları arasında sürükle bırak ile taşıma
- Adminlerin owner dışındaki kullanıcıları taşıyabilmesi
- AFK dahil kullanıcı sağ tık menülerinin ekran dışına taşmaması
- Kanal sohbetinde taşmayan mesajlar, kompakt logolar ve daha geniş chat alanı
- Çok satırlı, otomatik büyüyen mesaj yazma alanı
- Kanala bağlı kullanıcıların ses kanalı içinde ortalı ve düzenli görünmesi
- Herkesin herkese özel mesaj gönderebilmesi; özel mesaj için arkadaşlık şartı yoktur
- Ana sayfada Mesajlar ve Arkadaşlar alanları
- Özel mesaj konuşmalarının otomatik olarak Mesajlar bölümünde görünmesi
- Arkadaşlık istekleri ve arkadaş listesi
- Docker ile API/Web/PostgreSQL/Redis/LiveKit çalıştırma desteği

## Teknoloji Yığını

- Web: Next.js, React, TypeScript, Lucide Icons, LiveKit Components
- API: Node.js, Express, Socket.IO, TypeScript
- Veritabanı: PostgreSQL, Prisma
- Gerçek zamanlı medya: LiveKit
- Cache/yardımcı servis: Redis
- Monorepo: pnpm workspace
- Dağıtım: Docker Compose

## Klasör Yapısı

```text
.
├─ apps/
│  ├─ api/       # Express API, Socket.IO, Prisma, LiveKit token servisi
│  ├─ web/       # Next.js web istemcisi
│  └─ mobile/    # Mobil istemci alanı
├─ packages/
│  └─ shared/    # Ortak Zod şemaları ve TypeScript tipleri
├─ infra/        # LiveKit, Caddy ve Nginx yapılandırmaları
├─ scripts/      # Yardımcı betikler
└─ docs/         # Ek dokümantasyon
```

## Yerel Geliştirme

Önce ortam değişkenlerini hazırlayın:

```bash
cp .env.example .env
```

Bağımlılıkları yükleyin:

```bash
pnpm install
```

Prisma istemcisini oluşturun ve veritabanını hazırlayın:

```bash
pnpm prisma:generate
pnpm db:push
pnpm db:seed
```

Web ve API geliştirme sunucularını başlatın:

```bash
pnpm dev
```

Varsayılan adresler:

- Web: `http://localhost:3000`
- API health check: `http://localhost:4000/health`
- LiveKit: `ws://localhost:7880`

## Docker ile Çalıştırma

Docker Compose; PostgreSQL, Redis, LiveKit, API ve Web servislerini birlikte ayağa kaldırır.

```bash
cp .env.example .env
docker compose up -d --build
```

Servisleri kontrol etmek için:

```bash
docker compose ps
```

Varsayılan portlar:

- `3000/tcp`: Web
- `4000/tcp`: API
- `7880/tcp`: LiveKit WebSocket
- `7881/tcp`: LiveKit TCP medya
- `50000-50100/udp`: LiveKit UDP medya aralığı

## Önemli Ortam Değişkenleri

- `DATABASE_URL`: PostgreSQL bağlantı adresi
- `JWT_SECRET`: oturum imzalama anahtarı
- `CORS_ORIGIN`: web istemcisine izin verilen origin
- `PUBLIC_WEB_URL`: web uygulamasının dış adresi
- `PUBLIC_API_URL`: web istemcisinin kullanacağı API adresi
- `LIVEKIT_API_KEY`: LiveKit API anahtarı
- `LIVEKIT_API_SECRET`: LiveKit API secret değeri
- `LIVEKIT_WS_URL`: API'nin LiveKit'e bağlanacağı iç adres
- `LIVEKIT_PUBLIC_WS_URL`: istemcinin bağlanacağı LiveKit adresi
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: e-posta ayarları
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`: seed admin hesabı

## Kullanışlı Komutlar

```bash
pnpm dev              # API ve web uygulamasını geliştirme modunda başlatır
pnpm build            # Workspace paketlerini derler
pnpm lint             # Tip/lint kontrollerini çalıştırır
pnpm check            # Lint ve build komutlarını birlikte çalıştırır
pnpm prisma:generate  # Prisma client üretir
pnpm db:push          # Prisma şemasını veritabanına uygular
pnpm db:seed          # Başlangıç verilerini yükler
```

## Son Kullanıcı Akışları

### Ses Kanalları

Kullanıcılar bir ses kanalına bağlanabilir, bağlantı kartından durumlarını görebilir ve `Kanaldan ayrıl` butonuyla kanaldan çıkıp uygulamada online kalmaya devam edebilir. Owner ve admin kullanıcılar, yetkileri dahilinde kullanıcıları farklı ses kanallarına sürükleyip bırakabilir.

### Özel Mesajlar

Özel mesaj göndermek için arkadaş olmak gerekmez. Bir kullanıcıya sağ tıklayıp özel mesaj başlatıldığında konuşma otomatik olarak Ana Sayfa > Mesajlar alanında görünür. Arkadaşlar bölümü ayrı bir sosyal liste olarak korunur.

### Chat Düzeni

Mesajlar chat alanı içinde kalacak şekilde sarılır; yatay kaydırma oluşmaz. Yazma alanı çok satırlı metinlerde otomatik büyür ve gönder butonu kullanıcı paneline taşmaz.

## Lisans

Bu proje `LICENSE` dosyasındaki koşullarla lisanslanmıştır.
