import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { HashTextureOverlay } from '@/components/system/hash-overlay';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Vigil — AI Email Agent That Reads and Acts on Your Email',
    template: '%s | Vigil',
  },
  description: 'An AI agent that reads your email, tracks obligations, and acts on your behalf. No inbox access. One cent per email. Forward what matters.',
  keywords: ['AI email agent', 'email automation', 'obligation tracking', 'email monitoring', 'email API', 'no inbox access', 'pay per use email', 'email webhook', 'email AI', 'autonomous email agent'],
  metadataBase: new URL('https://vigil.run'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://vigil.run',
    siteName: 'Vigil',
    title: 'Vigil — AI Email Agent That Reads and Acts on Your Email',
    description: 'An AI agent that reads your email, tracks obligations, and acts on your behalf. No inbox access. One cent per email.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vigil — AI Email Agent',
    description: 'An AI agent that reads your email, tracks obligations, and acts. No inbox access. 1¢ per email.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://vigil.run',
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Vigil',
              url: 'https://vigil.run',
              description: 'An AI agent that reads your email, tracks obligations, and acts on your behalf.',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              offers: {
                '@type': 'Offer',
                price: '0.01',
                priceCurrency: 'USD',
                description: 'Pay per email processed. No subscriptions.',
              },
            }),
          }}
        />
      </head>
      <body className={inter.className}>
        <div className="relative isolate min-h-screen">
          <HashTextureOverlay />
          <div className="relative z-[2]">
            <Providers>{children}</Providers>
          </div>
        </div>
      </body>
    </html>
  );
}
