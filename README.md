# Let's Meet 🚀

**Let's Meet**, Discord ve Jitsi'den ilham alınarak geliştirilmiş, oyunculara ve topluluklara yönelik yeni nesil bir iletişim platformudur. Hem web üzerinden çalışan gelişmiş bir arayüze, hem de mobil platformlara (Android & iOS) destek veren bir yapıya sahiptir. Kendi sunucularınızda barındırabileceğiniz (self-hosted), uçtan uca LiveKit destekli, güçlü ve ölçeklenebilir bir altyapı üzerine inşa edilmiştir.

Bu depo (repository), V1, V2, V3 ve V4 geliştirme aşamalarının tümünü içeren **nihai sürümdür (v0.4.0)**. 

---

## 🌟 Güncel Durum ve Geliştirilen Özellikler (Uygulamanın Son Hali)

Uygulamanın güncel sürümünde, temel iletişim özelliklerinin yanı sıra tam teşekküllü bir platform olmak için gerekli tüm mimari tamamlanmıştır. Bugüne kadar yaptığımız **tüm temel değişiklikler ve eklenen özellikler** şunlardır:

### 1. Canlı Ses ve Görüntü İletişimi (LiveKit Entegrasyonu)
- **VoiceRoom Bileşeni:** Kullanıcıların odalara katılıp sesli, görüntülü sohbet yapabilmeleri ve ekran paylaşabilmeleri sağlandı.
- **Performans Modları:** Sinematik mod, bas-konuş (push-to-talk), düşük gecikme modu (low latency) ve aktif konuşmacı odaklı görünüm seçenekleri entegre edildi.
- **Sunucu Taraflı Kontroller:** Sunucu genelinde susturma (server-mute) ve sağırlaştırma (server-deafen) yetkileri eklendi.

### 2. Gerçek Zamanlı Mesajlaşma ve Chat
- **ChatPanel Bileşeni:** Sunucu ve kanallara özel, `Socket.IO` tabanlı anlık mesajlaşma sistemi kuruldu.
- **Yazıyor... Bildirimleri:** Kullanıcılar mesaj yazarken diğerlerine gerçek zamanlı "yazıyor" bilgisi iletilmesi sağlandı.
- **Arkadaş Ekleme:** Mesajlaşma paneli üzerinden kullanıcı profillerine tıklayıp anında arkadaşlık isteği gönderme altyapısı kuruldu.
- **Gelişmiş Mesaj Yönetimi:** Mesaj düzenleme, silme ve mesajlara reaksiyon bırakma eklentileri tamamlandı.

### 3. Sunucu ve Kanal Mimarisi
- Metin (Text) ve Ses/Görüntü (Voice/Video) kanalları ayrıştırıldı.
- Her ses kanalı; mikrofon, kamera ve ekran paylaşımı modüllerini aynı anda destekleyecek şekilde yapılandırıldı.
- **Rol ve İzin Yönetimi:** Kurucu (Owner), Yönetici (Admin), Moderatör, Üye (Member) ve Misafir (Guest) rolleri oluşturuldu.
- Kanallara özel yetki ezme (permission overrides) ayarları eklendi.

### 4. Entegrasyon ve "Overlay" (Oyun İçi Arayüz)
- **Oyun İçi Overlay (`/overlay`):** Oyuncular için ekranın bir köşesinde çalışabilecek ultra hafif bir iletişim arayüzü (Overlay) eklendi.
- **Embed ve Webhook:** Dış web siteleriyle entegrasyon için `/embed/[serverId]` rotaları, Webhook desteği ve SSO (Tek Oturum Açma) altyapısı oluşturuldu.
- **Bildirim Sistemi:** Uygulama içi bildirimler ve Web/Mobil anlık bildirim (push notification) tercihleri panele eklendi.

### 5. API ve Üretim (Production) İyileştirmeleri
- **Node.js Mailer (`mailer.ts`):** E-posta doğrulama, hoş geldin mesajları ve bildirimler için güvenli mail gönderim altyapısı kuruldu.
- API'ye oran sınırlaması (Rate Limiting) getirildi.
- Sağlık kontrolü (Health Checks), Docker Container metrikleri ve global admin statüsünü gösteren monitoring endpointleri yazıldı.

---

## 🛠 Teknoloji Yığını (Tech Stack)

Projemiz monorepo (pnpm workspace) yapısında olup aşağıdaki teknolojiler kullanılarak geliştirilmiştir:

