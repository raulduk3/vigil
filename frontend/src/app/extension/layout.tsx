import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Chrome Extension',
  description: '30-second guided setup for Gmail and Outlook. Install the Vigil Chrome extension and start monitoring email in seconds.',
  alternates: { canonical: 'https://vigil.run/extension' },
  openGraph: {
    title: 'Chrome Extension | Vigil',
    description: '30-second guided setup for Gmail and Outlook email monitoring.',
    url: 'https://vigil.run/extension',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
