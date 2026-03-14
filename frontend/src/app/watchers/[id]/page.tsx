'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { RequireAuth } from '@/lib/auth';
import { AppHeader } from '@/components/layout';
import { api, type Watcher, type Thread, type Action, type Memory, type Channel } from '@/lib/api';

function formatRelative(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = { active: 'badge-ok', watching: 'badge-warning', resolved: 'badge-neutral', ignored: 'badge-inactive' };
  return map[status] || 'badge-neutral';
}

const TOOLS = [
  { id: 'send_alert', label: 'Send Alert', description: 'Email notification when something needs attention' },
  { id: 'update_thread', label: 'Update Thread', description: 'Change thread status or summary' },
  { id: 'ignore_thread', label: 'Ignore Thread', description: 'Mark thread as noise' },
  { id: 'webhook', label: 'Webhook', description: 'POST to a configured URL' },
];

const THREAD_STATUSES = ['active', 'watching', 'resolved', 'ignored'] as const;

interface Email {
  id: string;
  message_id: string;
  from_addr: string;
  to_addr: string;
  subject: string;
  received_at: string;
  analysis: { summary: string; intent: string; urgency: string; entities: string[] } | null;
  processed: boolean;
}

interface ThreadDetail {
  thread: Thread;
  emails: Email[];
  actions: Action[];
}

// ============================================================================
// Reactivity Slider
// ============================================================================

const REACTIVITY_LEVELS = [
  { value: 1, label: 'Minimum', description: 'Security breaches and active fraud only', color: 'bg-blue-500' },
  { value: 2, label: 'Low', description: 'Security + money at risk + deadlines within 24h', color: 'bg-blue-400' },
  { value: 3, label: 'Balanced', description: 'Financial events, 48h deadlines, direct requests', color: 'bg-yellow-500' },
  { value: 4, label: 'High', description: 'All transactions, weekly deadlines, any personal email', color: 'bg-orange-500' },
  { value: 5, label: 'Maximum', description: 'Everything including subscribed content and events', color: 'bg-red-500' },
];

