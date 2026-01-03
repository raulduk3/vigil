'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { RequireAuth, useAuth } from '@/lib/auth';
import { AppHeader } from '@/components/layout';

function CreateWatcherContent() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Watcher name is required');
      return;
    }

    setIsLoading(true);
    try {
      // Detect user's timezone from browser
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      
      const result = await api.createWatcher(name, {
        // Sender control - add user email as allowed sender by default
        allowed_senders: user?.email ? [user.email] : [],

        // Timing thresholds (commercial model: silence tracking only)
        silence_threshold_hours: 72,

        // Notification channels - add user email with 'all' urgency filter
        notification_channels: user?.email ? [{ type: 'email', destination: user.email, urgency_filter: 'all', enabled: true }] : [],

        // Reporting config - add user email as report recipient
        reporting_cadence: 'on_demand',
        reporting_recipients: user?.email ? [user.email] : [],

        // Timezone for report scheduling - auto-detected from browser
        timezone: userTimezone,
      });
      // Attempt activation (optional). If activation fails due to missing channels,
      // we still navigate to the watcher detail page for configuration.
      try {
        await api.activateWatcher(result.watcher.watcher_id);
      } catch (e) {
        console.warn('[CreateWatcher] Activation skipped or failed:', e);
      }
      // Navigate to the watcher page (activation may show status updated)
      router.push(`/watchers/${result.watcher.watcher_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create watcher');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader backHref="/dashboard" title="Create Watcher" />

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">New Watcher</h2>
            <p className="text-sm text-gray-500 mt-1">
              Create a new watcher to monitor time-sensitive email communications.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Watcher Name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="e.g., Client Emails, Project Updates"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                A descriptive name to identify this watcher.
              </p>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input min-h-[100px]"
                placeholder="Optional description of what this watcher monitors..."
              />
            </div>

            <div className="bg-gray-50 -mx-6 -mb-6 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <Link href="/dashboard" className="btn btn-secondary">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary"
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Creating...
                  </span>
                ) : (
                  'Create Watcher'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Info Card */}
        <div className="card mt-6 p-6">
          <h3 className="font-medium text-gray-900 mb-3">How it works</h3>
          <ol className="space-y-3 text-sm text-gray-600">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-vigil-100 text-vigil-600 rounded-full flex items-center justify-center text-xs font-medium">1</span>
              <span>Create a watcher with a descriptive name</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-vigil-100 text-vigil-600 rounded-full flex items-center justify-center text-xs font-medium">2</span>
              <span>Forward emails to your unique ingestion address</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-vigil-100 text-vigil-600 rounded-full flex items-center justify-center text-xs font-medium">3</span>
              <span>Vigil tracks threads and alerts you when action is needed</span>
            </li>
          </ol>
        </div>
      </main>
    </div>
  );
}

export default function CreateWatcherPage() {
  return (
    <RequireAuth>
      <CreateWatcherContent />
    </RequireAuth>
  );
}
