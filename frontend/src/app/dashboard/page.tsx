'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth, RequireAuth } from '@/lib/auth';
import { useRealtimeData } from '@/lib/hooks/use-realtime-data';
import { AppHeader } from '@/components/layout';
import { getSilenceState, computeSilenceDuration, formatSilenceDuration } from '@/lib/silence';

// Default silence threshold in hours
const DEFAULT_SILENCE_THRESHOLD_HOURS = 24;

function DashboardContent() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const {
    watchers,
    threads,
    isLoading,
    isPolling,
    hasNewData,
    error,
    lastUpdated,
    refresh,
    clearNewDataIndicator,
  } = useRealtimeData({
    pollInterval: 5000,
    enabled: true,
    pauseWhenHidden: true,
  });

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelative = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const formatLastUpdatedTime = (timestamp: number | null) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const allThreads = Object.entries(threads).flatMap(([watcherId, threadList]) =>
    threadList.map((t) => ({
      ...t,
      watcherId,
      watcherName: watchers.find((w) => w.watcher_id === watcherId)?.name || 'Unknown',
    }))
  );

  const openThreads = allThreads.filter((t) => t.status === 'open');

  // Compute silence state for each thread
  const now = Date.now();
  const threadsWithSilence = openThreads.map((t) => {
    const thresholdHours = watchers.find(w => w.watcher_id === t.watcherId)?.policy?.silence_threshold_hours || DEFAULT_SILENCE_THRESHOLD_HOURS;
    const silenceState = getSilenceState({
      lastActivityAt: t.last_activity_at,
      status: t.status,
      thresholdHours,
      now,
    });
    const silenceDuration = computeSilenceDuration(t.last_activity_at, now);
    return { ...t, silenceState, silenceDuration, thresholdHours };
  });

  const silentThreads = threadsWithSilence.filter((t) => t.silenceState === 'silent');

  // Sort threads: silent first (longest silence first), then active (most recent first)
  const sortedThreads = [...threadsWithSilence].sort((a, b) => {
    if (a.silenceState === 'silent' && b.silenceState !== 'silent') return -1;
    if (a.silenceState !== 'silent' && b.silenceState === 'silent') return 1;
    if (a.silenceState === 'silent' && b.silenceState === 'silent') {
      return b.silenceDuration - a.silenceDuration; // Longest silence first
    }
    return b.last_activity_at - a.last_activity_at; // Most recent first
  });

  const toggleWatcher = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // noop fallback
    }
  };

  return (
    <div className="min-h-screen bg-surface-page flex flex-col">
      <AppHeader />

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Page Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h1 className="text-xl sm:text-2xl font-display font-semibold text-gray-900">
              Dashboard
            </h1>
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Last updated - hidden on mobile, visible on sm+ */}
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500">
                {lastUpdated && (
                  <>
                    <span className="text-gray-400">Updated</span>
                    <span className="font-medium text-gray-600 tabular-nums">
                      {formatLastUpdatedTime(lastUpdated)}
                    </span>
                  </>
                )}
              </div>
              {/* Refresh button */}
              <button
                onClick={refresh}
                disabled={isPolling}
                className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:cursor-default transition-colors"
                title={isPolling ? 'Syncing...' : 'Refresh'}
                aria-label={isPolling ? 'Syncing data' : 'Refresh data'}
              >
                <svg
                  className={`w-5 h-5 ${isPolling ? 'animate-spin-slow text-gray-400' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-sm sm:text-base text-gray-600">
            {user?.email ? `Logged in as ${user.email}` : 'Overview of your monitored communications'}
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-red-900 mb-0.5">Error loading data</h3>
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <button
                onClick={refresh}
                className="text-sm text-red-600 hover:text-red-700 font-medium flex-shrink-0"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* New Data Banner */}
        {hasNewData && (
          <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-blue-900">
                  New updates available
                </span>
              </div>
              <button
                onClick={clearNewDataIndicator}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="panel p-8">
            <div className="max-w-md mx-auto text-center">
              <div className="spinner mx-auto mb-4" />
              <p className="text-sm text-gray-600">Loading watchers...</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && watchers.length === 0 && (
          <div className="panel p-8">
            <div className="max-w-md mx-auto text-center">
              <Link
                href="/watchers/new"
                aria-label="Create watcher"
                className="w-12 h-12 bg-surface-sunken rounded border border-gray-200 flex items-center justify-center mx-auto mb-4 hover:border-blue-300 hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </Link>
              <h2 className="font-display font-semibold text-gray-900 mb-2">No watchers configured</h2>
              <p className="text-sm text-gray-600 mb-6">
                Create a watcher to begin monitoring communication threads for silence.
              </p>
              <Link href="/watchers/new" className="btn btn-primary">
                Create watcher
              </Link>
            </div>
          </div>
        )}

        {/* Main Content - when data exists */}
        {!isLoading && watchers.length > 0 && (
          <div className="space-y-6 sm:space-y-8">
            {/* Summary Stats Grid - 2x2 on mobile, 4 columns on sm+ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="panel p-3 sm:p-4">
                <div className="text-2xs sm:text-xs uppercase tracking-wider text-gray-500 mb-1">Watchers</div>
                <div className="text-xl sm:text-2xl font-display font-semibold text-gray-900 font-mono tabular-nums">{watchers.length}</div>
              </div>
              <div className="panel p-3 sm:p-4">
                <div className="text-2xs sm:text-xs uppercase tracking-wider text-gray-500 mb-1">Open Threads</div>
                <div className="text-xl sm:text-2xl font-display font-semibold text-gray-900 font-mono tabular-nums">{openThreads.length}</div>
              </div>
              <div className="panel p-3 sm:p-4">
                <div className="text-2xs sm:text-xs uppercase tracking-wider text-gray-500 mb-1">Silent Threads</div>
                <div className="text-xl sm:text-2xl font-display font-semibold text-gray-700 font-mono tabular-nums">{silentThreads.length}</div>
              </div>
              <div className="panel p-3 sm:p-4">
                <div className="text-2xs sm:text-xs uppercase tracking-wider text-gray-500 mb-1">All Threads</div>
                <div className="text-xl sm:text-2xl font-display font-semibold text-gray-900 font-mono tabular-nums">{allThreads.length}</div>
              </div>
            </div>

            {/* Watchers Section */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-gray-700">
                  Watchers
                </h2>
                <Link href="/watchers/new" className="text-sm link">
                  + New watcher
                </Link>
              </div>

              {/* Mobile: Card layout */}
              <div className="sm:hidden space-y-3">
                {watchers.map((watcher) => {
                  const watcherThreads = threads[watcher.watcher_id] || [];
                  const open = watcherThreads.filter((t) => t.status === 'open');
                  const thresholdHours = watcher.policy?.silence_threshold_hours || DEFAULT_SILENCE_THRESHOLD_HOURS;
                  const silent = open.filter((t) =>
                    getSilenceState({ lastActivityAt: t.last_activity_at, status: t.status, thresholdHours, now }) === 'silent'
                  );
                  const isExpanded = !!expanded[watcher.watcher_id];

                  return (
                    <div key={watcher.watcher_id} className="panel">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggleWatcher(watcher.watcher_id)}
                        className="w-full p-4 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-gray-900 truncate">{watcher.name}</span>
                              <span className={`badge badge-sm ${
                                watcher.status === 'active' ? 'badge-ok' :
                                watcher.status === 'created' ? 'badge-created' :
                                watcher.status === 'paused' ? 'badge-paused' :
                                'badge-inactive'
                              }`}>
                                {watcher.status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 font-mono truncate">
                              {watcher.ingestion_address}
                            </div>
                          </div>
                          <svg
                            className={`h-4 w-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-sm">
                          <div>
                            <span className="text-gray-500">Open:</span>{' '}
                            <span className="font-mono tabular-nums text-gray-900">{open.length}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Silent:</span>{' '}
                            <span className={`font-mono tabular-nums ${silent.length > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                              {silent.length}
                            </span>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100 p-4 bg-surface-sunken/50">
                          <div className="space-y-4">
                            <div>
                              <div className="data-label mb-1.5">Ingest Address</div>
                              <div className="flex items-center gap-2">
                                <code className="flex-1 px-2 py-1.5 bg-surface-inset border border-gray-200 rounded text-xs font-mono text-gray-700 truncate">
                                  {watcher.ingestion_address}
                                </code>
                                <button
                                  className="btn btn-secondary btn-sm flex-shrink-0"
                                  onClick={(e) => { e.stopPropagation(); copyToClipboard(watcher.ingestion_address); }}
                                >
                                  Copy
                                </button>
                              </div>
                            </div>

                            {open.length > 0 && (
                              <div>
                                <div className="data-label mb-2">Recent Threads</div>
                                <div className="space-y-2">
                                  {open
                                    .sort((a, b) => b.last_activity_at - a.last_activity_at)
                                    .slice(0, 3)
                                    .map((t) => (
                                      <Link
                                        key={t.thread_id}
                                        href={`/watchers/${watcher.watcher_id}`}
                                        className="flex items-center justify-between gap-2 p-2 -mx-2 rounded hover:bg-surface-sunken transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <span className="truncate text-sm text-gray-900">{t.subject || 'No subject'}</span>
                                        <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">{formatRelative(t.last_activity_at)}</span>
                                      </Link>
                                    ))}
                                </div>
                              </div>
                            )}

                            <Link
                              href={`/watchers/${watcher.watcher_id}`}
                              className="btn btn-secondary w-full"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View Watcher
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop: Table layout */}
              <div className="hidden sm:block panel overflow-x-auto">
                <table className="table-base min-w-[700px]">
                  <thead>
                    <tr>
                      <th className="table-header">Name</th>
                      <th className="table-header">Ingest Address</th>
                      <th className="table-header text-center">Status</th>
                      <th className="table-header text-right">Open</th>
                      <th className="table-header text-right">Silent</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchers.map((watcher) => {
                      const watcherThreads = threads[watcher.watcher_id] || [];
                      const open = watcherThreads.filter((t) => t.status === 'open');
                      const thresholdHours = watcher.policy?.silence_threshold_hours || DEFAULT_SILENCE_THRESHOLD_HOURS;
                      const silent = open.filter((t) =>
                        getSilenceState({ lastActivityAt: t.last_activity_at, status: t.status, thresholdHours, now }) === 'silent'
                      );
                      const lastActivity = watcherThreads.length
                        ? new Date(
                            Math.max(...watcherThreads.map((t) => t.last_activity_at))
                          )
                        : null;
                      const isExpanded = !!expanded[watcher.watcher_id];

                      return (
                        <React.Fragment key={watcher.watcher_id}>
                          <tr className="table-row">
                            <td className="table-cell font-medium text-gray-900">
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                onClick={() => toggleWatcher(watcher.watcher_id)}
                                className="inline-flex items-center gap-2 text-left hover:text-gray-900"
                              >
                                <svg
                                  className={`h-3.5 w-3.5 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  aria-hidden="true"
                                >
                                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                </svg>
                                <span>{watcher.name}</span>
                              </button>
                            </td>
                            <td className="table-cell font-mono text-xs text-gray-600">
                              {watcher.ingestion_address}
                            </td>
                            <td className="table-cell text-center">
                              <span className={`badge ${
                                watcher.status === 'active' ? 'badge-ok' :
                                watcher.status === 'created' ? 'badge-created' :
                                watcher.status === 'paused' ? 'badge-paused' :
                                'badge-inactive'
                              }`}>
                                {watcher.status}
                              </span>
                            </td>
                            <td className="table-cell text-right tabular-nums font-mono">
                              {open.length}
                            </td>
                            <td className="table-cell text-right tabular-nums font-mono">
                              {silent.length > 0 ? (
                                <span className="text-gray-700 font-medium">{silent.length}</span>
                              ) : (
                                <span className="text-gray-400">0</span>
                              )}
                            </td>
                            <td className="table-cell text-right">
                              <Link
                                href={`/watchers/${watcher.watcher_id}`}
                                className="text-sm link"
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td className="table-cell" colSpan={6}>
                                <div className="p-4 bg-surface-sunken border border-gray-200 rounded">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                      <div>
                                        <div className="data-label mb-1.5">Ingest Address</div>
                                        <div className="flex items-center gap-2">
                                          <code className="px-2 py-1.5 bg-surface-inset border border-gray-200 rounded text-xs font-mono text-gray-700 truncate max-w-[240px]">
                                            {watcher.ingestion_address}
                                          </code>
                                          <button className="btn btn-secondary btn-sm flex-shrink-0" onClick={() => copyToClipboard(watcher.ingestion_address)}>
                                            Copy
                                          </button>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-3 gap-4">
                                        <div>
                                          <div className="data-label mb-1">Open</div>
                                          <div className="data-value font-mono tabular-nums">{open.length}</div>
                                        </div>
                                        <div>
                                          <div className="data-label mb-1">Silent</div>
                                          <div className="data-value text-gray-700 font-mono tabular-nums">{silent.length}</div>
                                        </div>
                                        <div>
                                          <div className="data-label mb-1">Last Activity</div>
                                          <div className="data-value tabular-nums">{lastActivity ? formatDate(lastActivity.getTime()) : '—'}</div>
                                        </div>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="data-label mb-2">Recent Threads</div>
                                      <div className="space-y-2">
                                        {open
                                          .sort((a, b) => b.last_activity_at - a.last_activity_at)
                                          .slice(0, 3)
                                          .map((t) => (
                                            <div key={t.thread_id} className="flex items-center justify-between gap-3">
                                              <span className="truncate text-sm text-gray-900">{t.subject || 'No subject'}</span>
                                              <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">{formatRelative(t.last_activity_at)}</span>
                                            </div>
                                          ))}
                                        {open.length === 0 && (
                                          <span className="text-sm text-gray-500">No open threads.</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
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

            {/* Open Threads Section */}
            {sortedThreads.length > 0 && (
              <section>
                <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-gray-700 mb-3">
                  Threads
                </h2>

                {/* Mobile: Card layout */}
                <div className="sm:hidden space-y-3">
                  {sortedThreads
                    .slice(0, 10)
                    .map((thread) => (
                      <Link
                        key={thread.thread_id}
                        href={`/watchers/${thread.watcherId}`}
                        className="panel block p-4 hover:bg-surface-sunken/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h3 className="font-medium text-gray-900 truncate flex-1">
                            {thread.subject || 'No subject'}
                          </h3>
                          {thread.silenceState === 'silent' && (
                            <span className="text-xs text-gray-600 px-1.5 py-0.5 bg-gray-100 rounded">
                              silent
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span className="truncate">{thread.watcherName}</span>
                          <span className="text-gray-300">·</span>
                          <span className="tabular-nums flex-shrink-0">
                            {thread.silenceState === 'silent'
                              ? `No response for ${formatSilenceDuration(thread.silenceDuration)}`
                              : `Last activity ${formatRelative(thread.last_activity_at)}`
                            }
                          </span>
                        </div>
                      </Link>
                    ))}
                  {openThreads.length > 10 && (
                    <div className="text-center py-2">
                      <span className="text-sm text-gray-500">
                        Showing <span className="font-mono">10</span> of <span className="font-mono">{openThreads.length}</span> open threads
                      </span>
                    </div>
                  )}
                </div>

                {/* Desktop: Table layout */}
                <div className="hidden sm:block panel overflow-x-auto">
                  <table className="table-base min-w-[600px] table-auto">
                    <thead>
                      <tr>
                        <th className="table-header">Subject</th>
                        <th className="table-header">Watcher</th>
                        <th className="table-header">Silence Duration</th>
                        <th className="table-header text-center">State</th>
                        <th className="table-header"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedThreads
                        .slice(0, 10)
                        .map((thread) => (
                          <tr key={thread.thread_id} className="table-row">
                            <td className="table-cell">
                              <Link
                                href={`/watchers/${thread.watcherId}`}
                                className="font-medium text-gray-900 hover:text-blue-600 truncate block max-w-xs"
                              >
                                {thread.subject || 'No subject'}
                              </Link>
                            </td>
                            <td className="table-cell text-sm text-gray-600">
                              <Link href={`/watchers/${thread.watcherId}`} className="hover:text-gray-900">
                                {thread.watcherName}
                              </Link>
                            </td>
                            <td className="table-cell text-sm text-gray-600 tabular-nums">
                              {thread.silenceState === 'silent'
                                ? `No response for ${formatSilenceDuration(thread.silenceDuration)}`
                                : `${formatRelative(thread.last_activity_at)}`
                              }
                            </td>
                            <td className="table-cell text-center">
                              {thread.silenceState === 'silent' ? (
                                <span className="text-xs text-gray-600 px-1.5 py-0.5 bg-gray-100 rounded">
                                  silent
                                </span>
                              ) : (
                                <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-gray-50 rounded">
                                  active
                                </span>
                              )}
                            </td>
                            <td className="table-cell text-right">
                              <Link
                                href={`/watchers/${thread.watcherId}`}
                                className="text-sm text-blue-600 hover:text-blue-700"
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {openThreads.length > 10 && (
                    <div className="px-4 py-3 border-t border-gray-200 text-center">
                      <span className="text-sm text-gray-500">
                        Showing <span className="font-mono">10</span> of <span className="font-mono">{openThreads.length}</span> open threads
                      </span>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Footer - Simplified for mobile */}
      <footer className="border-t border-gray-200 mt-auto bg-surface-page">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          {/* Mobile: Simplified footer */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="font-display font-semibold text-gray-900">Vigil</p>
                <p className="text-xs text-gray-500 mt-1">
                  Communication silence monitoring
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-500 mb-6">
              <Link href="/pricing" className="hover:text-gray-700">Pricing</Link>
              <Link href="/learn/watchers" className="hover:text-gray-700">Docs</Link>
              <Link href="/privacy" className="hover:text-gray-700">Privacy</Link>
              <Link href="/terms" className="hover:text-gray-700">Terms</Link>
            </div>
            <p className="text-xs text-gray-500">© {new Date().getFullYear()} Vigil</p>
          </div>

          {/* Desktop: Full footer */}
          <div className="hidden sm:block">
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
              <div>
                <p className="font-display font-semibold text-gray-900 mb-2">Vigil</p>
                <p className="text-sm text-gray-500">
                  Communication silence monitoring.<br />
                  Observable state, factual timelines.
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Product</p>
                <ul className="space-y-2 text-sm text-gray-500">
                  <li><Link href="/#how-it-works" className="hover:text-gray-700 transition-colors">How it works</Link></li>
                  <li><Link href="/#features" className="hover:text-gray-700 transition-colors">Features</Link></li>
                  <li><Link href="/pricing" className="hover:text-gray-700 transition-colors">Pricing</Link></li>
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Documentation</p>
                <ul className="space-y-2 text-sm text-gray-500">
                  <li><Link href="/learn/watchers" className="hover:text-gray-700 transition-colors">Watchers</Link></li>
                  <li><Link href="/learn/email-ingestion" className="hover:text-gray-700 transition-colors">Email ingestion</Link></li>
                  <li><Link href="/learn/reminders" className="hover:text-gray-700 transition-colors">Reminders</Link></li>
                  <li><Link href="/learn/architecture" className="hover:text-gray-700 transition-colors">Architecture</Link></li>
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Company</p>
                <ul className="space-y-2 text-sm text-gray-500">
                  <li><Link href="/blog" className="hover:text-gray-700 transition-colors">Blog</Link></li>
                  <li><Link href="/support" className="hover:text-gray-700 transition-colors">Support</Link></li>
                  <li><Link href="/privacy" className="hover:text-gray-700 transition-colors">Privacy</Link></li>
                  <li><Link href="/terms" className="hover:text-gray-700 transition-colors">Terms</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-gray-200 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-sm text-gray-500">
              <p>© {new Date().getFullYear()} Vigil. All rights reserved.</p>
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
