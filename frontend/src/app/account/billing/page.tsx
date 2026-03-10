'use client';

import { RequireAuth } from '@/lib/auth';
import { AppHeader } from '@/components/layout';

function BillingContent() {
  return (
    <div className="min-h-screen bg-surface-page">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-display font-semibold text-gray-900 mb-4">Billing</h1>
        <div className="panel p-8 text-center">
          <p className="text-sm text-gray-500">Billing is not yet available. Vigil is currently free during beta.</p>
        </div>
      </main>
    </div>
  );
}

export default function BillingPage() {
  return <RequireAuth><BillingContent /></RequireAuth>;
}
