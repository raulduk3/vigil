'use client';

import type { Thread } from '@/lib/api/client';

interface EmailRowProps {
  thread: Thread;
  isSelected: boolean;
  onClick: () => void;
}

function formatFullTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  });
}

function urgencyDot(status: Thread['status']) {
  if (status === 'active') return 'bg-red-500';
  if (status === 'watching') return 'bg-yellow-500';
  return 'bg-gray-300';
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

export function EmailRow({ thread, isSelected, onClick }: EmailRowProps) {
  const isActive = thread.status === 'active';
  const fromAddr = thread.participants[0] ?? '';

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 transition-colors duration-75 ${
        isSelected ? 'bg-vigil-50' : 'hover:bg-surface-sunken'
      }`}
    >
      {/* Urgency dot */}
      <div className="shrink-0 mt-1.5">
        <span className={`w-2 h-2 rounded-full block ${urgencyDot(thread.status)}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`flex-1 text-sm truncate ${
              isActive ? 'font-semibold text-gray-900' : 'font-normal text-gray-700'
            }`}
          >
            {thread.subject || 'No subject'}
          </span>
          <span className="shrink-0 text-xs text-gray-400 tabular-nums">
            {thread.original_date ? formatFullTime(thread.original_date) : formatFullTime(thread.last_activity)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs text-gray-500 truncate">{fromAddr}</span>
          <span className={`badge badge-sm ${statusBadgeClass(thread.status)}`}>{thread.status}</span>
        </div>

        {thread.summary && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{thread.summary}</p>
        )}
      </div>
    </div>
  );
}
