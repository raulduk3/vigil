import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InboxThread, InboxMessage } from '@/components/inbox-thread';

const mockMessages: InboxMessage[] = [
  {
    email_id: 'email-1',
    sender: 'alice@example.com',
    subject: 'Initial request',
    timestamp: 1704067200000, // Jan 1, 2024
    body_excerpt: 'Please review the contract by Friday.',
  },
  {
    email_id: 'email-2',
    sender: 'bob@example.com',
    subject: 'Re: Initial request',
    timestamp: 1704153600000, // Jan 2, 2024
    body_excerpt: 'I will take a look today.',
  },
  {
    email_id: 'email-3',
    sender: 'alice@example.com',
    subject: 'Re: Initial request',
    timestamp: 1704240000000, // Jan 3, 2024
    body_excerpt: 'Any updates on this?',
  },
];

describe('InboxThread Component', () => {
  const NOW = 1704326400000; // Jan 4, 2024

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders thread subject as header', () => {
    render(
      <InboxThread
        threadId="thread-1"
        subject="Contract Review"
        messages={mockMessages}
        status="open"
        lastActivityAt={mockMessages[2].timestamp}
        silenceThresholdHours={24}
      />
    );

    expect(screen.getByText('Contract Review')).toBeInTheDocument();
  });

  it('shows message count', () => {
    render(
      <InboxThread
        threadId="thread-1"
        subject="Contract Review"
        messages={mockMessages}
        status="open"
        lastActivityAt={mockMessages[2].timestamp}
        silenceThresholdHours={24}
      />
    );

    expect(screen.getByText(/3 messages/)).toBeInTheDocument();
  });

  it('is collapsed by default', () => {
    render(
      <InboxThread
        threadId="thread-1"
        subject="Contract Review"
        messages={mockMessages}
        status="open"
        lastActivityAt={mockMessages[2].timestamp}
        silenceThresholdHours={24}
      />
    );

    // Messages should not be visible initially
    expect(screen.queryByText('alice@example.com')).not.toBeInTheDocument();
  });

  it('expands to show messages when clicked', () => {
    render(
      <InboxThread
        threadId="thread-1"
        subject="Contract Review"
        messages={mockMessages}
        status="open"
        lastActivityAt={mockMessages[2].timestamp}
        silenceThresholdHours={24}
      />
    );

    // Click to expand
    fireEvent.click(screen.getByRole('button', { name: /expand/i }));

    // Messages should now be visible (alice appears twice, bob once)
    expect(screen.getAllByText('alice@example.com')).toHaveLength(2);
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('displays messages in chronological order', () => {
    render(
      <InboxThread
        threadId="thread-1"
        subject="Contract Review"
        messages={mockMessages}
        status="open"
        lastActivityAt={mockMessages[2].timestamp}
        silenceThresholdHours={24}
        defaultExpanded
      />
    );

    const messageItems = screen.getAllByRole('article');
    expect(messageItems).toHaveLength(3);

    // First message should be the oldest
    expect(messageItems[0]).toHaveTextContent('Initial request');
  });

  it('shows silence indicator for thread', () => {
    render(
      <InboxThread
        threadId="thread-1"
        subject="Contract Review"
        messages={mockMessages}
        status="open"
        lastActivityAt={mockMessages[2].timestamp}
        silenceThresholdHours={24}
      />
    );

    // Should show time since last activity
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows closed badge for closed threads', () => {
    render(
      <InboxThread
        threadId="thread-1"
        subject="Contract Review"
        messages={mockMessages}
        status="closed"
        lastActivityAt={mockMessages[2].timestamp}
        silenceThresholdHours={24}
      />
    );

    expect(screen.getByText('closed')).toBeInTheDocument();
  });
});

describe('InboxThread - Message Actions', () => {
  const onMoveMessage = vi.fn();

  beforeEach(() => {
    onMoveMessage.mockClear();
  });

  it('shows move button for each message when handler provided', () => {
    render(
      <InboxThread
        threadId="thread-1"
        subject="Contract Review"
        messages={mockMessages}
        status="open"
        lastActivityAt={mockMessages[2].timestamp}
        silenceThresholdHours={24}
        defaultExpanded
        onMoveMessage={onMoveMessage}
      />
    );

    const moveButtons = screen.getAllByRole('button', { name: /move/i });
    expect(moveButtons.length).toBeGreaterThan(0);
  });

  it('calls onMoveMessage with email_id when move clicked', () => {
    render(
      <InboxThread
        threadId="thread-1"
        subject="Contract Review"
        messages={mockMessages}
        status="open"
        lastActivityAt={mockMessages[2].timestamp}
        silenceThresholdHours={24}
        defaultExpanded
        onMoveMessage={onMoveMessage}
      />
    );

    const moveButtons = screen.getAllByRole('button', { name: /move/i });
    fireEvent.click(moveButtons[0]);

    expect(onMoveMessage).toHaveBeenCalledWith('email-1', 'thread-1');
  });

  it('does not show move buttons when no handler provided', () => {
    render(
      <InboxThread
        threadId="thread-1"
        subject="Contract Review"
        messages={mockMessages}
        status="open"
        lastActivityAt={mockMessages[2].timestamp}
        silenceThresholdHours={24}
        defaultExpanded
      />
    );

    expect(screen.queryByRole('button', { name: /move/i })).not.toBeInTheDocument();
  });
});

describe('InboxThread - Empty State', () => {
  it('shows empty state when no messages', () => {
    render(
      <InboxThread
        threadId="thread-1"
        subject="Empty Thread"
        messages={[]}
        status="open"
        lastActivityAt={Date.now()}
        silenceThresholdHours={24}
        defaultExpanded
      />
    );

    expect(screen.getByText(/no messages/i)).toBeInTheDocument();
  });
});
