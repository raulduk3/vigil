'use client';

import { RequireAuth } from '@/lib/auth';
import { AppHeader } from '@/components/layout';

function SecurityContent() {
  return (
    <div className="min-h-screen bg-surface-page">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-display font-semibold text-gray-900 mb-4">Security</h1>
        <div className="panel p-8 text-center">
          <p className="text-sm text-gray-500">Password change and OAuth linking coming soon.</p>
        </div>
      </main>
    </div>
  );
}

export default function SecurityPage() {
  return <RequireAuth><SecurityContent /></RequireAuth>;
}
