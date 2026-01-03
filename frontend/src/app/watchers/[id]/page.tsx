'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, type Watcher, type Thread, type VigilEvent, type WatcherPolicy, type Reminder, type SignalProposal } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { EventTable } from '@/components/events/event-table';
import { NotificationChannelEditor, NotificationChannelSummary } from '@/components/notification-channel-editor';
import { AppHeader, SubHeader } from '@/components/layout';
import { formatFriendlyDate } from '@/lib/format';
import { WatcherInbox } from '@/components/watcher/watcher-inbox';
import { getSilenceState, computeSilenceDuration, formatSilenceDuration } from '@/lib/silence';

// Time utilities for human-readable AM/PM format with timezone handling
function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function utcTimeToLocal(utcTime: string | undefined): { hour: number; minute: number; period: 'AM' | 'PM' } {
  if (!utcTime) return { hour: 9, minute: 0, period: 'AM' };
  
  // Parse UTC time (format: HH:MM:SSZ or HH:MM:SS)
  const match = utcTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?Z?$/);
  if (!match) return { hour: 9, minute: 0, period: 'AM' };
  
  const utcHour = parseInt(match[1], 10);
  const utcMinute = parseInt(match[2], 10);
  
  // Create a date object for today at the UTC time
  const today = new Date();
  const utcDate = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    utcHour,
    utcMinute,
    0
  ));
  
  // Get local hours and minutes
  const localHour = utcDate.getHours();
  const localMinute = utcDate.getMinutes();
  
  // Convert to 12-hour format
  const period: 'AM' | 'PM' = localHour >= 12 ? 'PM' : 'AM';
  const hour12 = localHour === 0 ? 12 : localHour > 12 ? localHour - 12 : localHour;
  
  return { hour: hour12, minute: localMinute, period };
}

function localTimeToUtc(hour: number, minute: number, period: 'AM' | 'PM'): string {
  // Convert 12-hour to 24-hour
  let hour24 = hour;
  if (period === 'AM' && hour === 12) hour24 = 0;
  else if (period === 'PM' && hour !== 12) hour24 = hour + 12;
  
  // Create a date object for today at the local time
  const today = new Date();
  const localDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    hour24,
    minute,
    0
  );
  
  // Get UTC hours and minutes
  const utcHour = localDate.getUTCHours();
  const utcMinute = localDate.getUTCMinutes();
  
  return `${utcHour.toString().padStart(2, '0')}:${utcMinute.toString().padStart(2, '0')}:00Z`;
}

function formatTimeForDisplay(utcTime: string | undefined): string {
  const { hour, minute, period } = utcTimeToLocal(utcTime);
  const minuteStr = minute.toString().padStart(2, '0');
  return `${hour}:${minuteStr} ${period}`;
}

// Format monthly reporting day for display
function formatMonthlyDay(day: number | string | undefined): string {
  if (day === undefined || day === null) return '1st';
  const num = typeof day === 'string' ? parseInt(day, 10) : day;
  if (isNaN(num) || num < 1) return '1st';
  if (num >= 29) return 'Last day';
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  const suffix = suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0];
  return `${num}${suffix}`;
}

// Monthly day options for dropdown
const MONTHLY_DAY_OPTIONS = [
  { value: 1, label: '1st' },
  { value: 2, label: '2nd' },
  { value: 3, label: '3rd' },
  { value: 4, label: '4th' },
  { value: 5, label: '5th' },
  { value: 6, label: '6th' },
  { value: 7, label: '7th' },
  { value: 8, label: '8th' },
  { value: 9, label: '9th' },
  { value: 10, label: '10th' },
  { value: 11, label: '11th' },
  { value: 12, label: '12th' },
  { value: 13, label: '13th' },
  { value: 14, label: '14th' },
  { value: 15, label: '15th' },
  { value: 16, label: '16th' },
  { value: 17, label: '17th' },
  { value: 18, label: '18th' },
  { value: 19, label: '19th' },
  { value: 20, label: '20th' },
  { value: 21, label: '21st' },
  { value: 22, label: '22nd' },
  { value: 23, label: '23rd' },
  { value: 24, label: '24th' },
  { value: 25, label: '25th' },
  { value: 26, label: '26th' },
  { value: 27, label: '27th' },
  { value: 28, label: '28th' },
  { value: 29, label: 'Last day of month' },
];

