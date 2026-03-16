'use client';

import { useState, useEffect } from 'react';
import { api, type Action } from '@/lib/api/client';

interface ActivityLogProps {
  watcherId: string;
}

// ============================================================================
// Helpers
// ============================================================================

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

function formatNum(n: number): string {
  return n.toLocaleString('en-US');
}

function averageDuration(actions: Action[]): number | null {
  const durations = actions.map((a) => a.duration_ms).filter((v): v is number => v != null);
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((s, v) => s + v, 0) / durations.length);
}

function sumCost(actions: Action[]): number {
  return actions.reduce((s, a) => s + (a.cost_usd ?? 0), 0);
}

function parseParams(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function parseDecision(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof d === 'object' && d !== null) return d as Record<string, unknown>;
  } catch {}
  return null;
}

function isInternalAction(action: Action): boolean {
  return action.tool === 'update_thread' || action.tool === 'memory_store' || action.tool === 'memory_obsolete';
}

function getTokenDisplay(action: Action): string | null {
  if (action.input_tokens != null && action.output_tokens != null) {
    return `${formatNum(action.input_tokens)} in → ${formatNum(action.output_tokens)} out`;
  }
  if (action.context_tokens != null && action.context_tokens > 0) {
    return `${formatNum(action.context_tokens)} tokens`;
  }
  return null;
}

function getActionLabel(action: Action): { label: string; badge: string; badgeClass: string } {
  const p = parseParams(action.tool_params);

  if (action.tool === 'send_alert') {
    const msg = (p as any).message || (p as any).subject || '';
    return { label: `Alert sent: ${truncate(msg, 200)}`, badge: 'alert', badgeClass: 'badge-critical' };
  }
  if (action.tool === 'ignore_thread') {
    const reason = (p as any).reason || '';
    return { label: `Thread ignored${reason ? `: ${truncate(reason, 60)}` : ''}`, badge: 'ignored', badgeClass: 'badge-inactive' };
  }
  if (action.tool === 'webhook') {
    return { label: 'Webhook triggered', badge: 'webhook', badgeClass: 'badge-warning' };
  }
  if (action.tool === 'update_thread') {
    return { label: 'Thread updated', badge: 'update', badgeClass: 'badge-neutral' };
  }
  if (action.tool === 'memory_store') {
    return { label: 'Memory stored', badge: 'memory', badgeClass: 'badge-neutral' };
  }
  if (action.tool === 'memory_obsolete') {
    return { label: 'Memory updated', badge: 'memory', badgeClass: 'badge-neutral' };
  }
  if (action.tool === 'chat') {
    return { label: 'Agent chat', badge: 'chat', badgeClass: 'badge-warning' };
  }
  if (action.trigger_type === 'scheduled_tick') {
    return { label: 'Scheduled review', badge: 'review', badgeClass: 'badge-neutral' };
  }
  if (action.trigger_type === 'user_query' || action.trigger_type === 'user_chat') {
    return { label: 'Agent query', badge: 'chat', badgeClass: 'badge-warning' };
  }
  if (!action.tool && action.decision) {
    const d = parseDecision(action.decision);
    const urgency = (d?.urgency as string) || 'low';
    const summary = (d?.summary as string) || (d?.reasoning as string) || '';
    return {
      label: truncate(summary, 200),
      badge: urgency,
      badgeClass: urgency === 'high' ? 'badge-critical' : urgency === 'normal' ? 'badge-warning' : 'badge-neutral',
    };
  }
  return { label: action.tool || 'Action', badge: 'action', badgeClass: 'badge-neutral' };
}

// ============================================================================
// Sub-components
// ============================================================================

function EmailAnalysisDetail({ decision }: { decision: string }) {
  const d = parseDecision(decision);
  if (!d) return null;

  const urgency = (d.urgency as string) || 'low';
  const urgencyClass = urgency === 'high'
    ? 'bg-red-100 text-red-700'
    : urgency === 'normal'
    ? 'bg-yellow-100 text-yellow-700'
    : 'bg-gray-100 text-gray-500';
  const entities = (d.entities as string[]) || [];
  const summary = d.summary as string | undefined;
  const intent = d.intent as string | undefined;
  const reasoning = d.reasoning as string | undefined;

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-xs">
      {summary && <p className="font-medium text-gray-700">{summary}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {intent && (
          <span className="rounded-full bg-surface-raised px-2 py-0.5 text-gray-500">{intent}</span>
        )}
        <span className={`rounded-full px-2 py-0.5 font-medium ${urgencyClass}`}>{urgency} urgency</span>
      </div>
      {entities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entities.map((e, i) => (
            <span key={i} className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-gray-500">{e}</span>
          ))}
        </div>
      )}
      {reasoning && (
        <p className="leading-relaxed text-gray-500">{reasoning}</p>
      )}
    </div>
  );
}

