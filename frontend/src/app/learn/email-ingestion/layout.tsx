import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Email Setup',
  description: 'Set up email forwarding to Vigil. Gmail, Outlook, and manual configuration guides.',
  alternates: { canonical: 'https://vigil.run/learn/email-ingestion' },
  openGraph: {
    title: 'Email Setup | Vigil Docs',
    description: 'Set up email forwarding to Vigil. Gmail, Outlook, and manual configuration guides.',
    url: 'https://vigil.run/learn/email-ingestion',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
