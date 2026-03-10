'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/lib/auth';
import { AppHeader } from '@/components/layout';
import { api, type Watcher, type Thread, type Action, type Memory } from '@/lib/api';

function formatRelative(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'active': return 'badge-ok';
    case 'watching': return 'badge-warning';
    case 'resolved': return 'badge-neutral';
    case 'ignored': return 'badge-inactive';
    default: return 'badge-neutral';
  }
}

function WatcherDetailContent() {
  const params = useParams();
  const watcherId = params.id as string;

  const [watcher, setWatcher] = useState<Watcher | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [activeTab, setActiveTab] = useState<'threads' | 'activity' | 'memory' | 'settings'>('threads');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [watcherRes, threadsRes, actionsRes, memoryRes] = await Promise.all([
          api.getWatcher(watcherId),
          api.getThreads(watcherId),
          api.getActions(watcherId).catch(() => ({ actions: [] })),
          api.getMemories(watcherId).catch(() => ({ memories: [] })),
        ]);
        setWatcher(watcherRes.watcher);
        setThreads(threadsRes.threads || []);
        setActions(actionsRes.actions || []);
        setMemories(memoryRes.memories || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load watcher');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [watcherId]);

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard?.writeText(text); } catch { /* noop */ }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-page">
        <AppHeader />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="panel p-8 text-center"><div className="spinner mx-auto mb-4" /><p className="text-sm text-gray-600">Loading watcher...</p></div>
        </main>
      </div>
    );
  }

  if (error || !watcher) {
    return (
      <div className="min-h-screen bg-surface-page">
        <AppHeader />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="panel p-8 text-center">
            <h2 className="font-semibold text-gray-900 mb-2">Error</h2>
            <p className="text-sm text-gray-600 mb-4">{error || 'Watcher not found'}</p>
            <Link href="/dashboard" className="btn btn-primary">Back to dashboard</Link>
          </div>
        </main>
      </div>
    );
  }

  const activeThreads = threads.filter((t) => t.status === 'active');
  const watchingThreads = threads.filter((t) => t.status === 'watching');

  return (
    <div className="min-h-screen bg-surface-page">
      <AppHeader />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
            <span>→</span>
            <span className="text-gray-900">{watcher.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-semibold text-gray-900 flex items-center gap-3">
                {watcher.name}
                <span className={`badge ${watcher.status === 'active' ? 'badge-ok' : 'badge-inactive'}`}>{watcher.status}</span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm font-mono text-gray-500">{watcher.ingestion_address}</code>
                <button className="text-xs text-vigil-700 hover:text-vigil-800" onClick={() => copyToClipboard(watcher.ingestion_address)}>Copy</button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="panel p-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Active</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{activeThreads.length}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Watching</div>
            <div className="text-xl font-semibold text-gray-700 tabular-nums">{watchingThreads.length}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Emails</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{threads.reduce((s, t) => s + t.email_count, 0)}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Memories</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{memories.length}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Actions</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{actions.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {(['threads', 'activity', 'memory', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? 'border-vigil-600 text-vigil-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Threads Tab */}
        {activeTab === 'threads' && (
          <div className="panel overflow-x-auto">
            {threads.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No threads yet. Forward an email to {watcher.ingestion_address} to get started.</div>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="table-header">Subject</th>
                    <th className="table-header">Participants</th>
                    <th className="table-header text-center">Status</th>
                    <th className="table-header text-right">Emails</th>
                    <th className="table-header text-right">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {threads
                    .sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime())
                    .map((thread) => (
                    <tr key={thread.id} className="table-row">
                      <td className="table-cell">
                        <div className="font-medium text-gray-900">{thread.subject || 'No subject'}</div>
                        {thread.summary && <p className="text-xs text-gray-500 mt-0.5 max-w-md truncate">{thread.summary}</p>}
                      </td>
                      <td className="table-cell text-sm text-gray-600">{thread.participants.join(', ')}</td>
                      <td className="table-cell text-center"><span className={`badge badge-sm ${statusBadge(thread.status)}`}>{thread.status}</span></td>
                      <td className="table-cell text-right tabular-nums font-mono">{thread.email_count}</td>
                      <td className="table-cell text-right text-sm text-gray-500 tabular-nums">{formatRelative(thread.last_activity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="panel overflow-x-auto">
            {actions.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No agent activity yet.</div>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="table-header">When</th>
                    <th className="table-header">Trigger</th>
                    <th className="table-header">Tool</th>
                    <th className="table-header text-center">Result</th>
                    <th className="table-header">Decision</th>
                    <th className="table-header text-right">Cost</th>
                    <th className="table-header text-right">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((action) => (
                    <tr key={action.id} className="table-row">
                      <td className="table-cell text-sm text-gray-500 tabular-nums">{formatRelative(action.created_at)}</td>
                      <td className="table-cell"><span className="badge badge-sm badge-neutral">{action.trigger_type}</span></td>
                      <td className="table-cell font-mono text-sm">{action.tool || '—'}</td>
                      <td className="table-cell text-center">
                        <span className={`badge badge-sm ${action.result === 'success' ? 'badge-ok' : 'badge-critical'}`}>{action.result}</span>
                      </td>
                      <td className="table-cell text-sm text-gray-600 max-w-xs truncate">{action.decision || '—'}</td>
                      <td className="table-cell text-right text-sm text-gray-500 tabular-nums">${action.cost_usd?.toFixed(4) || '—'}</td>
                      <td className="table-cell text-right text-sm text-gray-500 tabular-nums">{action.duration_ms ? `${action.duration_ms}ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Memory Tab */}
        {activeTab === 'memory' && (
          <div className="space-y-2">
            {memories.length === 0 ? (
              <div className="panel p-8 text-center text-sm text-gray-500">Agent has no memories yet. It will start remembering after processing emails.</div>
            ) : (
              memories.map((mem) => (
                <div key={mem.id} className={`panel p-4 ${mem.obsolete ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm text-gray-800 flex-1">{mem.content}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">importance: {mem.importance}/5</span>
                      <span className="text-xs text-gray-400">{formatRelative(mem.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="panel p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">System Prompt</h3>
              <div className="bg-surface-sunken p-4 rounded text-sm text-gray-700 whitespace-pre-wrap">{watcher.system_prompt}</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="data-label mb-1">Silence Threshold</div>
                <div className="text-lg font-semibold text-gray-900">{watcher.silence_hours}h</div>
              </div>
              <div>
                <div className="data-label mb-1">Tick Interval</div>
                <div className="text-lg font-semibold text-gray-900">{watcher.tick_interval}m</div>
              </div>
              <div>
                <div className="data-label mb-1">Template</div>
                <div className="text-sm text-gray-600">{watcher.template_id || 'Custom'}</div>
              </div>
              <div>
                <div className="data-label mb-1">Created</div>
                <div className="text-sm text-gray-600">{new Date(watcher.created_at).toLocaleDateString()}</div>
              </div>
            </div>
            <div>
              <div className="data-label mb-2">Enabled Tools</div>
              <div className="flex flex-wrap gap-2">
                {watcher.tools.map((t) => (
                  <span key={t} className="badge badge-neutral">{t}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="data-label mb-1">Ingest Address</div>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono text-gray-700">{watcher.ingestion_address}</code>
                <button className="btn btn-secondary btn-sm" onClick={() => copyToClipboard(watcher.ingestion_address)}>Copy</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function WatcherDetailPage() {
  return (
    <RequireAuth>
      <WatcherDetailContent />
    </RequireAuth>
  );
}
