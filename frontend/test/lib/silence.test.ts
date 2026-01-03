import { describe, it, expect } from 'vitest';
import {
  computeSilenceDuration,
  getSilenceState,
  formatSilenceDuration,
  SilenceState,
} from '@/lib/silence';

describe('computeSilenceDuration', () => {
  it('returns duration in milliseconds since last activity', () => {
    const now = Date.now();
    const lastActivity = now - 3600000; // 1 hour ago
    expect(computeSilenceDuration(lastActivity, now)).toBe(3600000);
  });

  it('returns 0 for future timestamps', () => {
    const now = Date.now();
    const future = now + 1000;
    expect(computeSilenceDuration(future, now)).toBe(0);
  });

  it('handles timestamps in seconds', () => {
    const now = Date.now();
    const lastActivitySeconds = Math.floor((now - 7200000) / 1000); // 2 hours ago in seconds
    expect(computeSilenceDuration(lastActivitySeconds, now)).toBeGreaterThan(7100000);
    expect(computeSilenceDuration(lastActivitySeconds, now)).toBeLessThan(7300000);
  });
});

describe('getSilenceState', () => {
  const now = Date.now();
  const thresholdHours = 24;

  it('returns "active" when thread is closed', () => {
    const result = getSilenceState({
      lastActivityAt: now - 86400000 * 2, // 2 days ago
      status: 'closed',
      thresholdHours,
      now,
    });
    expect(result).toBe<SilenceState>('active');
  });

  it('returns "active" when within threshold', () => {
    const result = getSilenceState({
      lastActivityAt: now - 3600000, // 1 hour ago
      status: 'open',
      thresholdHours,
      now,
    });
    expect(result).toBe<SilenceState>('active');
  });

  it('returns "silent" when beyond threshold', () => {
    const result = getSilenceState({
      lastActivityAt: now - 86400000 * 2, // 2 days ago
      status: 'open',
      thresholdHours,
      now,
    });
    expect(result).toBe<SilenceState>('silent');
  });

  it('returns "active" when exactly at threshold', () => {
    const result = getSilenceState({
      lastActivityAt: now - thresholdHours * 3600000,
      status: 'open',
      thresholdHours,
      now,
    });
    expect(result).toBe<SilenceState>('active');
  });
});

describe('formatSilenceDuration', () => {
  it('formats minutes correctly', () => {
    expect(formatSilenceDuration(300000)).toBe('5 minutes'); // 5 min
    expect(formatSilenceDuration(60000)).toBe('1 minute'); // 1 min
  });

  it('formats hours correctly', () => {
    expect(formatSilenceDuration(3600000)).toBe('1 hour'); // 1 hour
    expect(formatSilenceDuration(7200000)).toBe('2 hours'); // 2 hours
    expect(formatSilenceDuration(5400000)).toBe('1 hour'); // 1.5 hours -> 1 hour
  });

  it('formats days correctly', () => {
    expect(formatSilenceDuration(86400000)).toBe('1 day'); // 1 day
    expect(formatSilenceDuration(172800000)).toBe('2 days'); // 2 days
  });

  it('formats mixed durations as largest unit', () => {
    // 1 day, 2 hours -> "1 day"
    expect(formatSilenceDuration(86400000 + 7200000)).toBe('1 day');
    // 2 hours, 30 minutes -> "2 hours"
    expect(formatSilenceDuration(7200000 + 1800000)).toBe('2 hours');
  });

  it('handles zero duration', () => {
    expect(formatSilenceDuration(0)).toBe('just now');
  });

  it('handles very short durations', () => {
    expect(formatSilenceDuration(30000)).toBe('just now'); // 30 seconds
  });
});
