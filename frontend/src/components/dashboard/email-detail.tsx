'use client';

import { useState, useEffect } from 'react';
import { api, type Thread, type Action } from '@/lib/api/client';

interface EmailDetailProps {
  thread: Thread;
  watcherId: string;
  onClose: () => void;
  onStatusChange: (threadId: string, status: Thread['status']) => void;
  onDelete?: (threadId: string) => void;
}

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

export function EmailDetail({ thread, watcherId, onClose, onStatusChange, onDelete }: EmailDetailProps) {
  const [threadActions, setThreadActions] = useState<Action[]>([]);
  const [timezone, setTimezone] = useState('browser');
  const [loadingActions, setLoadingActions] = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const [threadEmails, setThreadEmails] = useState<any[]>([]);

  useEffect(() => {
    setLoadingActions(true);
    // Load both actions and thread detail (which includes emails)
    Promise.all([
      api.getActions(watcherId, { threadId: thread.id, limit: 50 }),
      api.getThread(watcherId, thread.id).catch(() => null),
    ]).then(([actRes, threadRes]) => {
      const actions = (actRes.actions || []).filter(
        (a: Action) => a.trigger_type !== 'user_chat'
      );
      setThreadActions(actions);
      setThreadEmails((threadRes as any)?.emails || []);
    }).catch(() => {
      setThreadActions([]);
    }).finally(() => setLoadingActions(false));
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
    <div className="flex flex-col h-full w-full bg-surface-page">
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
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs mb-3">
            <div>
              <div className="data-label mb-1">Participants</div>
              <div className="text-gray-700">{thread.participants.slice(0, 5).join(', ')}{thread.participants.length > 5 ? ` +${thread.participants.length - 5} more` : ''}</div>
            </div>
            <div>
              <div className="data-label mb-1">First seen</div>
              <div className="text-gray-600">{formatFullTime(thread.first_seen)}</div>
            </div>
            <div>
              <div className="data-label mb-1">Last activity</div>
              <div className="text-gray-600">{formatFullTime(thread.last_activity)}</div>
            </div>
          </div>

          {thread.summary && (
            <div className="mb-3">
              <div className="data-label mb-1">Agent Summary</div>
              <div className="text-sm text-gray-700 bg-surface-sunken rounded px-3 py-2.5 w-full">{thread.summary}</div>
            </div>
          )}

          {/* Email timeline with original + received timestamps */}
          {threadEmails.length > 0 && (
            <div>
              <div className="data-label mb-1.5">Emails</div>
              <div className="space-y-2">
                {threadEmails.map((email: any) => (
                  <div key={email.id} className="panel-inset px-3 py-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-gray-700">{email.from_addr}</div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 text-gray-500 mt-1">
                      {email.original_date && (
                        <span>Sent: {formatFullTimestamp(email.original_date, timezone)}</span>
                      )}
                      {email.recipient_received_at && (
                        <span>Delivered: {formatFullTimestamp(email.recipient_received_at, timezone)}</span>
                      )}
                      <span>Vigil: {formatFullTimestamp(email.received_at, timezone)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status controls + delete */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="data-label">Change Status</div>
            {onDelete && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-gray-400 hover:text-red-600 transition-colors"
              >
                Delete thread
              </button>
            )}
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-2 bg-red-50 rounded px-3 py-2 text-xs">
              <span className="text-red-700">Delete this thread and all its emails?</span>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await api.deleteThread(watcherId, thread.id);
                    onDelete?.(thread.id);
                    onClose();
                  } catch { setDeleting(false); setConfirmDelete(false); }
                }}
                disabled={deleting}
                className="btn btn-sm text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Yes, delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="btn btn-sm btn-secondary text-xs">Cancel</button>
            </div>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={changingStatus !== null}
                  className={`btn btn-sm btn-xs capitalize transition-all ${
                    thread.status === s ? 'btn-primary' : 'btn-secondary'
                  } disabled:opacity-50`}
                >
                  {changingStatus === s ? <span className="spinner-sm" /> : s}
                </button>
              ))}
            </div>
          )}
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

          {loadingActions ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="spinner-sm" /> Loading...
            </div>
          ) : (
            <div className="space-y-2">
              {threadActions.length === 0 && (
                <p className="text-xs text-gray-400">No actions recorded yet for this thread.</p>
              )}
              {threadActions.map((action) => {
                const params = typeof action.tool_params === 'string' ? (() => { try { return JSON.parse(action.tool_params); } catch { return {}; } })() : (action.tool_params ?? {});
                const description = action.tool === 'send_alert' ? `Alert sent: "${(params.message || '').slice(0, 80)}"` 
                  : action.tool === 'ignore_thread' ? `Thread ignored${params.reason ? `: ${params.reason}` : ''}`
                  : action.tool === 'update_thread' ? `Thread set to ${params.status || 'updated'}`
                  : action.tool === 'memory_store' ? `Remembered: "${(params.content || '').slice(0, 80)}"`
                  : action.tool === 'memory_obsolete' ? 'Retired a memory'
                  : !action.tool ? 'Analyzed email'
                  : action.tool;
                const badgeLabel = action.tool === 'send_alert' ? 'alert' : action.tool === 'ignore_thread' ? 'ignored' : action.tool === 'memory_store' ? 'memory' : action.tool || 'analysis';
                const badgeClass = action.tool === 'send_alert' ? 'badge-critical' : action.result === 'failed' ? 'badge-critical' : 'badge-neutral';

                return (
                  <div key={action.id} className="panel-inset px-3 py-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-start gap-2">
                        <span className={`badge badge-sm ${badgeClass} shrink-0 mt-0.5`}>{badgeLabel}</span>
                        <span className="text-gray-700">{description}</span>
                      </div>
                      <span className="text-gray-400 shrink-0 tabular-nums">{formatFullTimestamp(action.created_at, timezone)}</span>
                    </div>
                    {action.reasoning && (
                      <div className="w-full mt-1.5 rounded bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-gray-500">{action.reasoning}</div>
                    )}
                    {action.error && (
                      <p className="text-red-600 mt-1 pl-6">{action.error}</p>
                    )}
                    {(action.model || action.cost_usd) && (
                      <div className="flex gap-3 text-gray-400 mt-1 pl-6">
                        {action.model && <span className="font-mono">{action.model}</span>}
                        {action.cost_usd != null && action.cost_usd > 0 && <span>${Number(action.cost_usd).toFixed(4)}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
