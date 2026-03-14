'use client';

import { useState, useEffect } from 'react';
import { api, type Action } from '@/lib/api/client';

interface ActivityLogProps {
  watcherId: string;
}

function formatFullTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  });
}

function triggerBadgeClass(trigger: string) {
  switch (trigger) {
    case 'email_received': return 'badge-ok';
    case 'scheduled_tick': return 'badge-neutral';
    case 'user_query': return 'badge-warning';
    default: return 'badge-neutral';
  }
}

export function ActivityLog({ watcherId }: ActivityLogProps) {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    api.getActions(watcherId, { limit: 100 })
      .then((res) => setActions(res.actions || []))
      .catch(() => setActions([]))
      .finally(() => setLoading(false));
  }, [watcherId]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {actions.map((action) => (
        <div key={action.id} className="panel px-4 py-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-700">{formatFullTime(action.created_at)}</span>
              <span className={`badge badge-sm ${triggerBadgeClass(action.trigger_type)}`}>
                {action.trigger_type}
              </span>
              {action.tool && (
                <span className="badge badge-sm badge-neutral font-mono">{action.tool}</span>
              )}
            </div>
            <span className={`badge badge-sm shrink-0 ${action.result === 'success' ? 'badge-ok' : 'badge-critical'}`}>
              {action.result}
            </span>
          </div>

          {action.decision && (
            <p className="text-xs text-gray-600">{action.decision}</p>
          )}

          <div className="flex items-center gap-3 flex-wrap text-xs text-gray-400">
            {action.model && (
              <span className="badge badge-sm badge-inactive">{action.model}</span>
            )}
            {action.cost_usd !== null && action.cost_usd !== undefined && (
              <span>${Number(action.cost_usd).toFixed(4)}</span>
            )}
            {action.duration_ms !== null && action.duration_ms !== undefined && (
              <span>{action.duration_ms}ms</span>
            )}
          </div>

          {action.reasoning && (
            <div>
              <button
                onClick={() => toggleExpand(action.id)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                {expandedIds.has(action.id) ? '▲ Hide reasoning' : '▼ Show reasoning'}
              </button>
              {expandedIds.has(action.id) && (
                <p className="text-xs text-gray-500 mt-1">{action.reasoning}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
