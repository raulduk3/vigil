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

function getActionLabel(action: Action): { label: string; badge: string; badgeClass: string } {
  const p = action.tool_params ?? {};

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

  return (
    <div className={`panel px-4 py-3 ${failed ? 'border-red-200' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className={`badge badge-sm ${badgeClass} shrink-0 mt-0.5`}>{badge}</span>
          <p className={`text-sm ${failed ? 'text-red-700' : 'text-gray-800'} leading-snug`}>
            {label}
          </p>
        </div>
        <span className="text-xs text-gray-400 shrink-0 tabular-nums">{formatFullTime(action.created_at)}</span>
      </div>

      {action.error && (
        <p className="text-xs text-red-500 mt-1.5 pl-6">{action.error}</p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 text-xs text-gray-400 mt-2 pl-6">
        {action.trigger_type === 'email_received' && (
          <span>email trigger</span>
        )}
        {action.model && <span className="font-mono">{action.model}</span>}
        {action.cost_usd != null && action.cost_usd > 0 && (
          <span>${Number(action.cost_usd).toFixed(4)}</span>
        )}
        {action.duration_ms != null && <span>{action.duration_ms}ms</span>}
        {action.reasoning && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? 'Hide reasoning' : 'Why?'}
          </button>
        )}
      </div>

      {expanded && action.reasoning && (
        <p className="text-xs text-gray-500 bg-surface-sunken rounded px-2.5 py-2 mt-2 leading-relaxed ml-6">
          {action.reasoning}
        </p>
      )}
    </div>
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

  if (meaningful.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-500">
        <p className="font-medium text-gray-700 mb-1">No activity yet</p>
        <p>Agent actions will appear here after emails are processed.</p>
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
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {groups.map((group) => (
        <div key={group.dateKey}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{group.dateLabel}</span>
            <div className="flex-1 border-t border-gray-100" />
            <span className="text-xs text-gray-400">{group.actions.length}</span>
          </div>
          <div className="space-y-2">
            {group.actions.map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
