/**
 * SilenceIndicator Component
 *
 * Displays the silence state of a thread in a neutral, factual manner.
 * Avoids alarming colors or language that implies judgment.
 */

import React from 'react';
import {
  computeSilenceDuration,
  getSilenceState,
  formatSilenceDuration,
  formatSilenceLabel,
} from '@/lib/silence';

export interface SilenceIndicatorProps {
  lastActivityAt: number;
  status: 'open' | 'closed';
  thresholdHours: number;
  compact?: boolean;
}

function formatCompactDuration(durationMs: number): string {
  if (durationMs < 60000) {
    return 'now';
  }

  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(durationMs / 3600000);
  const days = Math.floor(durationMs / 86400000);

  if (days >= 1) {
    return `${days}d`;
  }

  if (hours >= 1) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

export function SilenceIndicator({
  lastActivityAt,
  status,
  thresholdHours,
  compact = false,
}: SilenceIndicatorProps) {
  const now = Date.now();
  const duration = computeSilenceDuration(lastActivityAt, now);
  const state = getSilenceState({ lastActivityAt, status, thresholdHours, now });

  if (compact) {
    const compactText = formatCompactDuration(duration);
    return (
      <span
        role="status"
        aria-label={`Last activity ${formatSilenceDuration(duration)} ago`}
        className="silence-indicator silence-indicator-compact text-gray-600"
      >
        {compactText} ago
      </span>
    );
  }

  const label = formatSilenceLabel(state, duration);

  return (
    <span
      role="status"
      aria-label={label}
      className={`silence-indicator ${
        state === 'silent'
          ? 'text-gray-700'
          : 'text-gray-600'
      }`}
    >
      {label}
    </span>
  );
}

export default SilenceIndicator;
