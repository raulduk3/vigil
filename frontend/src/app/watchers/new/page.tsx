'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RequireAuth } from '@/lib/auth';
import { AppHeader } from '@/components/layout';
import { api } from '@/lib/api';

const TOOLS = [
  { id: 'send_alert', label: 'Send Alert', description: 'Email notification when something needs attention' },
  { id: 'update_thread', label: 'Update Thread', description: 'Change thread status or summary' },
  { id: 'ignore_thread', label: 'Ignore Thread', description: 'Mark thread as noise' },
  { id: 'webhook', label: 'Webhook', description: 'POST to a configured URL' },
];

function NewWatcherContent() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(
    'Watch forwarded emails and alert when something needs attention. Alert on: requests waiting for response, deadlines, money matters, problems. Stay quiet on: newsletters, order confirmations, marketing, routine notifications. When alerting, be specific and actionable. Store useful memories about senders and patterns.'
  );
  const [tools, setTools] = useState(['send_alert', 'update_thread', 'ignore_thread']);
  const [silenceHours, setSilenceHours] = useState(48);
  const [tickInterval, setTickInterval] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTool = (toolId: string) => {
    setTools((prev) => prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    if (!systemPrompt.trim()) { setError('System prompt is required'); return; }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.createWatcher({
        name: name.trim(),
        system_prompt: systemPrompt.trim(),
        tools,
        silence_hours: silenceHours,
        tick_interval: tickInterval,
      });
      router.push(`/watchers/${result.watcher.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create watcher');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-page">
      <AppHeader />

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
          <span>→</span>
          <span className="text-gray-900">New Watcher</span>
        </div>

        <h1 className="text-2xl font-display font-semibold text-gray-900 mb-6">Create Watcher</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="panel p-6 space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                id="name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Work Email, Billing Alerts"
                className="input w-full"
              />
            </div>

            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
              <textarea
                id="prompt" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
                rows={6}
                className="input w-full resize-y"
                placeholder="Tell the agent what to watch for, what to ignore, and how to behave..."
              />
              <p className="text-xs text-gray-500 mt-1">This is the instruction set for the AI agent. Be specific about what needs alerting vs ignoring.</p>
            </div>
          </div>

          <div className="panel p-6 space-y-5">
            <h2 className="text-sm font-semibold text-gray-700">Tools</h2>
            <div className="space-y-3">
              {TOOLS.map((tool) => (
                <label key={tool.id} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tools.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                    className="mt-1"
                  />
                  <div>
                    <span className="font-mono text-sm text-gray-900">{tool.id}</span>
                    <p className="text-xs text-gray-500">{tool.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="panel p-6 space-y-5">
            <h2 className="text-sm font-semibold text-gray-700">Thresholds</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="silence" className="block text-sm font-medium text-gray-700 mb-1">Silence Threshold (hours)</label>
                <input
                  id="silence" type="number" value={silenceHours} onChange={(e) => setSilenceHours(parseInt(e.target.value) || 48)}
                  min={1} max={720} className="input w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Alert when a thread goes silent for this long</p>
              </div>
              <div>
                <label htmlFor="tick" className="block text-sm font-medium text-gray-700 mb-1">Tick Interval (minutes)</label>
                <input
                  id="tick" type="number" value={tickInterval} onChange={(e) => setTickInterval(parseInt(e.target.value) || 60)}
                  min={5} max={1440} className="input w-full"
                />
                <p className="text-xs text-gray-500 mt-1">How often the agent reviews active threads</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="btn btn-secondary">Cancel</Link>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary">
              {isSubmitting ? 'Creating...' : 'Create Watcher'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function NewWatcherPage() {
  return (
    <RequireAuth>
      <NewWatcherContent />
    </RequireAuth>
  );
}
