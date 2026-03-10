'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

function AccountContent() {
  const { user } = useAuth();

  return (
    <main className="max-w-3xl mx-auto lg:mx-0">
      <h2 className="text-xl sm:text-2xl font-display font-semibold text-gray-900 mb-6">Profile</h2>

      <div className="panel p-6 space-y-4">
        <div>
          <div className="data-label mb-1">Email</div>
          <div className="text-sm text-gray-900">{user?.email || '—'}</div>
        </div>
        <div>
          <div className="data-label mb-1">Role</div>
          <div className="text-sm text-gray-900">{user?.role || '—'}</div>
        </div>
        <div>
          <div className="data-label mb-1">Account ID</div>
          <div className="text-sm font-mono text-gray-500">{user?.account_id || '—'}</div>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Link href="/account/security" className="btn btn-secondary">Security</Link>
        <Link href="/account/billing" className="btn btn-secondary">Billing</Link>
      </div>
    </main>
  );
}

export default function AccountPage() {
  return <AccountContent />;
}
