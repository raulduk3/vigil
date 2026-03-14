'use client';

import type { Thread, Action, Memory } from '@/lib/api/client';
import { AgentChat } from './agent-chat';
import { StatsCard } from './stats-card';

interface ControlPanelProps {
  watcherId: string | null;
  threads: Thread[];
  actions: Action[];
  memories: Memory[];
}

export function ControlPanel({
  watcherId,
  threads,
  actions,
  memories,
}: ControlPanelProps) {
  if (!watcherId) {
    return (
      <div className="w-90 shrink-0 bg-surface-raised border-l border-gray-200 flex items-center justify-center">
        <p className="text-xs text-gray-400">Select a watcher</p>
      </div>
    );
  }

  return (
    <div className="w-90 shrink-0 bg-surface-raised border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Agent Chat — takes most space */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <AgentChat watcherId={watcherId} />
      </div>

      {/* Stats */}
      <div className="border-t border-gray-200 shrink-0">
        <StatsCard threads={threads} actions={actions} memories={memories} />
      </div>


    </div>
  );
}