- **Web (Frontend):** Next.js, React, Tailwind CSS, Lucide Icons
- **Mobil (Native):** React Native (Expo) - iOS & Android
- **API (Backend):** Node.js, Express.js, Socket.IO
- **Veritabanı:** PostgreSQL, Prisma ORM, Redis
- **Medya Sunucusu:** LiveKit (Self-Hosted WebRTC SFU)
- **DevOps / Dağıtım:** Docker, Docker Compose, Dokploy, GitHub Actions (CI)

### Klasör Yapısı

```text
lets-meet/
  apps/
    api/       # Express API, Prisma, Auth, LiveKit Token servisi, Socket.IO
    web/       # Next.js uygulaması (PWA, Web İstemcisi, Overlay)
    mobile/    # Expo React Native (Android/iOS)
  packages/
    shared/    # Zod şemaları ve ortak TypeScript tipleri
  infra/
    livekit/   # LiveKit konfigürasyonları
    caddy/     # Caddy reverse-proxy ayarları
    nginx/     # Nginx reverse-proxy ayarları
  scripts/     # Yedekleme ve geri yükleme betikleri (Backup & Restore)
  docs/        # Mimari detaylar, deployment notları ve API dokümanları
```

---

## 🚀 Kurulum ve İlk Çalıştırma (Geliştirme Ortamı)

Projeyi kendi bilgisayarınızda (local) çalıştırmak için aşağıdaki adımları izleyin:

```bash
# 1. Ortam değişkenlerini kopyalayın
cp .env.example .env

# 2. Bağımlılıkları yükleyin
pnpm install

# 3. Prisma istemcisini oluşturun ve veritabanını güncelleyin
pnpm prisma:generate
pnpm db:push

# 4. Örnek başlangıç verilerini ve Yöneticiyi (Admin) veritabanına ekleyin
pnpm db:seed

# 5. Tüm servisleri (API + Web) geliştirme modunda başlatın
pnpm dev
```

**Erişim Bağlantıları:**
- **Web Arayüzü:** `http://localhost:3000`
- **API Servisi:** `http://localhost:4000/health`
- **LiveKit Sunucusu:** `ws://localhost:7880`

---

## 🐳 Docker ile Canlıya Alma (Production / VPS)

Projeyi gerçek bir sunucuda veya Dokploy üzerinde yayınlamak oldukça basittir:

```bash
cp .env.example .env
# .env dosyasındaki değişkenleri (Şifreler, API Key'ler, Domainler) kendinize göre düzenleyin.

docker compose up -d --build
```

**Kullanılan Portlar:**
- `3000/tcp` (Web)
- `4000/tcp` (API - Reverse proxy arkasında gizlenebilir)
- `7880/tcp` (LiveKit WebSocket)
- `50000-50100/udp` (LiveKit Medya trafiği - Güvenlik duvarından açılması zorunludur)

---

## ⚙️ Çevresel Değişkenler (Environment Variables)

Uygulamanın prodüksiyon ortamında sorunsuz çalışabilmesi için `.env` dosyasında şu değişkenlerin kesinlikle ayarlanması gerekir:
- `DATABASE_URL` (PostgreSQL bağlantı adresi)
- `JWT_SECRET` (Oturum ve güvenlik tokenları için gizli anahtar)
- `LIVEKIT_API_KEY` & `LIVEKIT_API_SECRET` & `LIVEKIT_PUBLIC_WS_URL`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (E-posta gönderimi için)
- `PUBLIC_WEB_URL` & `PUBLIC_API_URL` (Domain adresleriniz)

---

## 📜 Faydalı Komutlar

```bash
pnpm dev             # Web ve API sunucusunu geliştirici modunda başlatır
pnpm build           # Tüm projeyi derler (build)
pnpm lint            # Hata kontrollerini yapar
pnpm check           # Lint + Build işlemlerini birlikte çalıştırır
pnpm db:studio       # Prisma Studio ile veritabanını görsel olarak yönetir
pnpm backup:db       # PostgreSQL veritabanı yedeğini alır (.sql.gz)
pnpm restore:db ./backups/dosya.sql.gz  # Alınan yedeği sisteme geri yükler
```

---

*Proje ile ilgili tüm detaylı mimari, güvenlik prosedürleri ve entegrasyon notları `docs/` klasörü içerisinde yer almaktadır.*
