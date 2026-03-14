'use client';

import { useState, useEffect } from 'react';
import { api, type Action } from '@/lib/api/client';

interface ActivityLogProps {
  watcherId: string;
}

function formatFullTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function formatDateHeader(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (day.getTime() === today.getTime()) return 'Today';
  if (day.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getDateKey(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function truncate(str: string, max = 80): string {
  if (!str) return '';
  return str.length > max ? str.slice(0, max).trimEnd() + '…' : str;
}

function averageDuration(actions: Action[]): number | null {
  const durations = actions.map((action) => action.duration_ms).filter((value): value is number => value != null);
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
}

/**
 * Determine if an action is user-meaningful (not internal bookkeeping).
 * We show: send_alert, ignore_thread, email analysis (decision), and scheduled ticks with decisions.
 * We hide: thread_update, memory_store, memory_obsolete (these are internal state changes).
 */
function isMeaningfulAction(action: Action): boolean {
  // Always show alerts
  if (action.tool === 'send_alert') return true;
  // Always show ignore actions
  if (action.tool === 'ignore_thread') return true;
  // Show webhook calls
  if (action.tool === 'webhook') return true;
  // Show email analyses (no tool, but has a decision with summary)
  if (!action.tool && action.decision) return true;
  // Show scheduled tick reviews that have decisions
  if (action.trigger_type === 'scheduled_tick' && action.decision) return true;
  // Show user queries/chats
  if (action.trigger_type === 'user_query' || action.trigger_type === 'user_chat') return true;
  // Hide everything else (thread_update, memory_store, etc)
  return false;
}

function parseParams(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function getActionLabel(action: Action): { label: string; badge: string; badgeClass: string } {
  const p = parseParams(action.tool_params);

  if (action.tool === 'send_alert') {
    const msg = (p as any).message || (p as any).subject || '';
    return {
      label: `Alert sent: ${truncate(msg)}`,
      badge: 'alert',
      badgeClass: 'badge-critical',
    };
  }

  if (action.tool === 'ignore_thread') {
    const reason = (p as any).reason || '';
    return {
      label: `Thread ignored${reason ? `: ${truncate(reason, 60)}` : ''}`,
      badge: 'ignored',
      badgeClass: 'badge-inactive',
    };
  }

  if (action.tool === 'webhook') {
    return {
      label: 'Webhook triggered',
      badge: 'webhook',
      badgeClass: 'badge-warning',
    };
  }

  if (action.trigger_type === 'scheduled_tick') {
    return {
      label: 'Scheduled review completed',
      badge: 'review',
      badgeClass: 'badge-neutral',
    };
  }

  if (action.trigger_type === 'user_query' || action.trigger_type === 'user_chat') {
    return {
      label: 'Agent query',
      badge: 'chat',
      badgeClass: 'badge-warning',
    };
  }

  // Email analysis (no tool, has decision)
  if (!action.tool && action.decision) {
    try {
      const d = typeof action.decision === 'string' ? JSON.parse(action.decision) : action.decision;
      const urgency = d.urgency || 'low';
      const summary = d.summary || d.reasoning || '';
      return {
        label: truncate(summary),
        badge: urgency,
        badgeClass: urgency === 'high' ? 'badge-critical' : urgency === 'normal' ? 'badge-warning' : 'badge-neutral',
      };
    } catch {
      return {
        label: truncate(String(action.decision)),
        badge: 'analysis',
        badgeClass: 'badge-neutral',
      };
    }
  }

  return {
    label: action.tool || 'Unknown action',
    badge: 'action',
    badgeClass: 'badge-neutral',
  };
}

function ActionCard({ action }: { action: Action }) {
  const [expanded, setExpanded] = useState(false);
  const { label, badge, badgeClass } = getActionLabel(action);
  const failed = action.result === 'failed';
  const triggerLabel = action.trigger_type.replace('_', ' ');

  return (
    <article className={`rounded-xl border bg-surface-raised px-4 py-3 shadow-raised-sm ${failed ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge badge-sm ${badgeClass}`}>{badge}</span>
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-gray-500">
              {triggerLabel}
            </span>
            {failed && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-red-600">
                Failed
              </span>
            )}
          </div>
          <p className={`max-w-none text-sm leading-6 ${failed ? 'text-red-700' : 'text-gray-800'}`}>
            {label}
          </p>
        </div>
        <span className="shrink-0 text-xs text-gray-400 tabular-nums">{formatFullTime(action.created_at)}</span>
      </div>

      {action.error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">{action.error}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
        {action.model && <span className="rounded-full bg-surface-sunken px-2 py-1 font-mono text-[11px]">{action.model}</span>}
        {action.cost_usd != null && action.cost_usd > 0 && (
          <span className="rounded-full bg-surface-sunken px-2 py-1">${Number(action.cost_usd).toFixed(4)}</span>
        )}
        {action.duration_ms != null && <span className="rounded-full bg-surface-sunken px-2 py-1">{action.duration_ms}ms</span>}
        {action.reasoning && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="ml-auto rounded-full px-2 py-1 text-gray-500 transition-colors hover:bg-surface-sunken hover:text-gray-700"
          >
            {expanded ? 'Hide reasoning' : 'Why?'}
          </button>
        )}
      </div>

      {expanded && action.reasoning && (
        <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-3 text-xs leading-6 text-gray-500">
          {action.reasoning}
        </p>
      )}
    </article>
  );
}

export function ActivityLog({ watcherId }: ActivityLogProps) {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getActions(watcherId, { limit: 100 })
      .then((res) => setActions(res.actions || []))
      .catch(() => setActions([]))
      .finally(() => setLoading(false));
  }, [watcherId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="spinner" />
      </div>
    );
  }

  // Filter to meaningful actions only
  const meaningful = actions.filter(isMeaningfulAction);
  const alertCount = meaningful.filter((action) => action.tool === 'send_alert').length;
  const failedCount = meaningful.filter((action) => action.result === 'failed').length;
  const automatedCount = meaningful.filter((action) => action.trigger_type !== 'user_query' && action.trigger_type !== 'user_chat').length;
  const avgDuration = averageDuration(meaningful);

  if (meaningful.length === 0) {
    return (
      <div className="flex flex-1 flex-col bg-surface-page">
        <div className="border-b border-gray-200 bg-surface-raised px-4 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">Activity</h3>
          <p className="mt-1 max-w-none text-sm text-gray-500">Meaningful agent actions, reviews, and user-triggered runs appear here.</p>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">No activity yet</p>
            <p className="max-w-none text-sm text-gray-500">Once this watcher processes email or you query the agent, the timeline will populate here.</p>
          </div>
        </div>
      </div>
    );
  }

  // Group by date
  const groups: { dateKey: string; dateLabel: string; actions: Action[] }[] = [];
  for (const action of meaningful) {
    const key = getDateKey(action.created_at);
    const last = groups[groups.length - 1];
    if (last && last.dateKey === key) {
      last.actions.push(action);
    } else {
      groups.push({ dateKey: key, dateLabel: formatDateHeader(action.created_at), actions: [action] });
    }
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-surface-page">
      <div className="border-b border-gray-200 bg-surface-raised px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">Activity</h3>
            <p className="mt-1 max-w-none text-sm text-gray-500">A cleaner audit trail of actions that mattered, without internal bookkeeping noise.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-surface-page px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Events</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-gray-800">{meaningful.length}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-surface-page px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Alerts</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-gray-800">{alertCount}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-surface-page px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Automated</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-gray-800">{automatedCount}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-surface-page px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Avg runtime</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-gray-800">{avgDuration != null ? `${avgDuration}ms` : 'n/a'}</div>
            </div>
          </div>
        </div>
        {failedCount > 0 && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {failedCount} failed {failedCount === 1 ? 'action' : 'actions'} still visible in the timeline.
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-4xl space-y-6">
          {groups.map((group) => (
            <section key={group.dateKey}>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{group.dateLabel}</span>
                <div className="h-px flex-1 bg-gray-200" />
                <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-gray-400 shadow-raised-sm">{group.actions.length}</span>
              </div>
              <div className="space-y-3">
                {group.actions.map((action) => (
                  <ActionCard key={action.id} action={action} />
                ))}
              </div>
            </section>
          ))}
          </div>
      </div>
    </div>
  );
}
