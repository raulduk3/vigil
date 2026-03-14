'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { ConnectionIndicator } from '@/components/system/connection-indicator';
import { HeaderLogo } from './header-logo';

interface PublicHeaderProps {
  /** Whether header is fixed/sticky (default: true) */
  fixed?: boolean;
  /** Additional nav links to show */
  navLinks?: Array<{ href: string; label: string }>;
}

const defaultNavLinks = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/privacy', label: 'Privacy & Data' },
];

export function PublicHeader({
  fixed = true,
  navLinks = defaultNavLinks,
}: PublicHeaderProps) {
  const { isAuthenticated, isLoading, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <header className={`bg-surface-raised border-b border-gray-200${fixed ? ' fixed top-0 left-0 right-0 z-50' : ''}`}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex justify-between items-center h-18">
          <div className="flex items-center gap-4 sm:gap-5 min-w-0 flex-1">
            <HeaderLogo />
            {navLinks.length > 0 && (
              <div className="hidden lg:flex items-center gap-1">
                {navLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="nav-item text-base">
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 sm:gap-5 flex-shrink-0">
            <div className="hidden sm:block">
              <ConnectionIndicator />
            </div>
            <div className="w-px h-6 bg-gray-200 hidden sm:block" />
            
            {isLoading ? (
              // Loading state - show skeleton
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="h-10 w-14 sm:w-20 bg-gray-200 rounded-md animate-pulse" />
                <div className="h-10 w-20 sm:w-28 bg-gray-200 rounded-md animate-pulse hidden sm:block" />
              </div>
            ) : isAuthenticated ? (
              // Logged in state
              <>
                <Link href="/dashboard" className="btn btn-ghost">
                  Dashboard
                </Link>
                <button onClick={handleLogout} className="btn btn-secondary">
                  Sign out
                </button>
              </>
            ) : (
              // Logged out state
              <>
                <Link href="/auth/login" className="btn btn-ghost">
                  Sign in
                </Link>
                <Link href="/auth/register" className="btn btn-primary">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
