import Link from 'next/link';

export function TableOfContents() {
  const links = [
    { href: '/learn/watchers', label: 'Watchers' },
    { href: '/learn/email-ingestion', label: 'Email ingestion' },
    { href: '/learn/agent', label: 'Agent' },
    { href: '/learn/memory', label: 'Memory' },
    { href: '/learn/architecture', label: 'Architecture' },
    { href: '/learn/security', label: 'Security' },
  ];

  return (
    <aside className="hidden lg:block sticky top-24 h-max">
      <div className="panel p-4 w-56">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
          Table of contents
        </p>
        <p className="text-xs text-gray-500 mb-3">Select a topic to open its full guide.</p>
        <nav className="flex flex-col gap-2 text-sm text-gray-700">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex items-center justify-between rounded-md px-2.5 py-2 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <span>{link.label}</span>
              <span aria-hidden className="text-gray-400 group-hover:text-vigil-700 transition-colors">{'->'}</span>
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
