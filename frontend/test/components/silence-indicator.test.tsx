import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SilenceIndicator } from '@/components/silence-indicator';

describe('SilenceIndicator Component', () => {
  const NOW = 1704153600000; // 2024-01-02 00:00:00 UTC

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays "Last activity X ago" for active threads', () => {
    const lastActivity = NOW - 3600000; // 1 hour ago

    render(
      <SilenceIndicator
        lastActivityAt={lastActivity}
        status="open"
        thresholdHours={24}
      />
    );

    expect(screen.getByText(/Last activity 1 hour ago/)).toBeInTheDocument();
  });

  it('displays "No response observed" for silent threads', () => {
    const lastActivity = NOW - 86400000 * 2; // 2 days ago

    render(
      <SilenceIndicator
        lastActivityAt={lastActivity}
        status="open"
        thresholdHours={24}
      />
    );

    expect(screen.getByText(/No response observed for 2 days/)).toBeInTheDocument();
  });

  it('shows active state for closed threads regardless of time', () => {
    const lastActivity = NOW - 86400000 * 5; // 5 days ago

    render(
      <SilenceIndicator
        lastActivityAt={lastActivity}
        status="closed"
        thresholdHours={24}
      />
    );

    // Closed threads show "Last activity" not "No response observed"
    expect(screen.getByText(/Last activity/)).toBeInTheDocument();
    expect(screen.queryByText(/No response observed/)).not.toBeInTheDocument();
  });

  it('uses neutral styling without urgency colors', () => {
    const lastActivity = NOW - 86400000 * 2; // 2 days - silent

    const { container } = render(
      <SilenceIndicator
        lastActivityAt={lastActivity}
        status="open"
        thresholdHours={24}
      />
    );

    // Check that we don't have alarming red/orange colors
    const element = container.firstChild as HTMLElement;
    expect(element.className).not.toContain('text-red');
    expect(element.className).not.toContain('text-orange');
    expect(element.className).not.toContain('bg-red');
  });

  it('does not use alarming language', () => {
    const lastActivity = NOW - 86400000 * 10; // 10 days ago

    render(
      <SilenceIndicator
        lastActivityAt={lastActivity}
        status="open"
        thresholdHours={24}
      />
    );

    const text = screen.getByRole('status').textContent || '';
    expect(text).not.toMatch(/overdue|late|missed|failed|urgent|critical|warning/i);
  });

  it('includes timestamp for screen readers', () => {
    const lastActivity = NOW - 3600000;

    render(
      <SilenceIndicator
        lastActivityAt={lastActivity}
        status="open"
        thresholdHours={24}
      />
    );

    const element = screen.getByRole('status');
    expect(element).toHaveAccessibleName();
  });
});

describe('SilenceIndicator - Compact Mode', () => {
  const NOW = 1704153600000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders shortened text in compact mode', () => {
    const lastActivity = NOW - 7200000; // 2 hours ago

    render(
      <SilenceIndicator
        lastActivityAt={lastActivity}
        status="open"
        thresholdHours={24}
        compact
      />
    );

    // Should show shorter format like "2h ago" instead of "Last activity 2 hours ago"
    expect(screen.getByText(/2h/)).toBeInTheDocument();
  });
});
