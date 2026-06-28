import type { Metadata, Viewport } from 'next';
import '@livekit/components-styles';
import './globals.css';

export const metadata: Metadata = {
  title: "Konferans",
  description: 'Discord-style voice, video and screen sharing for gamers.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111318',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
