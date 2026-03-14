'use client';

import { useState, useEffect } from 'react';
import { api, type Thread, type Action } from '@/lib/api/client';

interface EmailDetailProps {
  thread: Thread;
  watcherId: string;
  onClose: () => void;
  onStatusChange: (threadId: string, status: Thread['status']) => void;
}

type ActionTab = 'thread' | 'all';

const TIMEZONE_OPTIONS = [
  { value: 'browser', label: 'Browser Timezone' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
];

function formatFullTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  });
}

function formatFullTimestamp(isoDate: string, timezone: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;

  const normalizedTimezone = timezone === 'browser' ? undefined : timezone;

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: normalizedTimezone,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function statusBadgeClass(status: Thread['status']) {
  switch (status) {
    case 'active': return 'badge-ok';
    case 'watching': return 'badge-warning';
    case 'resolved': return 'badge-neutral';
    case 'ignored': return 'badge-inactive';
    default: return 'badge-neutral';
  }
}

const STATUSES: Thread['status'][] = ['active', 'watching', 'resolved', 'ignored'];

export function EmailDetail({ thread, watcherId, onClose, onStatusChange }: EmailDetailProps) {
  const [threadActions, setThreadActions] = useState<Action[]>([]);
  const [allActions, setAllActions] = useState<Action[]>([]);
  const [tab, setTab] = useState<ActionTab>('thread');
  const [timezone, setTimezone] = useState('browser');
  const [loadingActions, setLoadingActions] = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('vigil.dashboard.timezone');
    if (saved) setTimezone(saved);
  }, []);

  const handleTimezoneChange = (value: string) => {
    setTimezone(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('vigil.dashboard.timezone', value);
    }
  };

  useEffect(() => {
    setLoadingActions(true);
    Promise.all([
      api.getActions(watcherId, { threadId: thread.id, limit: 20 }),
      api.getActions(watcherId, { limit: 100 }),
    ])
      .then(([threadRes, allRes]) => {
        setThreadActions(threadRes.actions || []);
        setAllActions(allRes.actions || []);
      })
      .catch(() => {
        setThreadActions([]);
        setAllActions([]);
      })
      .finally(() => setLoadingActions(false));
  }, [watcherId, thread.id]);

  const handleStatusChange = async (newStatus: Thread['status']) => {
    if (newStatus === thread.status) return;
    setChangingStatus(newStatus);
    try {
      await api.updateThread(watcherId, thread.id, { status: newStatus });
      onStatusChange(thread.id, newStatus);
    } catch {
      // ignore
    } finally {
      setChangingStatus(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-page">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-200 bg-surface-raised">
        <button
          onClick={onClose}
          className="shrink-0 mt-0.5 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {thread.subject || 'No subject'}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`badge badge-sm ${statusBadgeClass(thread.status)}`}>{thread.status}</span>
            <span className="text-xs text-gray-400">{thread.email_count} email{thread.email_count !== 1 ? 's' : ''}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-400">{formatFullTime(thread.last_activity)}</span>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Thread info */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="data-label mb-1">Participants</div>
              <div className="text-gray-700 space-y-0.5">
                {thread.participants.slice(0, 5).map((p, i) => (
                  <div key={i} className="truncate">{p}</div>
                ))}
                {thread.participants.length > 5 && (
                  <div className="text-gray-400">+{thread.participants.length - 5} more</div>
                )}
              </div>
            </div>
            <div>
              <div className="data-label mb-1">Timeline</div>
              <div className="text-gray-600 space-y-0.5">
                <div>First: {formatFullTime(thread.first_seen)}</div>
                <div>Last: {formatFullTime(thread.last_activity)}</div>
              </div>
            </div>
          </div>

          {thread.summary && (
            <div className="mt-3">
              <div className="data-label mb-1">Agent Summary</div>
              <p className="text-sm text-gray-700 bg-surface-sunken rounded px-3 py-2">{thread.summary}</p>
            </div>
          )}
        </div>

        {/* Status controls */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="data-label mb-2">Change Status</div>
          <div className="flex gap-1.5 flex-wrap">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={changingStatus !== null}
                className={`btn btn-sm btn-xs capitalize transition-all ${
                  thread.status === s
                    ? 'btn-primary'
                    : 'btn-secondary'
                } disabled:opacity-50`}
              >
                {changingStatus === s ? <span className="spinner-sm" /> : s}
              </button>
            ))}
          </div>
        </div>

        {/* Recent actions */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="data-label">Agent Actions</div>
            <select
              value={timezone}
              onChange={(e) => handleTimezoneChange(e.target.value)}
              className="input max-w-56 py-1.5 text-xs"
              aria-label="Timezone"
            >
              {TIMEZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setTab('thread')}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${tab === 'thread' ? 'bg-vigil-900 text-white font-medium' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
            >
              Thread Recent
            </button>
            <button
              onClick={() => setTab('all')}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${tab === 'all' ? 'bg-vigil-900 text-white font-medium' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
            >
              All Actions
            </button>
          </div>

          {loadingActions ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="spinner-sm" /> Loading...
            </div>
          ) : (
            <div className="space-y-2">
              {(tab === 'thread' ? threadActions : allActions).length === 0 && (
                <p className="text-xs text-gray-400">
                  {tab === 'thread'
                    ? 'No actions recorded yet for this thread.'
                    : 'No actions recorded yet for this watcher.'}
                </p>
              )}
              {(tab === 'thread' ? threadActions : allActions).map((action) => (
                <div key={action.id} className="panel-inset px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-medium text-gray-700 capitalize">{action.tool || action.trigger_type}</span>
                    <span className={`badge badge-sm ${action.result === 'success' ? 'badge-ok' : 'badge-critical'}`}>
                      {action.result}
                    </span>
                  </div>
                  <div className="text-gray-500 mb-1">{formatFullTimestamp(action.created_at, timezone)}</div>
                  <div className="text-gray-500 mb-1 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span>trigger: {action.trigger_type}</span>
                    {action.model && <span>model: {action.model}</span>}
                    {action.duration_ms !== null && action.duration_ms !== undefined && <span>duration: {action.duration_ms}ms</span>}
                    {action.context_tokens !== null && action.context_tokens !== undefined && <span>tokens: {action.context_tokens}</span>}
                    {action.cost_usd !== null && action.cost_usd !== undefined && <span>cost: ${Number(action.cost_usd).toFixed(4)}</span>}
                  </div>
                  {action.decision && (
                    <p className="text-gray-600">decision: {action.decision}</p>
                  )}
                  {action.memory_delta && (
                    <p className="text-gray-500 mt-0.5">memory: {action.memory_delta}</p>
                  )}
                  {action.error && (
                    <p className="text-red-600 mt-0.5">error: {action.error}</p>
                  )}
                  {action.tool_params && (
                    <pre className="text-gray-500 mt-1 whitespace-pre-wrap break-words">params: {JSON.stringify(action.tool_params)}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
