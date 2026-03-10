'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth, RequireAuth } from '@/lib/auth';
import { useRealtimeData } from '@/lib/hooks/use-realtime-data';
import { AppHeader } from '@/components/layout';
import type { Thread } from '@/lib/api/client';

function formatRelative(isoDate: string): string {
  const now = Date.now();
  const diff = now - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatTime(timestamp: number | null): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function threadStatusBadge(status: Thread['status']) {
  switch (status) {
    case 'active': return 'badge-ok';
    case 'watching': return 'badge-warning';
    case 'resolved': return 'badge-neutral';
    case 'ignored': return 'badge-inactive';
    default: return 'badge-neutral';
  }
}

function DashboardContent() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const {
    watchers, threads, isLoading, isPolling, hasNewData, error, lastUpdated, refresh, clearNewDataIndicator,
  } = useRealtimeData({ pollInterval: 10000, enabled: true, pauseWhenHidden: true });

  const allThreads = Object.entries(threads).flatMap(([watcherId, threadList]) =>
    threadList.map((t) => ({
      ...t,
      watcherId,
      watcherName: watchers.find((w) => w.id === watcherId)?.name || 'Unknown',
    }))
  );

  const activeThreads = allThreads.filter((t) => t.status === 'active');
  const watchingThreads = allThreads.filter((t) => t.status === 'watching');

  const sortedThreads = [...allThreads]
    .filter((t) => t.status === 'active' || t.status === 'watching')
    .sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime());

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard?.writeText(text); } catch { /* noop */ }
  };

  return (
    <div className="min-h-screen bg-surface-page flex flex-col">
      <AppHeader />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h1 className="text-xl sm:text-2xl font-display font-semibold text-gray-900">Dashboard</h1>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500">
                {lastUpdated && (
                  <><span className="text-gray-400">Updated</span>
                  <span className="font-medium text-gray-600 tabular-nums">{formatTime(lastUpdated)}</span></>
                )}
              </div>
              <button
                onClick={refresh}
                disabled={isPolling}
                className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:cursor-default transition-colors"
                title={isPolling ? 'Syncing...' : 'Refresh'}
              >
                <svg className={`w-5 h-5 ${isPolling ? 'animate-spin-slow text-gray-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-sm sm:text-base text-gray-600">
            {user?.email ? `Logged in as ${user.email}` : 'Email oversight dashboard'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-900 mb-0.5">Error loading data</h3>
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <button onClick={refresh} className="text-sm text-red-600 hover:text-red-700 font-medium">Retry</button>
            </div>
          </div>
        )}

        {/* New data banner */}
        {hasNewData && (
          <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">New updates available</span>
            <button onClick={clearNewDataIndicator} className="text-sm text-blue-600 hover:text-blue-700 font-medium">Dismiss</button>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="panel p-8 text-center">
            <div className="spinner mx-auto mb-4" />
            <p className="text-sm text-gray-600">Loading watchers...</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && watchers.length === 0 && (
          <div className="panel p-8 text-center">
            <h2 className="font-display font-semibold text-gray-900 mb-2">No watchers yet</h2>
            <p className="text-sm text-gray-600 mb-6">Create a watcher to start monitoring email.</p>
            <Link href="/watchers/new" className="btn btn-primary">Create watcher</Link>
          </div>
        )}

        {/* Main content */}
        {!isLoading && watchers.length > 0 && (
          <div className="space-y-6 sm:space-y-8">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="panel p-3 sm:p-4">
                <div className="text-2xs sm:text-xs uppercase tracking-wider text-gray-500 mb-1">Watchers</div>
                <div className="text-xl sm:text-2xl font-display font-semibold text-gray-900 tabular-nums">{watchers.length}</div>
              </div>
              <div className="panel p-3 sm:p-4">
                <div className="text-2xs sm:text-xs uppercase tracking-wider text-gray-500 mb-1">Active Threads</div>
                <div className="text-xl sm:text-2xl font-display font-semibold text-gray-900 tabular-nums">{activeThreads.length}</div>
              </div>
              <div className="panel p-3 sm:p-4">
                <div className="text-2xs sm:text-xs uppercase tracking-wider text-gray-500 mb-1">Watching</div>
                <div className="text-xl sm:text-2xl font-display font-semibold text-gray-700 tabular-nums">{watchingThreads.length}</div>
              </div>
              <div className="panel p-3 sm:p-4">
                <div className="text-2xs sm:text-xs uppercase tracking-wider text-gray-500 mb-1">All Threads</div>
                <div className="text-xl sm:text-2xl font-display font-semibold text-gray-900 tabular-nums">{allThreads.length}</div>
              </div>
            </div>

            {/* Watchers */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-gray-700">Watchers</h2>
                <Link href="/watchers/new" className="text-sm link">+ New watcher</Link>
              </div>

              <div className="panel overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="table-header">Name</th>
                      <th className="table-header">Ingest Address</th>
                      <th className="table-header text-center">Status</th>
                      <th className="table-header text-right">Threads</th>
                      <th className="table-header text-right">Tools</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchers.map((watcher) => {
                      const watcherThreads = threads[watcher.id] || [];
                      const active = watcherThreads.filter((t) => t.status === 'active').length;
                      const isExpanded = !!expanded[watcher.id];

                      return (
                        <React.Fragment key={watcher.id}>
                          <tr className="table-row">
                            <td className="table-cell font-medium text-gray-900">
                              <button
                                onClick={() => setExpanded((prev) => ({ ...prev, [watcher.id]: !prev[watcher.id] }))}
                                className="inline-flex items-center gap-2 text-left hover:text-gray-900"
                              >
                                <svg className={`h-3.5 w-3.5 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                </svg>
                                {watcher.name}
                              </button>
                            </td>
                            <td className="table-cell font-mono text-xs text-gray-600">{watcher.ingestion_address}</td>
                            <td className="table-cell text-center">
                              <span className={`badge ${watcher.status === 'active' ? 'badge-ok' : watcher.status === 'paused' ? 'badge-paused' : 'badge-inactive'}`}>
                                {watcher.status}
                              </span>
                            </td>
                            <td className="table-cell text-right tabular-nums font-mono">{active}/{watcherThreads.length}</td>
                            <td className="table-cell text-right tabular-nums font-mono">{watcher.tools.length}</td>
                            <td className="table-cell text-right">
                              <Link href={`/watchers/${watcher.id}`} className="text-sm link">View</Link>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td className="table-cell" colSpan={6}>
                                <div className="p-4 bg-surface-sunken border border-gray-200 rounded space-y-4">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                      <div className="data-label mb-1">Ingest Address</div>
                                      <div className="flex items-center gap-2">
                                        <code className="text-xs font-mono text-gray-700 truncate">{watcher.ingestion_address}</code>
                                        <button className="btn btn-secondary btn-sm" onClick={() => copyToClipboard(watcher.ingestion_address)}>Copy</button>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="data-label mb-1">Silence Threshold</div>
                                      <div className="data-value">{watcher.silence_hours}h</div>
                                    </div>
                                    <div>
                                      <div className="data-label mb-1">Tick Interval</div>
                                      <div className="data-value">{watcher.tick_interval}m</div>
                                    </div>
                                    <div>
                                      <div className="data-label mb-1">Tools</div>
                                      <div className="flex flex-wrap gap-1">
                                        {watcher.tools.map((t) => (
                                          <span key={t} className="badge badge-sm badge-neutral">{t}</span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                  {watcher.system_prompt && (
                                    <div>
                                      <div className="data-label mb-1">System Prompt</div>
                                      <p className="text-sm text-gray-600 bg-surface-inset p-3 rounded">{watcher.system_prompt}</p>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Threads */}
            {sortedThreads.length > 0 && (
              <section>
                <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-gray-700 mb-3">Threads</h2>

                <div className="panel overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th className="table-header">Subject</th>
                        <th className="table-header">Watcher</th>
                        <th className="table-header">Participants</th>
                        <th className="table-header text-center">Status</th>
                        <th className="table-header text-right">Emails</th>
                        <th className="table-header text-right">Last Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedThreads.slice(0, 20).map((thread) => (
                        <tr key={thread.id} className="table-row">
                          <td className="table-cell">
                            <Link href={`/watchers/${thread.watcherId}`} className="font-medium text-gray-900 hover:text-blue-600 truncate block max-w-xs">
                              {thread.subject || 'No subject'}
                            </Link>
                            {thread.summary && (
                              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{thread.summary}</p>
                            )}
                          </td>
                          <td className="table-cell text-sm text-gray-600">{thread.watcherName}</td>
                          <td className="table-cell text-sm text-gray-600">
                            {thread.participants.slice(0, 2).join(', ')}
                            {thread.participants.length > 2 && ` +${thread.participants.length - 2}`}
                          </td>
                          <td className="table-cell text-center">
                            <span className={`badge badge-sm ${threadStatusBadge(thread.status)}`}>{thread.status}</span>
                          </td>
                          <td className="table-cell text-right tabular-nums font-mono">{thread.email_count}</td>
                          <td className="table-cell text-right text-sm text-gray-500 tabular-nums">{formatRelative(thread.last_activity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sortedThreads.length > 20 && (
                    <div className="px-4 py-3 border-t border-gray-200 text-center text-sm text-gray-500">
                      Showing 20 of {sortedThreads.length} threads
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 mt-auto bg-surface-page">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-sm text-gray-500">
            <p>© {new Date().getFullYear()} Vigil. All rights reserved.</p>
            <div className="flex gap-4">
              <Link href="/learn/watchers" className="hover:text-gray-700">Docs</Link>
              <Link href="/learn/security" className="hover:text-gray-700">Security</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
