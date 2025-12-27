import Link from 'next/link';
import { ConnectionIndicator } from '@/components/system/connection-indicator';
import { TableOfContents } from '@/components/learn/TableOfContents';
import { PublicHeader } from '@/components/layout';

const learnNavLinks = [
  { href: '/learn/watchers', label: 'Watchers' },
  { href: '/learn/email-ingestion', label: 'Email' },
  { href: '/learn/reminders', label: 'Reminders' },
  { href: '/learn/alerts', label: 'Alerts' },
  { href: '/learn/architecture', label: 'Architecture' },
];

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-page">
      {/* Navigation */}
      <PublicHeader navLinks={learnNavLinks} />

      {/* Content */}
      <main className="pt-14">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_240px] gap-8 lg:gap-12">
            <div className="min-w-0 learn-content">
              {children}
            </div>
            <TableOfContents />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-surface-page mt-24">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-sm text-gray-500">
            <div className="flex flex-wrap gap-x-4 gap-y-2 md:gap-x-6">
              <Link href="/" className="hover:text-gray-700">Home</Link>
              <Link href="/learn/watchers" className="hover:text-gray-700">Watchers</Link>
              <Link href="/learn/email-ingestion" className="hover:text-gray-700">Email</Link>
              <Link href="/learn/event-extraction" className="hover:text-gray-700">Extraction</Link>
              <Link href="/learn/reminders" className="hover:text-gray-700">Reminders</Link>
              <Link href="/learn/alerts" className="hover:text-gray-700">Alerts</Link>
              <Link href="/learn/architecture" className="hover:text-gray-700">Architecture</Link>
              <Link href="/learn/security" className="hover:text-gray-700">Security</Link>
            </div>
            <div className="hidden sm:flex items-center justify-start md:justify-end">
              <ConnectionIndicator />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
