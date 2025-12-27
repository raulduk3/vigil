import Link from 'next/link';

export function TableOfContents() {
  const links = [
    { href: '/learn/watchers', label: 'Watchers' },
    { href: '/learn/email-ingestion', label: 'Email ingestion' },
    { href: '/learn/event-extraction', label: 'Smart extraction' },
    { href: '/learn/reminders', label: 'Reminders' },
    { href: '/learn/alerts', label: 'Notifications' },
    { href: '/learn/architecture', label: 'How it works' },
    { href: '/learn/security', label: 'Security' },
  ];

  return (
    <aside className="hidden lg:block sticky top-24 h-max">
      <div className="panel p-4 w-56">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
          Table of contents
        </p>
        <nav className="flex flex-col gap-2 text-sm text-gray-700">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-gray-900">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
