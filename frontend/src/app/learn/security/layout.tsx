import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Security',
  description: 'What Vigil stores, discards, and encrypts. SHA-256 proof of receipt. AES-256-GCM for BYOK keys.',
  alternates: { canonical: 'https://vigil.run/learn/security' },
  openGraph: {
    title: 'Security | Vigil Docs',
    description: 'What Vigil stores, discards, and encrypts. SHA-256 proof of receipt. AES-256-GCM for BYOK keys.',
    url: 'https://vigil.run/learn/security',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
