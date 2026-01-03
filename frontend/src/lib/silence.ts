/**
 * Silence Monitoring Utilities
 *
 * Core logic for computing and displaying communication silence state.
 * This module contains pure functions with no side effects.
 */

export type SilenceState = 'active' | 'silent';

/**
 * Computes the duration of silence in milliseconds since last activity.
 * Handles timestamps in both milliseconds and seconds (Unix epoch).
 *
 * @param lastActivityAt - Timestamp of last activity (ms or seconds)
 * @param now - Current timestamp in milliseconds
 * @returns Duration in milliseconds, or 0 if lastActivityAt is in the future
 */
export function computeSilenceDuration(lastActivityAt: number, now: number = Date.now()): number {
  // Detect if timestamp is in seconds (< year 2001 in ms would be year ~1970 in seconds)
  const normalizedTimestamp =
    lastActivityAt < 1000000000000 ? lastActivityAt * 1000 : lastActivityAt;

  const duration = now - normalizedTimestamp;
  return Math.max(0, duration);
}

/**
 * Determines the silence state of a thread based on last activity and threshold.
 *
 * @param params - Thread state parameters
 * @returns 'active' if within threshold or closed, 'silent' if beyond threshold
 */
export function getSilenceState(params: {
  lastActivityAt: number;
  status: 'open' | 'closed';
  thresholdHours: number;
  now?: number;
}): SilenceState {
  const { lastActivityAt, status, thresholdHours, now = Date.now() } = params;

  // Closed threads are never considered silent
  if (status === 'closed') {
    return 'active';
  }

  const duration = computeSilenceDuration(lastActivityAt, now);
  const thresholdMs = thresholdHours * 3600000;

  return duration > thresholdMs ? 'silent' : 'active';
}

/**
 * Formats a silence duration in human-readable form.
 * Uses the largest applicable unit for clarity.
 *
 * @param durationMs - Duration in milliseconds
 * @returns Human-readable duration string
 */
export function formatSilenceDuration(durationMs: number): string {
  if (durationMs < 60000) {
    return 'just now';
  }

  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(durationMs / 3600000);
  const days = Math.floor(durationMs / 86400000);

  if (days >= 1) {
    return days === 1 ? '1 day' : `${days} days`;
  }

  if (hours >= 1) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }

  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/**
 * Formats the silence state as neutral, factual text.
 * Avoids language implying blame, urgency, or judgment.
 *
 * @param state - The silence state
 * @param durationMs - Duration since last activity in milliseconds
 * @returns Neutral description of the silence state
 */
export function formatSilenceLabel(state: SilenceState, durationMs: number): string {
  if (state === 'active') {
    return `Last activity ${formatSilenceDuration(durationMs)} ago`;
  }

  return `No response observed for ${formatSilenceDuration(durationMs)}`;
}
