'use client';

import { useState, useEffect } from 'react';
import { api, type Thread, type Action } from '@/lib/api/client';

interface EmailDetailProps {
  thread: Thread;
  watcherId: string;
  onClose: () => void;
  onStatusChange: (threadId: string, status: Thread['status']) => void;
}

function formatRelative(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
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
  const [actions, setActions] = useState<Action[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);

  useEffect(() => {
    setLoadingActions(true);
    api.getActions(watcherId)
      .then((res) => {
        // filter actions related to this thread's subject/participants if possible
        setActions((res.actions || []).slice(0, 10));
      })
      .catch(() => setActions([]))
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
            <span className="text-xs text-gray-400">{formatRelative(thread.last_activity)}</span>
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
                <div>First: {formatRelative(thread.first_seen)}</div>
                <div>Last: {formatRelative(thread.last_activity)}</div>
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
          <div className="data-label mb-2">Recent Agent Actions</div>
          {loadingActions ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="spinner-sm" /> Loading...
            </div>
          ) : actions.length === 0 ? (
            <p className="text-xs text-gray-400">No actions recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {actions.map((action) => (
                <div key={action.id} className="panel-inset px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-medium text-gray-700 capitalize">{action.tool || action.trigger_type}</span>
                    <span className={`badge badge-sm ${action.result === 'success' ? 'badge-ok' : 'badge-critical'}`}>
                      {action.result}
                    </span>
                  </div>
                  {action.decision && (
                    <p className="text-gray-500 truncate">{action.decision}</p>
                  )}
                  <div className="text-gray-400 mt-0.5">{formatRelative(action.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
