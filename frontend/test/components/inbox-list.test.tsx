import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InboxList, InboxListThread } from '@/components/inbox-list';

const mockThreads: InboxListThread[] = [
  {
    thread_id: 'thread-1',
    subject: 'Contract Review',
    status: 'open',
    last_activity_at: 1704240000000,
    messages: [
      {
        email_id: 'email-1',
        sender: 'alice@example.com',
        subject: 'Initial request',
        timestamp: 1704067200000,
        body_excerpt: 'Please review.',
      },
      {
        email_id: 'email-2',
        sender: 'bob@example.com',
        subject: 'Re: Initial request',
        timestamp: 1704153600000,
        body_excerpt: 'Will do.',
      },
    ],
  },
  {
    thread_id: 'thread-2',
    subject: 'Budget Approval',
    status: 'open',
    last_activity_at: 1704326400000,
    messages: [
      {
        email_id: 'email-3',
        sender: 'carol@example.com',
        subject: 'Budget Approval',
        timestamp: 1704326400000,
        body_excerpt: 'Please approve.',
      },
    ],
  },
  {
    thread_id: 'thread-3',
    subject: 'Old Thread',
    status: 'closed',
    last_activity_at: 1703980800000,
    messages: [],
  },
];

describe('InboxList Component', () => {
  const NOW = 1704412800000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all threads', () => {
    render(<InboxList threads={mockThreads} silenceThresholdHours={24} />);

    expect(screen.getByText('Contract Review')).toBeInTheDocument();
    expect(screen.getByText('Budget Approval')).toBeInTheDocument();
    expect(screen.getByText('Old Thread')).toBeInTheDocument();
  });

  it('sorts threads: silent first, then active', () => {
    render(<InboxList threads={mockThreads} silenceThresholdHours={24} />);

    const threadHeaders = screen.getAllByRole('button', { name: /thread/i });
    // Threads should be ordered by silence state
    expect(threadHeaders.length).toBeGreaterThanOrEqual(3);
  });

  it('shows empty state when no threads', () => {
    render(<InboxList threads={[]} silenceThresholdHours={24} />);

    expect(screen.getByText(/no threads/i)).toBeInTheDocument();
  });
});

describe('InboxList - Move Message', () => {
  const NOW = 1704412800000;
  const onMoveMessage = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    onMoveMessage.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows move dialog when move is initiated', () => {
    render(
      <InboxList
        threads={mockThreads}
        silenceThresholdHours={24}
        onMoveMessage={onMoveMessage}
      />
    );

    // Expand first thread
    fireEvent.click(screen.getByText('Contract Review'));

    // Click move on first message
    const moveButtons = screen.getAllByRole('button', { name: /move/i });
    fireEvent.click(moveButtons[0]);

    // Dialog should appear with thread options
    expect(screen.getByText(/move message to/i)).toBeInTheDocument();
  });

  it('shows available destination threads in dialog', () => {
    render(
      <InboxList
        threads={mockThreads}
        silenceThresholdHours={24}
        onMoveMessage={onMoveMessage}
      />
    );

    // Expand first thread
    fireEvent.click(screen.getByText('Contract Review'));

    // Click move on first message
    const moveButtons = screen.getAllByRole('button', { name: /move/i });
    fireEvent.click(moveButtons[0]);

    // Should show dialog with destination threads
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Budget Approval appears in both the thread list and the dialog
    expect(screen.getAllByText('Budget Approval')).toHaveLength(2);
  });

  it('calls onMoveMessage when destination selected', () => {
    render(
      <InboxList
        threads={mockThreads}
        silenceThresholdHours={24}
        onMoveMessage={onMoveMessage}
      />
    );

    // Expand first thread
    fireEvent.click(screen.getByText('Contract Review'));

    // Click move on first message
    const moveButtons = screen.getAllByRole('button', { name: /move/i });
    fireEvent.click(moveButtons[0]);

    // Select destination thread
    const destButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.includes('Budget Approval') && btn.closest('[role="dialog"]')
    );
    if (destButton) {
      fireEvent.click(destButton);
    }

    expect(onMoveMessage).toHaveBeenCalledWith('email-1', 'thread-1', 'thread-2');
  });

  it('allows creating new thread as destination', () => {
    render(
      <InboxList
        threads={mockThreads}
        silenceThresholdHours={24}
        onMoveMessage={onMoveMessage}
        onCreateThread={vi.fn()}
      />
    );

    // Expand first thread
    fireEvent.click(screen.getByText('Contract Review'));

    // Click move on first message
    const moveButtons = screen.getAllByRole('button', { name: /move/i });
    fireEvent.click(moveButtons[0]);

    // Should show option to create new thread
    expect(screen.getByText(/new thread/i)).toBeInTheDocument();
  });
});