function ToolDetail({ action }: { action: Action }) {
  const p = parseParams(action.tool_params);
  const displayParams = Object.entries(p).filter(([k]) => k !== 'watcher_id');

  return (
    <div className="mt-3 space-y-1.5 rounded-lg bg-surface-sunken px-3 py-2.5 text-xs">
      {displayParams.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="shrink-0 font-mono text-gray-400">{k}:</span>
          <span className="break-all text-gray-600">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
        </div>
      ))}
      {action.reasoning && (
        <p className="mt-1 border-t border-gray-200 pt-1.5 leading-relaxed text-gray-500">{action.reasoning}</p>
      )}
    </div>
  );
}

// ============================================================================
// ActionCard
// ============================================================================

function ActionCard({ action }: { action: Action }) {
  const [expanded, setExpanded] = useState(false);
  const { label, badge, badgeClass } = getActionLabel(action);
  const failed = action.result === 'failed';
  const internal = isInternalAction(action);
  const triggerLabel = action.trigger_type.replace('_', ' ');
  const tokenDisplay = getTokenDisplay(action);
  const decision = parseDecision(action.decision);

  const hasDetail = !!(
    (action.trigger_type === 'email_received' && action.decision) ||
    (action.trigger_type === 'scheduled_tick') ||
    (action.tool && action.tool !== 'chat' && action.tool_params) ||
    (!action.tool && !action.decision && action.reasoning)
  );

  return (
    <article className={`rounded-xl border bg-surface-raised px-4 py-3 shadow-raised-sm ${failed ? 'border-red-200' : 'border-gray-200'} ${internal ? 'opacity-60' : ''}`}>
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
          <p className={`max-w-none text-sm leading-6 ${failed ? 'text-red-700' : internal ? 'text-gray-500' : 'text-gray-800'}`}>
            {label}
          </p>
        </div>
        <span className="shrink-0 text-xs text-gray-400 tabular-nums">{formatFullTime(action.created_at)}</span>
      </div>

      {action.error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">{action.error}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
        {action.model && (
          <span className="rounded-full bg-surface-sunken px-2 py-1 font-mono text-[11px]">{action.model}</span>
        )}
        {tokenDisplay && (
          <span className="rounded-full bg-surface-sunken px-2 py-1 font-mono text-[11px]">{tokenDisplay}</span>
        )}
        {action.cost_usd != null && action.cost_usd > 0 && (
          <span className="rounded-full bg-surface-sunken px-2 py-1 font-mono text-[11px]">${Number(action.cost_usd).toFixed(4)}</span>
        )}
        {action.duration_ms != null && (
          <span className="rounded-full bg-surface-sunken px-2 py-1">{action.duration_ms}ms</span>
        )}
        {hasDetail && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="ml-auto rounded-full px-2 py-1 text-gray-500 transition-colors hover:bg-surface-sunken hover:text-gray-700"
          >
            {expanded ? '↑ less' : '↓ details'}
          </button>
        )}
      </div>

      {expanded && (
        <>
          {action.trigger_type === 'email_received' && action.decision && (
            <EmailAnalysisDetail decision={action.decision} />
          )}
          {action.trigger_type === 'scheduled_tick' && decision && (
            <EmailAnalysisDetail decision={action.decision!} />
          )}
          {action.trigger_type === 'scheduled_tick' && !decision && (
            <div className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-gray-500">
              No changes detected.
            </div>
          )}
          {action.tool && action.tool !== 'chat' && action.tool_params && (
            <ToolDetail action={action} />
          )}
          {!action.tool && !action.decision && action.reasoning && (
            <div className="mt-2 rounded bg-surface-sunken px-3 py-2.5 text-xs leading-relaxed text-gray-500">
              {action.reasoning}
            </div>
          )}
        </>
      )}
    </article>
  );
}

// ============================================================================
// ActivityLog
// ============================================================================

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
      <div className="flex flex-1 flex-col bg-surface-page">
        <div className="border-b border-gray-200 bg-surface-raised px-4 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">Activity</h3>
          <p className="mt-1 max-w-none text-sm text-gray-500">All agent actions appear here — emails analyzed, tools called, memory stored.</p>
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

  const alertCount = actions.filter((a) => a.tool === 'send_alert').length;
  const failedCount = actions.filter((a) => a.result === 'failed').length;
  const runCost = sumCost(actions);
  const avgDuration = averageDuration(actions);

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
    <div className="flex flex-1 min-h-0 flex-col bg-surface-page">
      <div className="border-b border-gray-200 bg-surface-raised px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">Activity</h3>
            <p className="mt-1 max-w-none text-sm text-gray-500">Full agent audit trail — every invocation, tool call, and analysis. Click any card for details.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-surface-page px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Events</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-gray-800">{actions.length}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-surface-page px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Alerts</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-gray-800">{alertCount}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-surface-page px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Total cost</div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-gray-800">${runCost.toFixed(4)}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-surface-page px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Avg runtime</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-gray-800">{avgDuration != null ? `${avgDuration}ms` : 'n/a'}</div>
            </div>
          </div>
        </div>
        {failedCount > 0 && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {failedCount} failed {failedCount === 1 ? 'action' : 'actions'} in the timeline.
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