// Common timezone options (organized by region)
const TIMEZONE_OPTIONS = [
  { value: '', label: 'UTC (Default)' },
  // Americas
  { value: 'America/New_York', label: 'Eastern Time (New York)' },
  { value: 'America/Chicago', label: 'Central Time (Chicago)' },
  { value: 'America/Denver', label: 'Mountain Time (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
  { value: 'America/Phoenix', label: 'Arizona (Phoenix)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'America/Toronto', label: 'Eastern Time (Toronto)' },
  { value: 'America/Vancouver', label: 'Pacific Time (Vancouver)' },
  // Europe
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European (Paris)' },
  { value: 'Europe/Berlin', label: 'Central European (Berlin)' },
  { value: 'Europe/Amsterdam', label: 'Central European (Amsterdam)' },
  // Asia/Pacific
  { value: 'Asia/Tokyo', label: 'Japan (Tokyo)' },
  { value: 'Asia/Shanghai', label: 'China (Shanghai)' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'India (Kolkata)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT/AEST)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEDT/AEST)' },
  { value: 'Pacific/Auckland', label: 'New Zealand (Auckland)' },
];

// Time picker component
function TimePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string | undefined;
  onChange: (utcTime: string) => void;
  disabled?: boolean;
}) {
  const { hour, minute, period } = utcTimeToLocal(value);
  const timezone = getUserTimezone();

  const handleChange = (newHour: number, newMinute: number, newPeriod: 'AM' | 'PM') => {
    onChange(localTimeToUtc(newHour, newMinute, newPeriod));
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <select
          value={hour}
          onChange={(e) => handleChange(parseInt(e.target.value), minute, period)}
          disabled={disabled}
          className="input w-20"
        >
          {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="text-gray-500">:</span>
        <select
          value={minute}
          onChange={(e) => handleChange(hour, parseInt(e.target.value), period)}
          disabled={disabled}
          className="input w-20"
        >
          {[0, 15, 30, 45].map((m) => (
            <option key={m} value={m}>
              {m.toString().padStart(2, '0')}
            </option>
          ))}
        </select>
        <select
          value={period}
          onChange={(e) => handleChange(hour, minute, e.target.value as 'AM' | 'PM')}
          disabled={disabled}
          className="input w-20"
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
      <p className="text-xs text-gray-500">Your timezone: {timezone}</p>
    </div>
  );
}

// Inline component for managing allowed senders list
function AllowedSendersEditor({ 
  senders, 
  onChange 
}: { 
  senders: string[]; 
  onChange: (senders: string[]) => void;
}) {
  const [newSender, setNewSender] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const email = newSender.trim().toLowerCase();
    if (!email) return;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Invalid email format');
      return;
    }
    
    if (senders.includes(email)) {
      setError('Email already added');
      return;
    }
    
    onChange([...senders, email]);
    setNewSender('');
    setError(null);
  };

  const handleRemove = (index: number) => {
    onChange(senders.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={newSender}
          onChange={(e) => { setNewSender(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          placeholder="allowed@sender.com"
          className={`input flex-1 text-sm ${error ? 'border-red-300' : ''}`}
        />
        <button
          type="button"
          onClick={handleAdd}
          className="btn btn-secondary text-sm"
        >
          Add
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      
      {senders.length === 0 ? (
        <p className="text-xs text-gray-500">
          No sender restrictions. All email addresses can send to this watcher.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {senders.map((sender, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm">
              {sender}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="text-gray-400 hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailListEditor({
  emails,
  onChange,
  placeholder,
  emptyHint,
}: {
  emails: string[];
  onChange: (emails: string[]) => void;
  placeholder: string;
  emptyHint: string;
}) {
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Invalid email format');
      return;
    }

    if (emails.includes(email)) {
      setError('Email already added');
      return;
    }

    onChange([...emails, email]);
    setNewEmail('');
    setError(null);
  };

  const handleRemove = (index: number) => {
    onChange(emails.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => {
            setNewEmail(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          placeholder={placeholder}
          className={`input flex-1 text-sm ${error ? 'border-red-300' : ''}`}
        />
        <button type="button" onClick={handleAdd} className="btn btn-secondary text-sm">
          Add
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}

      {emails.length === 0 ? (
        <p className="text-xs text-gray-500">{emptyHint}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {emails.map((email, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm"
            >
              {email}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="text-gray-400 hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function WatcherDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const watcherId = params.id as string;
  
  // Get selected thread from URL
  const selectedThreadId = searchParams.get('thread');
  
  const [watcher, setWatcher] = useState<(Watcher & { thread_count?: number; open_threads?: number }) | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [events, setEvents] = useState<VigilEvent[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [messages, setMessages] = useState<VigilEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'messages' | 'events' | 'settings'>('overview');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreEvents, setHasMoreEvents] = useState(true);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  // Proposals state
  const [proposals, setProposals] = useState<SignalProposal[]>([]);
  const [proposalSummary, setProposalSummary] = useState<{ pending: number; auto_applied_today: number } | null>(null);

  // Settings form state
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState<Partial<WatcherPolicy>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  // Handle thread selection via URL
  const handleSelectThread = useCallback((threadId: string | null) => {
    const url = new URL(window.location.href);
    if (threadId) {
      url.searchParams.set('thread', threadId);
    } else {
      url.searchParams.delete('thread');
    }
    router.push(url.pathname + url.search, { scroll: false });
  }, [router]);

  const fetchData = useCallback(async () => {
    try {
      const [watcherResult, threadsResult, eventsResult, remindersResult, proposalsResult] = await Promise.all([
        api.getWatcher(watcherId),
        api.getThreads(watcherId),
        api.getEvents(watcherId, { limit: 300 }),
        api.getReminders(watcherId),
        api.getProposals(watcherId, 'pending'),
      ]);
      setWatcher(watcherResult.watcher);
      setThreads(threadsResult.threads || []);
      // Ensure events are sorted newest-first for consistent display and pagination
      const events = eventsResult.events || [];
      setEvents([...events].sort((a, b) => b.timestamp - a.timestamp));
      setReminders(remindersResult.reminders || []);
      setHasMoreEvents(events.length === 300);
      setNewName(watcherResult.watcher.name);
      setPolicyForm(watcherResult.watcher.policy || {});
      // Proposals
      setProposals(proposalsResult.proposals || []);
      setProposalSummary(proposalsResult.summary || null);
    } catch (err) {
      console.error('Failed to fetch watcher:', err);
      setError(err instanceof Error ? err.message : 'Failed to load watcher');
    } finally {
      setIsLoading(false);
    }
  }, [watcherId]);

  const fetchMessages = useCallback(async (loadMore = false) => {
    if (!watcherId) return;
    setLoadingMessages(true);
    try {
      let oldestMessage: number | undefined;
      if (loadMore) {
        setMessages(prev => {
          if (prev.length > 0) {
            oldestMessage = Math.min(...prev.map(m => m.timestamp));
          }
          return prev;
        });
      }
      
      const result = await api.getEvents(watcherId, {
        type: 'EMAIL_RECEIVED',
        limit: 50,
        before: oldestMessage,
      });
      
      if (loadMore) {
        setMessages(prev => [...prev, ...(result.events || [])]);
      } else {
        setMessages(result.events || []);
      }
      setHasMoreMessages(result.pagination?.has_more || false);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, [watcherId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Preload messages on initial load for dashboard
  useEffect(() => {
    if (messages.length === 0 && !loadingMessages) {
      fetchMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMessages]);

  // Build email_id to thread_id mapping from THREAD_OPENED and THREAD_EMAIL_ADDED events
  // This is needed because the commercial model doesn't put thread_id on EMAIL_RECEIVED events
  const emailToThreadMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) {
      if (event.type === 'THREAD_OPENED' || event.type === 'THREAD_EMAIL_ADDED') {
        const data = { ...event.payload, ...event } as Record<string, unknown>;
        const threadId = String(data.thread_id || '');
        const emailId = String(data.email_id || '');
        if (threadId && emailId) {
          map.set(emailId, threadId);
        }
      }
    }
    return map;
  }, [events]);

  const handleActivate = async () => {
    if (!watcher) return;
    setActionLoading('activate');
    setError(null);
    try {
      await api.activateWatcher(watcherId);
      await fetchData();
    } catch (err) {
      console.error('Failed to activate watcher:', err);
      setError(err instanceof Error ? err.message : 'Failed to activate watcher. Make sure you have at least one notification channel configured.');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async () => {
    if (!watcher) return;
    setActionLoading('pause');
    setError(null);
    try {
      await api.pauseWatcher(watcherId);
      await fetchData();
    } catch (err) {
      console.error('Failed to pause watcher:', err);
      setError(err instanceof Error ? err.message : 'Failed to pause watcher');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async () => {
    if (!watcher) return;
    setActionLoading('resume');
    setError(null);
    try {
      await api.resumeWatcher(watcherId);
      await fetchData();
    } catch (err) {
      console.error('Failed to resume watcher:', err);
      setError(err instanceof Error ? err.message : 'Failed to resume watcher');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCloseThread = async (threadId: string) => {
    try {
      await api.closeThread(watcherId, threadId);
      await fetchData(); // Refresh all data
    } catch (err) {
      console.error('Failed to close thread:', err);
      setError(err instanceof Error ? err.message : 'Failed to close thread');
    }
  };

  const handleUpdateName = async () => {
    if (!watcher || !newName.trim()) return;
    setActionLoading('name');
    setError(null);
    try {
      await api.updateWatcher(watcherId, { name: newName.trim() });
      await fetchData();
      setEditingName(false);
    } catch (err) {
      console.error('Failed to update name:', err);
      setError(err instanceof Error ? err.message : 'Failed to update watcher name');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdatePolicy = async () => {
    if (!watcher) return;
    setActionLoading('policy');
    setError(null);
    try {
      // Build the full policy with required fields (commercial model - no deadlines/urgency)
      const fullPolicy: WatcherPolicy = {
        allowed_senders: policyForm.allowed_senders || [],
        silence_threshold_hours: policyForm.silence_threshold_hours || 72,
        notification_channels: policyForm.notification_channels || [],
        reporting_cadence: policyForm.reporting_cadence || 'on_demand',
        reporting_recipients: policyForm.reporting_recipients || [],
        reporting_time: policyForm.reporting_time,
        reporting_day: policyForm.reporting_day,
        timezone: policyForm.timezone,
      };
      await api.updateWatcherPolicy(watcherId, fullPolicy);
      await fetchData();
      setEditingPolicy(false);
    } catch (err) {
      console.error('Failed to update policy:', err);
      setError(err instanceof Error ? err.message : 'Failed to update watcher policy');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!watcher || deleteConfirmText !== watcher.name) return;
    setActionLoading('delete');
    setError(null);
    try {
      await api.deleteWatcher(watcherId);
      router.push('/dashboard');
    } catch (err) {
      console.error('Failed to delete watcher:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete watcher');
      setActionLoading(null);
    }
  };

  const handleLoadMoreEvents = async () => {
    if (loadingMoreEvents || !hasMoreEvents || events.length === 0) return;

    setLoadingMoreEvents(true);
    try {
      // Events are maintained newest-first; oldest is the last item
      const oldestEvent = events[events.length - 1];
      const result = await api.getEvents(watcherId, {
        limit: 100,
        before: oldestEvent.timestamp,
      });

      setEvents(prev => {
        // Merge and dedupe by event_id, then sort newest-first
        const merged = [...prev, ...result.events];
        const byId = new Map<string, VigilEvent>();
        for (const ev of merged) {
          byId.set(ev.event_id, ev);
        }
        return Array.from(byId.values()).sort((a, b) => b.timestamp - a.timestamp);
      });
      setHasMoreEvents(result.events.length === 100);
    } catch (err) {
      console.error('Failed to load more events:', err);
      setError(err instanceof Error ? err.message : 'Failed to load more events');
    } finally {
      setLoadingMoreEvents(false);
    }
  };

  const handleLoadMoreMessages = async () => {
    if (loadingMessages || !hasMoreMessages) return;
    await fetchMessages(true);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-page">
        <AppHeader backHref="/dashboard" />
        <div className="flex items-center justify-center py-20">
          <span className="spinner mr-3" />
          <span className="text-sm text-gray-600">Loading watcher...</span>
        </div>
      </div>
    );
  }

  if (!watcher) {
    return (
      <div className="min-h-screen bg-surface-page">
        <AppHeader backHref="/dashboard" />
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">Watcher not found</h2>
            <p className="text-gray-600 mt-2">{error || 'The watcher you are looking for does not exist.'}</p>
            <Link href="/dashboard" className="text-blue-600 hover:text-blue-700 mt-4 block">
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const openThreads = threads.filter(t => t.status === 'open');
  const closedThreads = threads.filter(t => t.status === 'closed');

  // Build action buttons for header
  const headerActions = (
    <div className="flex items-center gap-3">
      <span className={`badge ${watcher.status === 'active' ? 'badge-ok' : watcher.status === 'paused' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>
        {watcher.status}
      </span>
      {watcher.status === 'active' ? (
        <button
          onClick={handlePause}
          disabled={!!actionLoading}
          className="btn btn-secondary text-sm"
        >
          {actionLoading === 'pause' ? 'Pausing...' : 'Pause'}
        </button>
      ) : watcher.status === 'paused' ? (
        <button
          onClick={handleResume}
          disabled={!!actionLoading}
          className="btn btn-primary text-sm"
        >
          {actionLoading === 'resume' ? 'Resuming...' : 'Resume'}
        </button>
      ) : (
        <button
          onClick={handleActivate}
          disabled={!!actionLoading}
          className="btn btn-primary text-sm"
        >
          {actionLoading === 'activate' ? 'Activating...' : 'Activate'}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-page">
      <AppHeader />
      <SubHeader
        backHref="/dashboard"
        backLabel="Dashboard"
        title={watcher.name}
        subtitle={watcher.ingestion_address}
        rightContent={headerActions}
      />

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200">
          <div className="max-w-6xl mx-auto px-6 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-surface-raised border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('messages')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'messages'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Messages
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'events'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Events
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'settings'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Settings
            </button>
                {/* Proposals integrated in Overview; no separate tab yet */}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Stats Bar */}
            <div className="flex items-center gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{openThreads.length}</span>
                <span>open thread{openThreads.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">
                  {openThreads.filter(t => getSilenceState({
                    lastActivityAt: t.last_activity_at,
                    status: t.status,
                    thresholdHours: watcher.policy?.silence_threshold_hours || 72,
                  }) === 'silent').length}
                </span>
                <span>silent</span>
              </div>
              {(() => {
                // Find longest silent thread
                const silentThreads = openThreads.filter(t => getSilenceState({
                  lastActivityAt: t.last_activity_at,
                  status: t.status,
                  thresholdHours: watcher.policy?.silence_threshold_hours || 72,
                }) === 'silent');
                if (silentThreads.length === 0) return null;
                const longestSilence = Math.max(...silentThreads.map(t => computeSilenceDuration(t.last_activity_at)));
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">longest silence:</span>
                    <span className="font-medium text-amber-600">{formatSilenceDuration(longestSilence)}</span>
                  </div>
                );
              })()}
            </div>

            {/* Inbox Table */}
            <div className="panel" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
              <WatcherInbox
                threads={threads}
                events={events}
                silenceThresholdHours={watcher.policy?.silence_threshold_hours || 72}
                selectedThreadId={selectedThreadId}
                onSelectThread={handleSelectThread}
                onCloseThread={handleCloseThread}
              />
            </div>

            {/* Ingestion Email Hint */}
            {threads.length === 0 && (
              <div className="text-center py-4 text-gray-500 text-sm">
                Forward emails to <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">{watcher.ingestion_address}</code> to start tracking.
              </div>
            )}
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="panel">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">All Messages</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {messages.length > 0
                      ? <>Showing <span className="font-mono">{messages.length}</span> message{messages.length === 1 ? '' : 's'}{hasMoreMessages ? ' • Load more to see all' : ' • All messages loaded'}</>
                      : 'All emails received by this watcher with processing decisions'
                    }
                  </p>
                </div>
                {messages.length > 0 && (
                  <button
                    onClick={() => fetchMessages()}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Reload
                  </button>
                )}
              </div>
            </div>
            {loadingMessages && messages.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                Loading messages...
              </div>
            ) : messages.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Received
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        From
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subject
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Decision
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {messages.map((message) => {
                      const data = { ...message.payload, ...message } as Record<string, unknown>;
                      const sender = String(data.original_sender || data.sender || 'Unknown');
                      const subject = String(data.subject || 'No subject');
                      const emailId = String(data.email_id || message.event_id || '');
                      // Use the email-to-thread mapping (commercial model) or fall back to legacy field
                      const threadId = emailToThreadMap.get(emailId) || String(data.routed_to_thread_id || '');
                      const thread = threads.find(t => t.thread_id === threadId);
                      
                      return (
                        <tr key={message.event_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                            {formatFriendlyDate(message.timestamp)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            <div className="max-w-xs truncate" title={sender}>
                              {sender.split('@')[0]}
                            </div>
                            <div className="text-xs text-gray-400 truncate">
                              @{sender.split('@')[1] || ''}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div className="max-w-md truncate" title={subject}>
                              {subject}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {threadId ? (
                              thread ? (
                                <span className="text-gray-600">
                                  Added to thread
                                </span>
                              ) : (
                                <span className="text-gray-600">Added to conversation</span>
                              )
                            ) : (
                              <span className="text-gray-500">
                                No action needed
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {hasMoreMessages && (
                  <div className="p-4 border-t border-gray-200">
                    <button
                      onClick={handleLoadMoreMessages}
                      disabled={loadingMessages}
                      className="btn btn-secondary w-full"
                    >
                      {loadingMessages ? 'Loading...' : 'Load more messages'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                No messages yet. Forward emails to <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{watcher.ingestion_address}</code> to start tracking.
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="panel">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">Event Log</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {events.length > 0 
                      ? <>Showing <span className="font-mono">{events.length}</span> event{events.length === 1 ? '' : 's'}{hasMoreEvents ? ' • Load more to see complete history' : ' • Complete history'}</>
                      : 'Complete history of all events for this watcher'
                    }
                  </p>
                </div>
                {events.length > 0 && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setEvents([]);
                        setHasMoreEvents(false);
                      }}
                      className="text-xs text-gray-600 hover:text-gray-800"
                      title="Clears the table view only; does not delete history"
                    >
                      Clear view
                    </button>
                    <button
                      onClick={() => fetchData()}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      Reload
                    </button>
                  </div>
                )}
              </div>
            </div>
            <EventTable 
              events={events} 
              emptyMessage="No events yet. Events will appear here as the watcher processes emails." 
              onLoadMore={handleLoadMoreEvents}
              hasMore={hasMoreEvents}
              isLoading={loadingMoreEvents}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* General Settings */}
            <div className="panel">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">General Settings</h2>
              </div>
              <div className="p-6 space-y-6">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Watcher Name</label>
                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="input flex-1"
                        placeholder="Watcher name"
                      />
                      <button
                        onClick={handleUpdateName}
                        disabled={actionLoading === 'name' || !newName.trim()}
                        className="btn btn-primary text-sm"
                      >
                        {actionLoading === 'name' ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingName(false);
                          setNewName(watcher.name);
                        }}
                        className="btn btn-secondary text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">{watcher.name}</span>
                      <button
                        onClick={() => setEditingName(true)}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>

                {/* Ingest Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ingestion Email</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-gray-100 rounded text-sm font-mono text-gray-700 truncate">
                      {watcher.ingestion_address}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(watcher.ingestion_address)}
                      className="btn btn-secondary text-sm"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Forward emails to this address to start tracking.</p>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <span className={`badge ${watcher.status === 'active' ? 'badge-ok' : watcher.status === 'paused' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>
                    {watcher.status}
                  </span>
                </div>

                {/* Created At */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Created</label>
                  <span className="text-gray-900">{formatDate(watcher.created_at)}</span>
                </div>

                {/* Watcher Stats */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Watcher Statistics</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Total Threads</div>
                      <div className="text-2xl font-semibold text-gray-900 font-mono">
                        {watcher.thread_count ?? threads.length}
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Open Threads</div>
                      <div className="text-2xl font-semibold text-green-600 font-mono">
                        {watcher.open_threads ?? openThreads.length}
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Closed Threads</div>
                      <div className="text-2xl font-semibold text-gray-600 font-mono">
                        {(watcher.thread_count ?? threads.length) - (watcher.open_threads ?? openThreads.length)}
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Lifetime</div>
                      <div className="text-2xl font-semibold text-gray-900">
                        {(() => {
                          const days = Math.floor((Date.now() - watcher.created_at) / (1000 * 60 * 60 * 24));
                          if (days === 0) return 'Today';
                          if (days === 1) return '1 day';
                          if (days < 30) return `${days} days`;
                          const months = Math.floor(days / 30);
                          if (months === 1) return '1 month';
                          if (months < 12) return `${months} months`;
                          const years = Math.floor(months / 12);
                          if (years === 1) return '1 year';
                          return `${years} years`;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Policy Settings */}
            <div className="panel">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">Policy Configuration</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Configure how this watcher monitors emails and sends alerts</p>
                </div>
                {!editingPolicy && (
                  <button
                    onClick={() => setEditingPolicy(true)}
                    className="btn btn-secondary text-sm"
                  >
                    Edit Policy
                  </button>
                )}
              </div>
              <div className="p-6 space-y-6">
                {editingPolicy ? (
                  <>
                    {/* Timing Thresholds */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">Timing Thresholds</h3>
                      <p className="text-xs text-gray-500 mb-4">Control when Vigil alerts you based on time elapsed</p>
                      <div className="grid grid-cols-1 sm:grid-cols-1 gap-4">
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-gray-700">Silence Threshold</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={policyForm.silence_threshold_hours || 72}
                              onChange={(e) => setPolicyForm({ ...policyForm, silence_threshold_hours: parseInt(e.target.value) || 72 })}
                              className="input w-24"
                              min="1"
                              max="720"
                            />
                            <span className="text-sm text-gray-500">hours</span>
                          </div>
                          <p className="text-xs text-gray-500">Alert when thread has no activity for this duration</p>
                        </div>
                      </div>
                    </div>

                    {/* Timezone */}
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">Timezone</h3>
                      <p className="text-xs text-gray-500 mb-4">Timezone used for report scheduling</p>
                      <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-700">Timezone</label>
                        <select
                          value={policyForm.timezone || ''}
                          onChange={(e) => setPolicyForm({ ...policyForm, timezone: e.target.value || undefined })}
                          className="input w-full max-w-md"
                        >
                          {TIMEZONE_OPTIONS.map(tz => (
                            <option key={tz.value} value={tz.value}>{tz.label}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500">
                          Currently: {policyForm.timezone || 'UTC'} • Your browser is using {getUserTimezone()}
                        </p>
                      </div>
                    </div>

                    {/* Notification Channels */}
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">Notification Channels</h3>
                      <p className="text-xs text-gray-500 mb-4">Where should Vigil send alerts?</p>
                      <NotificationChannelEditor
                        channels={policyForm.notification_channels || []}
                        onChange={(channels) => setPolicyForm({ ...policyForm, notification_channels: channels })}
                        maxWebhooks={5}
                      />
                    </div>

                    {/* Reporting */}
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">Reporting</h3>
                      <p className="text-xs text-gray-500 mb-4">Configure summary report generation and delivery</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-gray-700">Reporting Cadence</label>
                          <select
                            value={policyForm.reporting_cadence || 'on_demand'}
                            onChange={(e) => {
                              const cadence = e.target.value as NonNullable<WatcherPolicy['reporting_cadence']>;
                              setPolicyForm((prev) => {
                                const next: Partial<WatcherPolicy> = { ...prev, reporting_cadence: cadence };

                                if (cadence === 'on_demand') {
                                  next.reporting_time = undefined;
                                  next.reporting_day = undefined;
                                }

                                if (cadence === 'daily') {
                                  next.reporting_time = (typeof prev.reporting_time === 'string' && prev.reporting_time)
                                    ? prev.reporting_time
                                    : '09:00:00Z';
                                  next.reporting_day = undefined;
                                }

                                if (cadence === 'weekly') {
                                  next.reporting_time = (typeof prev.reporting_time === 'string' && prev.reporting_time)
                                    ? prev.reporting_time
                                    : '09:00:00Z';
                                  next.reporting_day = (typeof prev.reporting_day === 'string' && prev.reporting_day)
                                    ? prev.reporting_day
                                    : 'monday';
                                }

                                if (cadence === 'monthly') {
                                  next.reporting_time = (typeof prev.reporting_time === 'string' && prev.reporting_time)
                                    ? prev.reporting_time
                                    : '09:00:00Z';
                                  next.reporting_day = (typeof prev.reporting_day === 'number' && Number.isFinite(prev.reporting_day))
                                    ? prev.reporting_day
                                    : 1;
                                }

                                return next;
                              });
                            }}
                            className="input"
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="on_demand">On demand</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-gray-700">Reporting Time</label>
                          <TimePicker
                            value={policyForm.reporting_time}
                            onChange={(time) => setPolicyForm({ ...policyForm, reporting_time: time })}
                            disabled={(policyForm.reporting_cadence || 'on_demand') === 'on_demand'}
                          />
                        </div>
                      </div>

                      {(policyForm.reporting_cadence || 'on_demand') === 'weekly' && (
                        <div className="mt-4 space-y-1">
                          <label className="block text-sm font-medium text-gray-700">Reporting Day (weekly)</label>
                          <select
                            value={typeof policyForm.reporting_day === 'string' ? policyForm.reporting_day : 'monday'}
                            onChange={(e) => setPolicyForm({ ...policyForm, reporting_day: e.target.value })}
                            className="input"
                          >
                            <option value="monday">Monday</option>
                            <option value="tuesday">Tuesday</option>
                            <option value="wednesday">Wednesday</option>
                            <option value="thursday">Thursday</option>
                            <option value="friday">Friday</option>
                            <option value="saturday">Saturday</option>
                            <option value="sunday">Sunday</option>
                          </select>
                        </div>
                      )}

                      {(policyForm.reporting_cadence || 'on_demand') === 'monthly' && (
                        <div className="mt-4 space-y-1">
                          <label className="block text-sm font-medium text-gray-700">Reporting Day (monthly)</label>
                          <select
                            value={typeof policyForm.reporting_day === 'number' ? Math.min(policyForm.reporting_day, 29) : 1}
                            onChange={(e) => setPolicyForm({ ...policyForm, reporting_day: Number(e.target.value) })}
                            className="input w-full max-w-xs"
                          >
                            {MONTHLY_DAY_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-500">"Last day" ensures reports go out on the final day regardless of month length.</p>
                        </div>
                      )}

                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Report Recipients</label>
                        <EmailListEditor
                          emails={policyForm.reporting_recipients || []}
                          onChange={(emails) => setPolicyForm({ ...policyForm, reporting_recipients: emails })}
                          placeholder="reports@example.com"
                          emptyHint="No recipients configured. Reports will not be sent."
                        />
                      </div>
                    </div>

                    {/* Allowed Senders */}
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">Allowed Senders</h3>
                      <p className="text-xs text-gray-500 mb-4">Restrict which email addresses can send to this watcher (leave empty to allow all)</p>
                      <AllowedSendersEditor
                          senders={policyForm.allowed_senders || []}
                          onChange={(senders) => setPolicyForm({ ...policyForm, allowed_senders: senders })}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-6 border-t border-gray-200">
                      <button
                        onClick={handleUpdatePolicy}
                        disabled={actionLoading === 'policy'}
                        className="btn btn-primary text-sm"
                      >
                        {actionLoading === 'policy' ? 'Saving...' : 'Save Policy'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingPolicy(false);
                          setPolicyForm(watcher.policy || {});
                        }}
                        className="btn btn-secondary text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    {/* Timing Display */}
                    <div>
                      <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-3">Timing Thresholds</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-1 gap-4">
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs text-gray-500 mb-1">Silence Threshold</div>
                          <div className="text-lg font-semibold text-gray-900"><span className="font-mono">{watcher.policy?.silence_threshold_hours || 72}</span>h</div>
                          <p className="text-xs text-gray-500 mt-1">Alert when thread has no activity for this duration</p>
                        </div>
                      </div>
                    </div>

                    {/* Timezone Display */}
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-3">Timezone</h3>
                      <div className="p-3 bg-gray-50 rounded-lg inline-block">
                        <div className="text-xs text-gray-500 mb-1">Report Scheduling</div>
                        <div className="text-sm font-medium text-gray-900">
                          {watcher.policy?.timezone 
                            ? TIMEZONE_OPTIONS.find(tz => tz.value === watcher.policy?.timezone)?.label || watcher.policy.timezone
                            : 'UTC (Default)'}
                        </div>
                      </div>
                    </div>

                    {/* Notification Channels Display */}
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-3">Notification Channels</h3>
                      <NotificationChannelSummary channels={watcher.policy?.notification_channels || []} />
                    </div>

                    {/* Reporting Display */}
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-3">Reporting</h3>
                      <div className="text-sm text-gray-700 space-y-1">
                        <div>
                          <span className="text-gray-500">Cadence:</span>{' '}
                          <span className="text-gray-900">{(watcher.policy?.reporting_cadence || 'on_demand').charAt(0).toUpperCase() + (watcher.policy?.reporting_cadence || 'on_demand').slice(1).replace(/_/g, ' ')}</span>
                        </div>
                        {watcher.policy?.reporting_cadence && watcher.policy.reporting_cadence !== 'on_demand' && (
                          <>
                            {watcher.policy.reporting_time && (
                              <div>
                                <span className="text-gray-500">Time:</span>{' '}
                                <span className="font-mono text-gray-700">{formatTimeForDisplay(watcher.policy.reporting_time)}</span>{' '}
                                <span className="text-xs text-gray-500">({getUserTimezone()})</span>
                              </div>
                            )}
                            {watcher.policy.reporting_cadence === 'weekly' && watcher.policy.reporting_day != null && (
                              <div>
                                <span className="text-gray-500">Day:</span>{' '}
                                <span className="text-gray-700 capitalize">{String(watcher.policy.reporting_day)}</span>
                              </div>
                            )}
                            {watcher.policy.reporting_cadence === 'monthly' && watcher.policy.reporting_day != null && (
                              <div>
                                <span className="text-gray-500">Day:</span>{' '}
                                <span className="text-gray-700">{formatMonthlyDay(watcher.policy.reporting_day)}</span>
                              </div>
                            )}
                          </>
                        )}
                        <div>
                          <span className="text-gray-500">Recipients:</span>{' '}
                          {watcher.policy?.reporting_recipients?.length
                            ? <span className="text-gray-900">{watcher.policy.reporting_recipients.join(', ')}</span>
                            : <span className="text-gray-500">None</span>
                          }
                        </div>
                      </div>
                    </div>

                    {/* Allowed Senders Display */}
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-3">Allowed Senders</h3>
                      {watcher.policy?.allowed_senders?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {watcher.policy.allowed_senders.map((sender, i) => (
                            <span key={i} className="inline-flex items-center px-2.5 py-1 bg-gray-100 rounded text-sm text-gray-700">
                              {sender}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">All senders allowed</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Developer Tools */}
            <div className="panel border-purple-200">
              <div className="p-4 border-b border-purple-200 bg-purple-50">
                <h2 className="font-semibold text-purple-900">E2E Testing Tools</h2>
                <p className="text-xs text-purple-600 mt-1">Test the full email pipeline end-to-end</p>
              </div>
              <div className="p-6 space-y-6">
                {/* Test Scenarios - Full E2E */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Simulate Email Ingestion</h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Run pre-built scenarios that simulate real emails being forwarded to your watcher.
                    These test the complete pipeline: ingestion → thread creation → silence tracking.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Action Request */}
                    <button
                      onClick={async () => {
                        try {
                          const res = await api.testScenario(watcherId, 'action_request');
                          if (res.success) {
                            alert(`Action request scenario sent!\n\nEvents generated: ${res.events_generated}\nTypes: ${res.event_types?.join(', ')}`);
                          } else {
                            alert('Failed: ' + (res.error || 'Unknown error'));
                          }
                        } catch (err) {
                          alert('Error: ' + (err instanceof Error ? err.message : 'Failed'));
                        }
                      }}
                      className="flex items-center gap-3 p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-left transition-colors"
                    >
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">Action Request</p>
                        <p className="text-xs text-gray-500 truncate">Email requiring response</p>
                      </div>
                    </button>

                    {/* Simple Info */}
                    <button
                      onClick={async () => {
                        try {
                          const res = await api.testScenario(watcherId, 'simple_info');
                          if (res.success) {
                            alert(`Simple info scenario sent!\n\nEvents generated: ${res.events_generated}\nTypes: ${res.event_types?.join(', ')}`);
                          } else {
                            alert('Failed: ' + (res.error || 'Unknown error'));
                          }
                        } catch (err) {
                          alert('Error: ' + (err instanceof Error ? err.message : 'Failed'));
                        }
                      }}
                      className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-left transition-colors"
                    >
                      <div className="p-2 bg-gray-100 rounded-lg flex-shrink-0">
                        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">Simple Info</p>
                        <p className="text-xs text-gray-500 truncate">FYI, no action needed</p>
                      </div>
                    </button>

                    {/* Closure Signal */}
                    <button
                      onClick={async () => {
                        try {
                          const res = await api.testScenario(watcherId, 'closure_signal');
                          if (res.success) {
                            alert(`Closure signal sent!\n\nEvents generated: ${res.events_generated}\nTypes: ${res.event_types?.join(', ')}`);
                          } else {
                            alert('Failed: ' + (res.error || 'Unknown error'));
                          }
                        } catch (err) {
                          alert('Error: ' + (err instanceof Error ? err.message : 'Failed'));
                        }
                      }}
                      className="flex items-center gap-3 p-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg text-left transition-colors"
                    >
                      <div className="p-2 bg-green-100 rounded-lg flex-shrink-0">
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">Closure Signal</p>
                        <p className="text-xs text-gray-500 truncate">Issue resolved email</p>
                      </div>
                    </button>

                    {/* Follow-up */}
                    <button
                      onClick={async () => {
                        try {
                          const res = await api.testScenario(watcherId, 'followup');
                          if (res.success) {
                            alert(`Follow-up scenario sent!\n\nEvents generated: ${res.events_generated}\nTypes: ${res.event_types?.join(', ')}`);
                          } else {
                            alert('Failed: ' + (res.error || 'Unknown error'));
                          }
                        } catch (err) {
                          alert('Error: ' + (err instanceof Error ? err.message : 'Failed'));
                        }
                      }}
                      className="flex items-center gap-3 p-3 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-lg text-left transition-colors"
                    >
                      <div className="p-2 bg-yellow-100 rounded-lg flex-shrink-0">
                        <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">Follow-up</p>
                        <p className="text-xs text-gray-500 truncate">Reply to existing thread</p>
                      </div>
                    </button>

                    {/* Bump */}
                    <button
                      onClick={async () => {
                        try {
                          const res = await api.testScenario(watcherId, 'bump');
                          if (res.success) {
                            alert(`Bump scenario sent!\n\nEvents generated: ${res.events_generated}\nTypes: ${res.event_types?.join(', ')}`);
                          } else {
                            alert('Failed: ' + (res.error || 'Unknown error'));
                          }
                        } catch (err) {
                          alert('Error: ' + (err instanceof Error ? err.message : 'Failed'));
                        }
                      }}
                      className="flex items-center gap-3 p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-left transition-colors"
                    >
                      <div className="p-2 bg-purple-100 rounded-lg flex-shrink-0">
                        <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">Bump</p>
                        <p className="text-xs text-gray-500 truncate">&quot;Any update?&quot; email</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Test Outbound Emails */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Test Outbound Emails</h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Send test versions of notification emails to{' '}
                    <span className="font-mono text-purple-700 bg-purple-50 px-1 rounded">{watcher.policy?.notification_channels?.find(c => c.type === 'email')?.destination || 'configured email'}</span>
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const res = await api.sendTestEmail(watcherId, 'alert');
                          if (res.success) alert('Alert email sent!');
                          else alert('Failed: ' + (res.error || 'Unknown error'));
                        } catch (err) {
                          alert('Error: ' + (err instanceof Error ? err.message : 'Failed to send'));
                        }
                      }}
                      className="p-2 text-xs font-medium bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg transition-colors"
                    >
                      Alert
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const res = await api.sendTestEmail(watcherId, 'digest');
                          if (res.success) alert('Digest email sent!');
                          else alert('Failed: ' + (res.error || 'Unknown error'));
                        } catch (err) {
                          alert('Error: ' + (err instanceof Error ? err.message : 'Failed to send'));
                        }
                      }}
                      className="p-2 text-xs font-medium bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                    >
                      Digest
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const res = await api.sendTestEmail(watcherId, 'report');
                          if (res.success) alert('Report email sent!');
                          else alert('Failed: ' + (res.error || 'Unknown error'));
                        } catch (err) {
                          alert('Error: ' + (err instanceof Error ? err.message : 'Failed to send'));
                        }
                      }}
                      className="p-2 text-xs font-medium bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
                    >
                      Report
                    </button>
                  </div>
                </div>

                {/* Custom Test Email */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Custom Test Email</h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Create a custom test email with specific parameters
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">From Address</label>
                      <input
                        type="email"
                        id="custom-from"
                        placeholder="sender@example.com"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        defaultValue="test@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                      <input
                        type="text"
                        id="custom-subject"
                        placeholder="Test email subject"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        defaultValue="Custom Test Email"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Body</label>
                      <textarea
                        id="custom-body"
                        rows={3}
                        placeholder="Email body content..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        defaultValue="This is a custom test email. Write something that requires a response to test action request detection."
                      />
                    </div>
                    <div className="flex items-end gap-3 sm:col-span-2">
                      <button
                        onClick={async () => {
                          const from = (document.getElementById('custom-from') as HTMLInputElement)?.value;
                          const subject = (document.getElementById('custom-subject') as HTMLInputElement)?.value;
                          const body = (document.getElementById('custom-body') as HTMLTextAreaElement)?.value;
                          
                          try {
                            const res = await api.testIngest(watcherId, {
                              from: from || undefined,
                              subject: subject || undefined,
                              body: body || undefined,
                            });
                            if (res.success) {
                              alert(`Custom email ingested!\n\nEvents generated: ${res.events_generated}\nTypes: ${res.event_types?.join(', ')}`);
                            } else {
                              alert('Failed: ' + (res.error || 'Unknown error'));
                            }
                          } catch (err) {
                            alert('Error: ' + (err instanceof Error ? err.message : 'Failed'));
                          }
                        }}
                        className="px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors whitespace-nowrap"
                      >
                        Send Custom Email
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="panel border-red-200">
              <div className="p-4 border-b border-red-200 bg-red-50">
                <h2 className="font-semibold text-red-900">Danger Zone</h2>
              </div>
              <div className="p-6">
                {showDeleteConfirm ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-700">
                      This action cannot be undone. All threads and event history for this watcher will be permanently deleted.
                    </p>
                    <p className="text-sm text-gray-700">
                      Please type <strong>{watcher.name}</strong> to confirm deletion:
                    </p>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      className="input"
                      placeholder={watcher.name}
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleDelete}
                        disabled={deleteConfirmText !== watcher.name || actionLoading === 'delete'}
                        className="btn bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 text-sm"
                      >
                        {actionLoading === 'delete' ? 'Deleting...' : 'Delete Watcher'}
                      </button>
                      <button
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setDeleteConfirmText('');
                        }}
                        className="btn btn-secondary text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Delete this watcher</p>
                      <p className="text-sm text-gray-500">Permanently remove this watcher and all its data.</p>
                    </div>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="btn bg-red-600 text-white hover:bg-red-700 text-sm"
                    >
                      Delete Watcher
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

    </div>
  );
}

export default function WatcherDetailPage() {
  return (
    <RequireAuth>
      <WatcherDetailContent />
    </RequireAuth>
  );
}