function ReactivitySlider({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  const current = REACTIVITY_LEVELS.find(l => l.value === value) ?? REACTIVITY_LEVELS[2];

  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Alert Reactivity</h3>
          <p className="text-xs text-gray-500 mt-0.5">How aggressively your watcher alerts you</p>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-gray-900 tabular-nums">{value}/5</span>
          <p className="text-xs text-gray-500">{current?.label}</p>
        </div>
      </div>

      {/* Slider track */}
      <div className="relative mb-4">
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-vigil-600"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #eab308 50%, #ef4444 100%)`,
          }}
        />
        {/* Step markers */}
        <div className="flex justify-between mt-1 px-0.5">
          {REACTIVITY_LEVELS.map(level => (
            <button
              key={level.value}
              onClick={() => onChange(level.value)}
              className={`w-6 h-6 rounded-full text-xs font-semibold transition-all ${
                level.value === value
                  ? `${level.color} text-white shadow-md scale-110`
                  : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              }`}
            >
              {level.value}
            </button>
          ))}
        </div>
      </div>

      {/* Current level description */}
      <div className="bg-surface-sunken rounded p-3">
        <p className="text-sm text-gray-700">{current?.description}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function WatcherDetailContent() {
  const params = useParams();
  const router = useRouter();
  const watcherId = params.id as string;

  const [watcher, setWatcher] = useState<Watcher | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [activeTab, setActiveTab] = useState<'threads' | 'activity' | 'memory' | 'settings'>('threads');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Thread detail
  const [selectedThread, setSelectedThread] = useState<ThreadDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  // Settings editing
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editTools, setEditTools] = useState<string[]>([]);
  const [editSilenceHours, setEditSilenceHours] = useState(48);
  const [editTickInterval, setEditTickInterval] = useState(120);
  const [editReactivity, setEditReactivity] = useState(3);
  const [isSaving, setIsSaving] = useState(false);

  // Memory editing
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editMemContent, setEditMemContent] = useState('');
  const [editMemImportance, setEditMemImportance] = useState(3);
  const [newMemContent, setNewMemContent] = useState('');
  const [newMemImportance, setNewMemImportance] = useState(3);
  const [showNewMem, setShowNewMem] = useState(false);

  // Thread editing (in detail view)
  const [editingThreadSummary, setEditingThreadSummary] = useState(false);
  const [editSummary, setEditSummary] = useState('');

  // Channels
  const [channels, setChannels] = useState<Channel[]>([]);
  const [newChannelType, setNewChannelType] = useState<'email' | 'webhook'>('email');
  const [newChannelDest, setNewChannelDest] = useState('');
  const [showNewChannel, setShowNewChannel] = useState(false);

  // Delete confirmations
  const [showDeleteWatcher, setShowDeleteWatcher] = useState(false);
  const [deleteWatcherConfirmText, setDeleteWatcherConfirmText] = useState('');
  const [deleteThreadId, setDeleteThreadId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 3000); };

  const load = useCallback(async () => {
    try {
      const [w, t, a, m, ch] = await Promise.all([
        api.getWatcher(watcherId),
        api.getThreads(watcherId),
        api.getActions(watcherId).catch(() => ({ actions: [] })),
        api.getMemories(watcherId).catch(() => ({ memories: [] })),
        api.getChannels(watcherId).catch(() => ({ channels: [] })),
      ]);
      setWatcher(w.watcher);
      setThreads(t.threads || []);
      setActions(a.actions || []);
      setMemories(m.memories || []);
      setChannels(ch.channels || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load watcher');
    } finally {
      setIsLoading(false);
    }
  }, [watcherId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (watcher) {
      setEditName(watcher.name);
      setEditPrompt(watcher.system_prompt);
      setEditTools([...watcher.tools]);
      setEditSilenceHours(watcher.silence_hours);
      setEditTickInterval(watcher.tick_interval);
      setEditReactivity(watcher.reactivity ?? 3);
    }
  }, [watcher]);

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard?.writeText(text); showFlash('Copied'); } catch {}
  };

  // ---- Watcher actions ----
  const handlePauseResume = async () => {
    if (!watcher) return;
    try {
      const result = await api.updateWatcher(watcher.id, { status: watcher.status === 'active' ? 'paused' : 'active' } as Partial<Watcher>);
      setWatcher(result.watcher);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleSaveSettings = async () => {
    if (!watcher) return;
    setIsSaving(true);
    try {
      const result = await api.updateWatcher(watcher.id, {
        name: editName.trim(), system_prompt: editPrompt.trim(), tools: editTools,
        silence_hours: editSilenceHours, tick_interval: editTickInterval,
        reactivity: editReactivity,
      } as Partial<Watcher>);
      setWatcher(result.watcher);
      setIsEditing(false);
      showFlash('Settings saved');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save'); }
    finally { setIsSaving(false); }
  };

  const handleDeleteWatcher = async () => {
    if (!watcher) return;
    setIsDeleting(true);
    try { await api.deleteWatcher(watcher.id); router.push('/dashboard'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); setIsDeleting(false); }
  };

  // ---- Thread actions ----
  const openThread = async (threadId: string) => {
    setThreadLoading(true);
    try {
      const result = await api.getThread(watcherId, threadId) as unknown as ThreadDetail;
      setSelectedThread(result);
      setEditingThreadSummary(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load thread'); }
    finally { setThreadLoading(false); }
  };

  const handleThreadStatusChange = async (threadId: string, status: string) => {
    try {
      await api.updateThread(watcherId, threadId, { status } as Partial<Thread>);
      if (selectedThread?.thread.id === threadId) {
        const refreshed = await api.getThread(watcherId, threadId) as unknown as ThreadDetail;
        setSelectedThread(refreshed);
      }
      await load();
      showFlash(`Thread ${status}`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleThreadSummarySave = async () => {
    if (!selectedThread) return;
    try {
      await api.updateThread(watcherId, selectedThread.thread.id, { summary: editSummary } as Partial<Thread>);
      const refreshed = await api.getThread(watcherId, selectedThread.thread.id) as unknown as ThreadDetail;
      setSelectedThread(refreshed);
      setEditingThreadSummary(false);
      await load();
      showFlash('Summary updated');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleDeleteThread = async (threadId: string) => {
    try {
      await api.deleteThread(watcherId, threadId);
      if (selectedThread?.thread.id === threadId) setSelectedThread(null);
      setDeleteThreadId(null);
      await load();
      showFlash('Thread deleted');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  // ---- Memory actions ----
  const handleCreateMemory = async () => {
    if (!newMemContent.trim()) return;
    try {
      await api.createMemory(watcherId, { content: newMemContent.trim(), importance: newMemImportance });
      setNewMemContent('');
      setNewMemImportance(3);
      setShowNewMem(false);
      await load();
      showFlash('Memory created');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleUpdateMemory = async (memId: string) => {
    try {
      await api.updateMemory(watcherId, memId, { content: editMemContent.trim(), importance: editMemImportance });
      setEditingMemoryId(null);
      await load();
      showFlash('Memory updated');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleDeleteMemory = async (memId: string) => {
    try {
      await api.deleteMemory(watcherId, memId);
      await load();
      showFlash('Memory deleted');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleToggleObsolete = async (mem: Memory) => {
    try {
      await api.updateMemory(watcherId, mem.id, { obsolete: !mem.obsolete } as Partial<Memory>);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  // ---- Channel actions ----
  const handleCreateChannel = async () => {
    if (!newChannelDest.trim()) return;
    try {
      await api.createChannel(watcherId, { type: newChannelType, destination: newChannelDest.trim() });
      setNewChannelDest('');
      setShowNewChannel(false);
      await load();
      showFlash('Channel added');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleToggleChannel = async (ch: Channel) => {
    try {
      await api.updateChannel(watcherId, ch.id, { enabled: !ch.enabled } as Partial<Channel>);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleDeleteChannel = async (channelId: string) => {
    try {
      await api.deleteChannel(watcherId, channelId);
      await load();
      showFlash('Channel removed');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const toggleTool = (id: string) => setEditTools(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);

  // ============================================================================
  // Loading / Error states
  // ============================================================================

  if (isLoading) return (
    <div className="min-h-screen bg-surface-page"><AppHeader />
      <main className="max-w-6xl mx-auto px-6 py-8"><div className="panel p-8 text-center"><div className="spinner mx-auto mb-4" /><p className="text-sm text-gray-600">Loading...</p></div></main>
    </div>
  );

  if (error && !watcher) return (
    <div className="min-h-screen bg-surface-page"><AppHeader />
      <main className="max-w-6xl mx-auto px-6 py-8"><div className="panel p-8 text-center"><p className="text-sm text-red-600 mb-4">{error}</p><Link href="/dashboard" className="btn btn-primary">Back</Link></div></main>
    </div>
  );

  if (!watcher) return null;

  // ============================================================================
  // Thread Detail View
  // ============================================================================

  if (selectedThread) {
    const t = selectedThread.thread;
    const emails = selectedThread.emails || [];
    const threadActions = selectedThread.actions || [];

    return (
      <div className="min-h-screen bg-surface-page">
        <AppHeader />
        <main className="max-w-6xl mx-auto px-6 py-8">
          {flash && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">{flash}</div>}

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
            <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
            <span>→</span>
            <button onClick={() => setSelectedThread(null)} className="hover:text-gray-700">{watcher.name}</button>
            <span>→</span>
            <span className="text-gray-900 truncate max-w-xs">{t.subject || 'No subject'}</span>
          </div>

          {/* Thread header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-display font-semibold text-gray-900">{t.subject || 'No subject'}</h1>
              <span className={`badge ${statusBadge(t.status)}`}>{t.status}</span>
            </div>

            {/* Summary — editable */}
            {editingThreadSummary ? (
              <div className="flex gap-2 mb-3">
                <input type="text" value={editSummary} onChange={e => setEditSummary(e.target.value)} className="input flex-1" placeholder="Thread summary..." />
                <button onClick={handleThreadSummarySave} className="btn btn-primary btn-sm">Save</button>
                <button onClick={() => setEditingThreadSummary(false)} className="btn btn-secondary btn-sm">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-3">
                <p className="text-sm text-gray-600">{t.summary || 'No summary'}</p>
                <button onClick={() => { setEditSummary(t.summary || ''); setEditingThreadSummary(true); }} className="btn btn-ghost btn-sm">Edit</button>
              </div>
            )}

            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>Participants: {t.participants.join(', ')}</span>
              <span>{t.email_count} email{t.email_count !== 1 ? 's' : ''}</span>
              <span>First: {formatRelative(t.first_seen)}</span>
              <span>Last: {formatRelative(t.last_activity)}</span>
            </div>
          </div>

          {/* Thread controls */}
          <div className="flex gap-2 mb-6 flex-wrap">
            <button onClick={() => setSelectedThread(null)} className="btn btn-secondary">← Back</button>
            {/* Status switcher */}
            {THREAD_STATUSES.filter(s => s !== t.status).map(s => (
              <button key={s} onClick={() => handleThreadStatusChange(t.id, s)} className="btn btn-secondary btn-sm capitalize">{s === 'resolved' ? 'Close' : s === 'ignored' ? 'Ignore' : `Set ${s}`}</button>
            ))}
            <button onClick={() => setDeleteThreadId(t.id)} className="btn btn-danger-subtle btn-sm ml-auto">Delete thread</button>
          </div>

          {/* Delete confirmation */}
          {deleteThreadId === t.id && (
            <div className="mb-6 bg-red-50 p-4 rounded border border-red-200">
              <p className="text-sm text-red-700 mb-2">Delete this thread and all its emails and actions? This cannot be undone.</p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteThreadId(null)} className="btn btn-secondary btn-sm">Cancel</button>
                <button onClick={() => handleDeleteThread(t.id)} className="btn btn-danger btn-sm">Confirm Delete</button>
              </div>
            </div>
          )}

          {/* Emails */}
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700 mb-3">Emails ({emails.length})</h2>
            <div className="space-y-3">
              {emails.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()).map(email => (
                <div key={email.id} className="panel p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="font-medium text-gray-900">{email.subject}</p>
                      <p className="text-sm text-gray-500">From: {email.from_addr}</p>
                    </div>
                    <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">{formatRelative(email.received_at)}</span>
                  </div>
                  {email.analysis && (
                    <div className="bg-surface-sunken p-4 rounded space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Agent Analysis</span>
                        <span className={`badge badge-sm ${email.analysis.urgency === 'high' ? 'badge-critical' : email.analysis.urgency === 'normal' ? 'badge-warning' : 'badge-neutral'}`}>{email.analysis.urgency}</span>
                      </div>
                      <p className="text-sm text-gray-700"><strong>Summary:</strong> {email.analysis.summary}</p>
                      <p className="text-sm text-gray-700"><strong>Intent:</strong> {email.analysis.intent}</p>
                      {email.analysis.entities.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm text-gray-500">Entities:</span>
                          {email.analysis.entities.map((e, i) => <span key={i} className="badge badge-sm badge-neutral">{e}</span>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Thread action history */}
          {threadActions.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700 mb-3">Agent Actions ({threadActions.length})</h2>
              <div className="panel overflow-x-auto">
                <table className="table-base">
                  <thead><tr>
                    <th className="table-header">When</th>
                    <th className="table-header">Trigger</th>
                    <th className="table-header">Tool</th>
                    <th className="table-header text-center">Result</th>
                    <th className="table-header text-right">Cost</th>
                  </tr></thead>
                  <tbody>
                    {threadActions.map(a => (
                      <tr key={a.id} className="table-row">
                        <td className="table-cell text-sm text-gray-500 tabular-nums">{formatRelative(a.created_at)}</td>
                        <td className="table-cell"><span className="badge badge-sm badge-neutral">{a.trigger_type}</span></td>
                        <td className="table-cell font-mono text-sm">{a.tool || '—'}</td>
                        <td className="table-cell text-center"><span className={`badge badge-sm ${a.result === 'success' ? 'badge-ok' : 'badge-critical'}`}>{a.result}</span></td>
                        <td className="table-cell text-right text-sm text-gray-500 tabular-nums">${a.cost_usd?.toFixed(4) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>
    );
  }

  // ============================================================================
  // Watcher Overview
  // ============================================================================

  const activeThreads = threads.filter(t => t.status === 'active');
  const watchingThreads = threads.filter(t => t.status === 'watching');

  return (
    <div className="min-h-screen bg-surface-page">
      <AppHeader />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Flash / Error */}
        {flash && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">{flash}</div>}
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}<button onClick={() => setError(null)} className="ml-2 underline">dismiss</button></div>}

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link><span>→</span><span className="text-gray-900">{watcher.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-semibold text-gray-900 flex items-center gap-3">
                {watcher.name}
                <span className={`badge ${watcher.status === 'active' ? 'badge-ok' : watcher.status === 'paused' ? 'badge-warning' : 'badge-inactive'}`}>{watcher.status}</span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm font-mono text-gray-500">{watcher.ingestion_address}</code>
                <button className="text-xs text-vigil-700 hover:text-vigil-800" onClick={() => copyToClipboard(watcher.ingestion_address)}>Copy</button>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={async () => { try { await api.sendDigest(watcherId); showFlash('Digest sent to your email'); } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }}} className="btn btn-secondary">Send Digest</button>
              <button onClick={handlePauseResume} className="btn btn-secondary">{watcher.status === 'active' ? 'Pause' : 'Resume'}</button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Active', value: activeThreads.length },
            { label: 'Watching', value: watchingThreads.length },
            { label: 'Emails', value: threads.reduce((s, t) => s + t.email_count, 0) },
            { label: 'Memories', value: memories.length },
            { label: 'Actions', value: actions.length },
          ].map(s => (
            <div key={s.label} className="panel p-3">
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">{s.label}</div>
              <div className="text-xl font-semibold text-gray-900 tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {(['threads', 'activity', 'memory', 'settings'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab ? 'border-vigil-600 text-vigil-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* ================================================================ */}
        {/* THREADS TAB */}
        {/* ================================================================ */}
        {activeTab === 'threads' && (
          <div className="panel overflow-x-auto">
            {threads.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No threads yet. Forward an email to <code>{watcher.ingestion_address}</code>.</div>
            ) : (
              <table className="table-base">
                <thead><tr>
                  <th className="table-header">Subject</th>
                  <th className="table-header">Participants</th>
                  <th className="table-header text-center">Status</th>
                  <th className="table-header text-right">Emails</th>
                  <th className="table-header text-right">Last Activity</th>
                  <th className="table-header text-right">Actions</th>
                </tr></thead>
                <tbody>
                  {threads.sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()).map(thread => (
                    <tr key={thread.id} className="table-row">
                      <td className="table-cell cursor-pointer" onClick={() => openThread(thread.id)}>
                        <div className="font-medium text-gray-900 hover:text-vigil-700">{thread.subject || 'No subject'}</div>
                        {thread.summary && <p className="text-xs text-gray-500 mt-0.5 max-w-md truncate">{thread.summary}</p>}
                      </td>
                      <td className="table-cell text-sm text-gray-600">{thread.participants.join(', ')}</td>
                      <td className="table-cell text-center">
                        <select value={thread.status} onChange={e => handleThreadStatusChange(thread.id, e.target.value)}
                          className="text-xs border rounded px-1.5 py-0.5 bg-white">
                          {THREAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="table-cell text-right tabular-nums font-mono">{thread.email_count}</td>
                      <td className="table-cell text-right text-sm text-gray-500 tabular-nums">{formatRelative(thread.last_activity)}</td>
                      <td className="table-cell text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          <button onClick={() => openThread(thread.id)} className="btn btn-ghost btn-xs">View</button>
                          <button onClick={() => setDeleteThreadId(deleteThreadId === thread.id ? null : thread.id)} className="btn btn-danger-subtle btn-xs">Delete</button>
                        </div>
                        {deleteThreadId === thread.id && (
                          <div className="mt-2 text-left">
                            <p className="text-xs text-red-600 mb-1">Delete thread + emails + actions?</p>
                            <div className="flex gap-1 flex-wrap">
                              <button onClick={() => setDeleteThreadId(null)} className="btn btn-secondary btn-xs">Cancel</button>
                              <button onClick={() => handleDeleteThread(thread.id)} className="btn btn-danger btn-xs">Confirm</button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {threadLoading && <div className="p-4 text-center"><div className="spinner mx-auto" /></div>}
          </div>
        )}

        {/* ================================================================ */}
        {/* ACTIVITY TAB */}
        {/* ================================================================ */}
        {activeTab === 'activity' && (
          <div className="panel overflow-x-auto">
            {actions.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No agent activity yet.</div>
            ) : (
              <table className="table-base">
                <thead><tr>
                  <th className="table-header">When</th>
                  <th className="table-header">Trigger</th>
                  <th className="table-header">Tool</th>
                  <th className="table-header text-center">Result</th>
                  <th className="table-header">Decision</th>
                  <th className="table-header text-right">Cost</th>
                  <th className="table-header text-right">Duration</th>
                </tr></thead>
                <tbody>
                  {actions.map(a => (
                    <tr key={a.id} className="table-row">
                      <td className="table-cell text-sm text-gray-500 tabular-nums">{formatRelative(a.created_at)}</td>
                      <td className="table-cell"><span className="badge badge-sm badge-neutral">{a.trigger_type}</span></td>
                      <td className="table-cell font-mono text-sm">{a.tool || '—'}</td>
                      <td className="table-cell text-center"><span className={`badge badge-sm ${a.result === 'success' ? 'badge-ok' : 'badge-critical'}`}>{a.result}</span></td>
                      <td className="table-cell text-sm text-gray-600 max-w-xs truncate">{a.decision || '—'}</td>
                      <td className="table-cell text-right text-sm text-gray-500 tabular-nums">${a.cost_usd?.toFixed(4) || '—'}</td>
                      <td className="table-cell text-right text-sm text-gray-500 tabular-nums">{a.duration_ms ? `${a.duration_ms}ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* MEMORY TAB */}
        {/* ================================================================ */}
        {activeTab === 'memory' && (
          <div className="space-y-2">
            {/* Add memory button */}
            <div className="flex justify-end mb-2">
              <button onClick={() => setShowNewMem(!showNewMem)} className="btn btn-primary btn-sm">
                {showNewMem ? 'Cancel' : '+ Add Memory'}
              </button>
            </div>

            {/* New memory form */}
            {showNewMem && (
              <div className="panel p-4 space-y-3 border-vigil-200">
                <textarea value={newMemContent} onChange={e => setNewMemContent(e.target.value)} rows={2} className="input w-full resize-y" placeholder="What should the agent remember?" />
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Importance:</label>
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onClick={() => setNewMemImportance(n)}
                        className={`w-7 h-7 rounded text-xs font-semibold ${newMemImportance === n ? 'bg-vigil-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{n}</button>
                    ))}
                  </div>
                  <button onClick={handleCreateMemory} disabled={!newMemContent.trim()} className="btn btn-primary btn-sm ml-auto">Save</button>
                </div>
              </div>
            )}

            {memories.length === 0 && !showNewMem ? (
              <div className="panel p-8 text-center text-sm text-gray-500">Agent has no memories yet.</div>
            ) : (
              memories.map(mem => (
                <div key={mem.id} className={`panel p-4 ${mem.obsolete ? 'opacity-50' : ''}`}>
                  {editingMemoryId === mem.id ? (
                    /* Edit mode */
                    <div className="space-y-3">
                      <textarea value={editMemContent} onChange={e => setEditMemContent(e.target.value)} rows={2} className="input w-full resize-y" />
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Importance:</label>
                          {[1,2,3,4,5].map(n => (
                            <button key={n} onClick={() => setEditMemImportance(n)}
                              className={`w-7 h-7 rounded text-xs font-semibold ${editMemImportance === n ? 'bg-vigil-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{n}</button>
                          ))}
                        </div>
                        <div className="flex gap-1 ml-auto">
                          <button onClick={() => setEditingMemoryId(null)} className="btn btn-secondary btn-sm">Cancel</button>
                          <button onClick={() => handleUpdateMemory(mem.id)} className="btn btn-primary btn-sm">Save</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm text-gray-800 flex-1">{mem.content}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                          mem.importance >= 4 ? 'bg-red-100 text-red-700' :
                          mem.importance === 3 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{mem.importance}/5</span>
                        <span className="text-xs text-gray-400">{formatRelative(mem.created_at)}</span>
                        <button onClick={() => handleToggleObsolete(mem)} className="text-xs text-gray-400 hover:text-gray-600" title={mem.obsolete ? 'Restore' : 'Mark obsolete'}>
                          {mem.obsolete ? '↩' : '⊘'}
                        </button>
                        <button onClick={() => { setEditingMemoryId(mem.id); setEditMemContent(mem.content); setEditMemImportance(mem.importance); }}
                          className="btn btn-ghost btn-sm">Edit</button>
                        <button onClick={() => handleDeleteMemory(mem.id)} className="btn btn-danger-subtle btn-sm">Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* SETTINGS TAB */}
        {/* ================================================================ */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Reactivity Slider — always visible, saves immediately */}
            <ReactivitySlider
              value={watcher.reactivity ?? 3}
              onChange={async (val) => {
                try {
                  const result = await api.updateWatcher(watcher.id, { reactivity: val } as Partial<Watcher>);
                  setWatcher(result.watcher);
                  setEditReactivity(val);
                  showFlash(`Reactivity set to ${val}/5`);
                } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
              }}
            />

            <div className="panel p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">Watcher Settings</h3>
                {!isEditing ? (
                  <button onClick={() => setIsEditing(true)} className="btn btn-secondary btn-sm">Edit</button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => { setIsEditing(false); if (watcher) { setEditName(watcher.name); setEditPrompt(watcher.system_prompt); setEditTools([...watcher.tools]); setEditSilenceHours(watcher.silence_hours); setEditTickInterval(watcher.tick_interval); setEditReactivity(watcher.reactivity ?? 3); }}} className="btn btn-secondary btn-sm">Cancel</button>
                    <button onClick={handleSaveSettings} disabled={isSaving} className="btn btn-primary btn-sm">{isSaving ? 'Saving...' : 'Save'}</button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="input w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                    <textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} rows={6} className="input w-full resize-y" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tools</label>
                    <div className="space-y-2">
                      {TOOLS.map(tool => (
                        <label key={tool.id} className="flex items-start gap-3 cursor-pointer">
                          <input type="checkbox" checked={editTools.includes(tool.id)} onChange={() => toggleTool(tool.id)} className="mt-1" />
                          <div><span className="font-mono text-sm text-gray-900">{tool.id}</span><p className="text-xs text-gray-500">{tool.description}</p></div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Silence Threshold (hours)</label>
                      <input type="number" value={editSilenceHours} onChange={e => setEditSilenceHours(Math.max(24, parseInt(e.target.value) || 48))} min={24} max={720} step={12} className="input w-full" />
                      <p className="text-xs text-gray-500 mt-1">Flag threads with no activity for this long. Checked on each tick.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tick Interval (minutes)</label>
                      <input type="number" value={editTickInterval} onChange={e => setEditTickInterval(Math.max(60, parseInt(e.target.value) || 120))} min={60} max={1440} step={30} className="input w-full" />
                      <p className="text-xs text-gray-500 mt-1">How often the agent wakes up to review threads.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <div className="data-label mb-1">System Prompt</div>
                    <div className="bg-surface-sunken p-4 rounded text-sm text-gray-700 whitespace-pre-wrap">{watcher.system_prompt}</div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div><div className="data-label mb-1">Silence Threshold</div><div className="text-lg font-semibold text-gray-900">{watcher.silence_hours}h</div></div>
                    <div><div className="data-label mb-1">Tick Interval</div><div className="text-lg font-semibold text-gray-900">{watcher.tick_interval}m</div></div>
                    <div><div className="data-label mb-1">Template</div><div className="text-sm text-gray-600">{watcher.template_id || 'Custom'}</div></div>
                    <div><div className="data-label mb-1">Created</div><div className="text-sm text-gray-600">{new Date(watcher.created_at).toLocaleDateString()}</div></div>
                  </div>
                  <div>
                    <div className="data-label mb-2">Enabled Tools</div>
                    <div className="flex flex-wrap gap-2">{watcher.tools.map(t => <span key={t} className="badge badge-neutral">{t}</span>)}</div>
                  </div>
                  <div>
                    <div className="data-label mb-1">Ingest Address</div>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono text-gray-700">{watcher.ingestion_address}</code>
                      <button className="btn btn-secondary btn-sm" onClick={() => copyToClipboard(watcher.ingestion_address)}>Copy</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tools & Alert Destinations */}
            <div className="panel p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Tools & Alert Destinations</h3>

              <div className="space-y-4">
                {/* Tool descriptions */}
                <div>
                  <div className="data-label mb-2">Enabled Tools</div>
                  <div className="space-y-2">
                    {TOOLS.map(tool => {
                      const enabled = watcher.tools.includes(tool.id);
                      return (
                        <div key={tool.id} className={`flex items-start gap-3 p-3 rounded ${enabled ? 'bg-vigil-50 border border-vigil-200' : 'bg-gray-50 border border-gray-200 opacity-60'}`}>
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${enabled ? 'bg-vigil-500' : 'bg-gray-300'}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-gray-900">{tool.id}</span>
                              <span className={`text-xs ${enabled ? 'text-vigil-600' : 'text-gray-400'}`}>{enabled ? 'enabled' : 'disabled'}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{tool.description}</p>
                            {tool.id === 'send_alert' && enabled && (
                              <p className="text-xs text-gray-400 mt-1">Alerts go to: account email{channels.filter(c => c.type === 'email' && c.enabled).length > 0 ? ` + ${channels.filter(c => c.type === 'email' && c.enabled).length} additional email(s)` : ''}{channels.filter(c => c.type === 'webhook' && c.enabled).length > 0 ? ` + ${channels.filter(c => c.type === 'webhook' && c.enabled).length} webhook(s)` : ''}</p>
                            )}
                            {tool.id === 'webhook' && enabled && (
                              <p className="text-xs text-gray-400 mt-1">Webhooks: {channels.filter(c => c.type === 'webhook' && c.enabled).length > 0 ? channels.filter(c => c.type === 'webhook' && c.enabled).map(c => c.destination).join(', ') : 'none configured'}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Edit tools in the settings panel above.</p>
                </div>

                {/* Alert destinations */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="data-label">Alert Destinations</div>
                    <button onClick={() => setShowNewChannel(!showNewChannel)} className="btn btn-secondary btn-sm">{showNewChannel ? 'Cancel' : '+ Add'}</button>
                  </div>

                  <p className="text-xs text-gray-500 mb-3">When <code className="text-xs">send_alert</code> fires, the agent sends to your account email plus any destinations below.</p>

                  {showNewChannel && (
                    <div className="bg-surface-sunken p-3 rounded mb-3 space-y-2">
                      <div className="flex gap-2">
                        <select value={newChannelType} onChange={e => setNewChannelType(e.target.value as 'email' | 'webhook')} className="input w-32">
                          <option value="email">Email</option>
                          <option value="webhook">Webhook</option>
                        </select>
                        <input type="text" value={newChannelDest} onChange={e => setNewChannelDest(e.target.value)}
                          placeholder={newChannelType === 'email' ? 'email@example.com' : 'https://hooks.example.com/...'}
                          className="input flex-1" />
                        <button onClick={handleCreateChannel} disabled={!newChannelDest.trim()} className="btn btn-primary btn-sm">Add</button>
                      </div>
                    </div>
                  )}

                  {channels.length === 0 ? (
                    <div className="text-sm text-gray-500 p-3 bg-surface-sunken rounded">No additional destinations. Alerts go to your account email only.</div>
                  ) : (
                    <div className="space-y-1">
                      {channels.map(ch => (
                        <div key={ch.id} className={`flex items-center gap-3 p-3 rounded ${ch.enabled ? 'bg-surface-sunken' : 'bg-gray-50 opacity-60'}`}>
                          <span className={`badge badge-sm ${ch.type === 'email' ? 'badge-ok' : 'badge-warning'}`}>{ch.type}</span>
                          <span className="text-sm text-gray-700 flex-1 font-mono truncate">{ch.destination}</span>
                          <button onClick={() => handleToggleChannel(ch)} className="btn btn-secondary btn-sm">{ch.enabled ? 'Disable' : 'Enable'}</button>
                          <button onClick={() => handleDeleteChannel(ch.id)} className="btn btn-danger-subtle btn-sm">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Danger zone */}
            <div className="panel p-6 border-red-200">
              <h3 className="text-sm font-semibold text-red-700 mb-2">Danger Zone</h3>
              <p className="text-sm text-red-700/90 mb-4">
                High-impact actions for <strong>{watcher.name}</strong>. Deletion is permanent and removes all related data.
              </p>

              <div className="bg-red-50/70 border border-red-100 rounded p-4 mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-red-700 mb-2">What gets deleted</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="text-sm text-red-800 flex items-center justify-between"><span>Threads</span><strong>{threads.length}</strong></div>
                  <div className="text-sm text-red-800 flex items-center justify-between"><span>Agent actions</span><strong>{actions.length}</strong></div>
                  <div className="text-sm text-red-800 flex items-center justify-between"><span>Memories</span><strong>{memories.length}</strong></div>
                  <div className="text-sm text-red-800 flex items-center justify-between"><span>Alert channels</span><strong>{channels.length}</strong></div>
                </div>
                <p className="text-xs text-red-700 mt-3">This also disables future ingestion for this watcher token.</p>
              </div>

              {!showDeleteWatcher ? (
                <button onClick={() => setShowDeleteWatcher(true)} className="btn btn-danger-subtle">Delete Watcher</button>
              ) : (
                <div className="bg-red-50 p-4 rounded space-y-3">
                  <p className="text-sm text-red-700">Permanently delete <strong>{watcher.name}</strong> and all associated threads, memories, actions, and channels.</p>

                  <div className="text-xs text-red-700 bg-red-100/70 border border-red-200 rounded p-2">
                    Type <strong>{watcher.name}</strong> to confirm.
                  </div>

                  <input
                    type="text"
                    value={deleteWatcherConfirmText}
                    onChange={e => setDeleteWatcherConfirmText(e.target.value)}
                    placeholder={`Type ${watcher.name}`}
                    className="input border-red-200 focus:border-red-400"
                    aria-label="Confirm watcher name to delete"
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowDeleteWatcher(false);
                        setDeleteWatcherConfirmText('');
                      }}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteWatcher}
                      disabled={isDeleting || deleteWatcherConfirmText.trim() !== watcher.name}
                      className="btn btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function WatcherDetailPage() {
  return <RequireAuth><WatcherDetailContent /></RequireAuth>;
}
