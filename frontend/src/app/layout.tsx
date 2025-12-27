import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { HashTextureOverlay } from '@/components/system/hash-overlay';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Vigil - Email Vigilance System',
  description: 'Deterministic, event-sourced vigilance system for time-sensitive email oversight',
  keywords: ['email', 'vigilance', 'deadline', 'tracking', 'notifications'],
  icons: {
    icon: [{ url: '/logo.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="relative min-h-screen">
          <Providers>{children}</Providers>
          <HashTextureOverlay />
        </div>
      </body>
    </html>
  );
}
