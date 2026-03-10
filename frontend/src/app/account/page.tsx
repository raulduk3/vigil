'use client';

import Link from 'next/link';
import { RequireAuth, useAuth } from '@/lib/auth';
import { AppHeader } from '@/components/layout';

function AccountContent() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-surface-page">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-display font-semibold text-gray-900 mb-6">Account</h1>

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
    </div>
  );
}

export default function AccountPage() {
  return <RequireAuth><AccountContent /></RequireAuth>;
}
