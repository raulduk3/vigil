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

function truncate(str: string, max = 60): string {
  if (!str) return '';
  return str.length > max ? str.slice(0, max).trimEnd() + '…' : str;
}

function getActionDescription(action: Action): string {
  const p = action.tool_params ?? {};
  switch (action.tool) {
    case 'send_alert': {
      const msg = (p.message as string) || (p.subject as string) || '';
      return `🔴 Sent alert${msg ? `: "${truncate(msg)}"` : ''}`;
    }
    case 'update_thread': {
      const subject = (p.subject as string) || (p.thread_id as string) || 'thread';
      const status = (p.status as string) || '';
      return `📋 Updated thread "${truncate(subject, 40)}"${status ? ` → ${status}` : ''}`;
    }
    case 'ignore_thread': {
      const subject = (p.subject as string) || (p.thread_id as string) || 'thread';
      const reason = (p.reason as string) || '';
      return `🚫 Ignored thread "${truncate(subject, 40)}"${reason ? `: ${truncate(reason, 40)}` : ''}`;
    }
    case 'memory_store': {
      const content = (p.content as string) || '';
      return `🧠 Remembered: "${truncate(content)}"`;
    }
    case 'memory_obsolete': {
      return `🗑️ Retired memory`;
    }
    case 'thread_update': {
      const subject = (p.subject as string) || (p.thread_id as string) || 'thread';
      const status = (p.status as string) || '';
      return `📋 Thread "${truncate(subject, 40)}"${status ? ` set to ${status}` : ' updated'}`;
    }
    case 'webhook': {
      const url = (p.url as string) || '';
      return `🔗 Webhook${url ? ` → ${truncate(url, 40)}` : ' triggered'}`;
    }
    default: {
      if (!action.tool) return '👁️ Analyzed email, no action taken';
      return `⚡ ${action.tool}`;
    }
  }
}

function ActionCard({ action }: { action: Action }) {
  const [expanded, setExpanded] = useState(false);
  const description = getActionDescription(action);
  const failed = action.result === 'failed';

  return (
    <div className={`panel px-4 py-3 space-y-2 ${failed ? 'border-red-200' : ''}`}>
      {/* Main description */}
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-medium ${failed ? 'text-red-700' : 'text-gray-800'}`}>
          {description}
        </p>
        <span className="text-xs text-gray-400 shrink-0 mt-px">{formatFullTime(action.created_at)}</span>
      </div>

      {/* Decision / email analysis */}
      {action.decision && (
        <p className="text-xs text-gray-600 leading-relaxed">{action.decision}</p>
      )}

      {/* Error */}
      {action.error && (
        <p className="text-xs text-red-500">{action.error}</p>
      )}

      {/* Footer: model, cost, duration */}
      <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
        {action.trigger_type === 'scheduled_tick' && (
          <span className="badge badge-sm badge-neutral">scheduled</span>
        )}
        {action.trigger_type === 'user_query' && (
          <span className="badge badge-sm badge-warning">query</span>
        )}
        {action.model && (
          <span className="font-mono">{action.model}</span>
        )}
        {action.cost_usd != null && (
          <span>${Number(action.cost_usd).toFixed(4)}</span>
        )}
        {action.duration_ms != null && (
          <span>{action.duration_ms}ms</span>
        )}
        {action.context_tokens != null && (
          <span>{action.context_tokens.toLocaleString()} tok</span>
        )}

        {/* Why? toggle */}
        {action.reasoning && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? '▲ Hide reasoning' : '▼ Why?'}
          </button>
        )}
      </div>

      {/* Expanded reasoning */}
      {expanded && action.reasoning && (
        <p className="text-xs text-gray-500 bg-surface-sunken rounded px-2.5 py-2 leading-relaxed">
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

  if (actions.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No activity yet</div>
        <div className="empty-state-description">Agent actions will appear here after emails are processed.</div>
      </div>
    );
  }

  // Group by date
  const groups: { dateKey: string; dateLabel: string; actions: Action[] }[] = [];
  for (const action of actions) {
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
