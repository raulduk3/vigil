'use client';

import type { Thread, Action, Memory } from '@/lib/api/client';

interface StatsCardProps {
  threads: Thread[];
  actions: Action[];
  memories: Memory[];
}

export function StatsCard({ threads, actions, memories }: StatsCardProps) {
  const activeCount = threads.filter((t) => t.status === 'active').length;
  const watchingCount = threads.filter((t) => t.status === 'watching').length;
  const ignoredCount = threads.filter((t) => t.status === 'ignored').length;
  const memoryCount = memories.filter((m) => !m.obsolete).length;

  // Alerts sent last 24h
  const oneDayAgo = Date.now() - 86400000;
  const recentActions = actions.filter((a) => new Date(a.created_at).getTime() > oneDayAgo);
  const alertCount = recentActions.filter((a) => a.tool === 'send_alert').length;
  const totalCost = recentActions.reduce((sum, a) => sum + (a.cost_usd || 0), 0);

  const stats: { label: string; value: string | number; className?: string }[] = [
    { label: 'Active', value: activeCount, className: activeCount > 0 ? 'text-status-critical' : undefined },
    { label: 'Watching', value: watchingCount, className: watchingCount > 0 ? 'text-status-warning' : undefined },
    { label: 'Ignored', value: ignoredCount },
    { label: 'Memories', value: memoryCount },
    { label: 'Alerts (24h)', value: alertCount },
    { label: 'Cost (24h)', value: `$${totalCost.toFixed(4)}` },
  ];

  return (
    <div className="space-y-0.5">
      <div className="data-label px-3 pt-2 pb-1">Quick Stats</div>
      <div className="grid grid-cols-2 gap-px bg-gray-100">
        {stats.map(({ label, value, className }) => (
          <div key={label} className="bg-surface-raised px-3 py-2">
            <div className="text-2xs text-gray-400 uppercase tracking-wider">{label}</div>
            <div className={`text-lg font-semibold tabular-nums ${className ?? 'text-gray-700'}`}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
