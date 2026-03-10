'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { RequireAuth } from '@/lib/auth';
import { AppHeader } from '@/components/layout';
import { api, type Watcher, type Thread, type Action, type Memory } from '@/lib/api';

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
  switch (status) {
    case 'active': return 'badge-ok';
    case 'watching': return 'badge-warning';
    case 'resolved': return 'badge-neutral';
    case 'ignored': return 'badge-inactive';
    default: return 'badge-neutral';
  }
}

const TOOLS = [
  { id: 'send_alert', label: 'Send Alert', description: 'Email notification when something needs attention' },
  { id: 'update_thread', label: 'Update Thread', description: 'Change thread status or summary' },
  { id: 'ignore_thread', label: 'Ignore Thread', description: 'Mark thread as noise' },
  { id: 'webhook', label: 'Webhook', description: 'POST to a configured URL' },
];

interface ThreadDetail {
  thread: Thread;
  emails: Array<{
    id: string;
    message_id: string;
    from_addr: string;
    to_addr: string;
    subject: string;
    received_at: string;
    analysis: { summary: string; intent: string; urgency: string; entities: string[] } | null;
    processed: boolean;
  }>;
  actions: Action[];
}

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

  // Settings editing
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editTools, setEditTools] = useState<string[]>([]);
  const [editSilenceHours, setEditSilenceHours] = useState(48);
  const [editTickInterval, setEditTickInterval] = useState(60);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Thread detail view
  const [selectedThread, setSelectedThread] = useState<ThreadDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  // Delete confirmation
  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [watcherRes, threadsRes, actionsRes, memoryRes] = await Promise.all([
        api.getWatcher(watcherId),
        api.getThreads(watcherId),
        api.getActions(watcherId).catch(() => ({ actions: [] })),
        api.getMemories(watcherId).catch(() => ({ memories: [] })),
      ]);
      setWatcher(watcherRes.watcher);
      setThreads(threadsRes.threads || []);
      setActions(actionsRes.actions || []);
      setMemories(memoryRes.memories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load watcher');
    } finally {
      setIsLoading(false);
    }
  }, [watcherId]);

  useEffect(() => { load(); }, [load]);

  // Initialize edit form when watcher loads
  useEffect(() => {
    if (watcher) {
      setEditName(watcher.name);
      setEditPrompt(watcher.system_prompt);
      setEditTools([...watcher.tools]);
      setEditSilenceHours(watcher.silence_hours);
      setEditTickInterval(watcher.tick_interval);
    }
  }, [watcher]);

  const handleSave = async () => {
    if (!watcher) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const result = await api.updateWatcher(watcher.id, {
        name: editName.trim(),
        system_prompt: editPrompt.trim(),
        tools: editTools,
        silence_hours: editSilenceHours,
        tick_interval: editTickInterval,
      } as Partial<Watcher>);
      setWatcher(result.watcher);
      setIsEditing(false);
      setSaveMessage('Settings saved');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!watcher) return;
    setIsDeleting(true);
    try {
      await api.deleteWatcher(watcher.id);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete watcher');
      setIsDeleting(false);
    }
  };

  const handlePauseResume = async () => {
    if (!watcher) return;
    try {
      const newStatus = watcher.status === 'active' ? 'paused' : 'active';
      const result = await api.updateWatcher(watcher.id, { status: newStatus } as Partial<Watcher>);
      setWatcher(result.watcher);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const openThread = async (threadId: string) => {
    setThreadLoading(true);
    try {
      const result = await api.getThread(watcherId, threadId) as unknown as ThreadDetail;
      setSelectedThread(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thread');
    } finally {
      setThreadLoading(false);
    }
  };

  const closeThread = async (threadId: string) => {
    try {
      await api.closeThread(watcherId, threadId);
      setSelectedThread(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close thread');
    }
  };

  const toggleTool = (toolId: string) => {
    setEditTools((prev) => prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]);
  };

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard?.writeText(text); } catch { /* noop */ }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-page">
        <AppHeader />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="panel p-8 text-center"><div className="spinner mx-auto mb-4" /><p className="text-sm text-gray-600">Loading watcher...</p></div>
        </main>
      </div>
    );
  }

  if (error && !watcher) {
    return (
      <div className="min-h-screen bg-surface-page">
        <AppHeader />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="panel p-8 text-center">
            <h2 className="font-semibold text-gray-900 mb-2">Error</h2>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <Link href="/dashboard" className="btn btn-primary">Back to dashboard</Link>
          </div>
        </main>
      </div>
    );
  }

  if (!watcher) return null;

  const activeThreads = threads.filter((t) => t.status === 'active');
  const watchingThreads = threads.filter((t) => t.status === 'watching');

  // Thread detail view
  if (selectedThread) {
    const t = selectedThread.thread;
    const emails = selectedThread.emails || [];
    const threadActions = selectedThread.actions || [];

    return (
      <div className="min-h-screen bg-surface-page">
        <AppHeader />
        <main className="max-w-6xl mx-auto px-6 py-8">
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
            {t.summary && <p className="text-sm text-gray-600 mb-3">{t.summary}</p>}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>Participants: {t.participants.join(', ')}</span>
              <span>{t.email_count} email{t.email_count !== 1 ? 's' : ''}</span>
              <span>First seen: {formatRelative(t.first_seen)}</span>
              <span>Last activity: {formatRelative(t.last_activity)}</span>
            </div>
          </div>

          {/* Thread actions */}
          <div className="flex gap-2 mb-6">
            <button onClick={() => setSelectedThread(null)} className="btn btn-secondary">← Back to threads</button>
            {t.status === 'active' && (
              <button onClick={() => closeThread(t.id)} className="btn btn-secondary">Close thread</button>
            )}
          </div>

          {/* Emails */}
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700 mb-3">Emails ({emails.length})</h2>
            <div className="space-y-3">
              {emails.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()).map((email) => (
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
                        <span className={`badge badge-sm ${
                          email.analysis.urgency === 'high' ? 'badge-critical' :
                          email.analysis.urgency === 'normal' ? 'badge-warning' : 'badge-neutral'
                        }`}>{email.analysis.urgency}</span>
                      </div>
                      <p className="text-sm text-gray-700"><strong>Summary:</strong> {email.analysis.summary}</p>
                      <p className="text-sm text-gray-700"><strong>Intent:</strong> {email.analysis.intent}</p>
                      {email.analysis.entities.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm text-gray-500">Entities:</span>
                          {email.analysis.entities.map((e, i) => (
                            <span key={i} className="badge badge-sm badge-neutral">{e}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Thread actions log */}
          {threadActions.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700 mb-3">Agent Actions ({threadActions.length})</h2>
              <div className="panel overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="table-header">When</th>
                      <th className="table-header">Trigger</th>
                      <th className="table-header">Tool</th>
                      <th className="table-header text-center">Result</th>
                      <th className="table-header text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {threadActions.map((action) => (
                      <tr key={action.id} className="table-row">
                        <td className="table-cell text-sm text-gray-500 tabular-nums">{formatRelative(action.created_at)}</td>
                        <td className="table-cell"><span className="badge badge-sm badge-neutral">{action.trigger_type}</span></td>
                        <td className="table-cell font-mono text-sm">{action.tool || '—'}</td>
                        <td className="table-cell text-center">
                          <span className={`badge badge-sm ${action.result === 'success' ? 'badge-ok' : 'badge-critical'}`}>{action.result}</span>
                        </td>
                        <td className="table-cell text-right text-sm text-gray-500 tabular-nums">${action.cost_usd?.toFixed(4) || '—'}</td>
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

  return (
    <div className="min-h-screen bg-surface-page">
      <AppHeader />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
            <span>→</span>
            <span className="text-gray-900">{watcher.name}</span>
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
              <button onClick={handlePauseResume} className="btn btn-secondary">
                {watcher.status === 'active' ? 'Pause' : 'Resume'}
              </button>
            </div>
          </div>
        </div>

        {/* Error / Save message */}
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}
        {saveMessage && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">{saveMessage}</div>}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="panel p-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Active</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{activeThreads.length}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Watching</div>
            <div className="text-xl font-semibold text-gray-700 tabular-nums">{watchingThreads.length}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Emails</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{threads.reduce((s, t) => s + t.email_count, 0)}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Memories</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{memories.length}</div>
          </div>
          <div className="panel p-3">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Actions</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{actions.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {(['threads', 'activity', 'memory', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab ? 'border-vigil-600 text-vigil-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Threads Tab */}
        {activeTab === 'threads' && (
          <div className="panel overflow-x-auto">
            {threads.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No threads yet. Forward an email to <code>{watcher.ingestion_address}</code> to get started.</div>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="table-header">Subject</th>
                    <th className="table-header">Participants</th>
                    <th className="table-header text-center">Status</th>
                    <th className="table-header text-right">Emails</th>
                    <th className="table-header text-right">Last Activity</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody>
                  {threads
                    .sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime())
                    .map((thread) => (
                    <tr key={thread.id} className="table-row cursor-pointer hover:bg-surface-sunken/50" onClick={() => openThread(thread.id)}>
                      <td className="table-cell">
                        <div className="font-medium text-gray-900">{thread.subject || 'No subject'}</div>
                        {thread.summary && <p className="text-xs text-gray-500 mt-0.5 max-w-md truncate">{thread.summary}</p>}
                      </td>
                      <td className="table-cell text-sm text-gray-600">{thread.participants.join(', ')}</td>
                      <td className="table-cell text-center"><span className={`badge badge-sm ${statusBadge(thread.status)}`}>{thread.status}</span></td>
                      <td className="table-cell text-right tabular-nums font-mono">{thread.email_count}</td>
                      <td className="table-cell text-right text-sm text-gray-500 tabular-nums">{formatRelative(thread.last_activity)}</td>
                      <td className="table-cell text-right">
                        <span className="text-sm link">View</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {threadLoading && (
              <div className="p-4 text-center"><div className="spinner mx-auto" /></div>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="panel overflow-x-auto">
            {actions.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">No agent activity yet.</div>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="table-header">When</th>
                    <th className="table-header">Trigger</th>
                    <th className="table-header">Tool</th>
                    <th className="table-header text-center">Result</th>
                    <th className="table-header">Decision</th>
                    <th className="table-header text-right">Cost</th>
                    <th className="table-header text-right">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((action) => (
                    <tr key={action.id} className="table-row">
                      <td className="table-cell text-sm text-gray-500 tabular-nums">{formatRelative(action.created_at)}</td>
                      <td className="table-cell"><span className="badge badge-sm badge-neutral">{action.trigger_type}</span></td>
                      <td className="table-cell font-mono text-sm">{action.tool || '—'}</td>
                      <td className="table-cell text-center">
                        <span className={`badge badge-sm ${action.result === 'success' ? 'badge-ok' : 'badge-critical'}`}>{action.result}</span>
                      </td>
                      <td className="table-cell text-sm text-gray-600 max-w-xs truncate">{action.decision || '—'}</td>
                      <td className="table-cell text-right text-sm text-gray-500 tabular-nums">${action.cost_usd?.toFixed(4) || '—'}</td>
                      <td className="table-cell text-right text-sm text-gray-500 tabular-nums">{action.duration_ms ? `${action.duration_ms}ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Memory Tab */}
        {activeTab === 'memory' && (
          <div className="space-y-2">
            {memories.length === 0 ? (
              <div className="panel p-8 text-center text-sm text-gray-500">Agent has no memories yet.</div>
            ) : (
              memories.map((mem) => (
                <div key={mem.id} className={`panel p-4 ${mem.obsolete ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm text-gray-800 flex-1">{mem.content}</p>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-gray-400">importance: {mem.importance}/5</span>
                      <span className="text-xs text-gray-400">{formatRelative(mem.created_at)}</span>
                      {mem.obsolete && <span className="badge badge-sm badge-inactive">obsolete</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="panel p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">Watcher Settings</h3>
                {!isEditing ? (
                  <button onClick={() => setIsEditing(true)} className="btn btn-secondary btn-sm">Edit</button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => { setIsEditing(false); if (watcher) { setEditName(watcher.name); setEditPrompt(watcher.system_prompt); setEditTools([...watcher.tools]); setEditSilenceHours(watcher.silence_hours); setEditTickInterval(watcher.tick_interval); }}} className="btn btn-secondary btn-sm">Cancel</button>
                    <button onClick={handleSave} disabled={isSaving} className="btn btn-primary btn-sm">{isSaving ? 'Saving...' : 'Save'}</button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                    <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} rows={6} className="input w-full resize-y" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tools</label>
                    <div className="space-y-2">
                      {TOOLS.map((tool) => (
                        <label key={tool.id} className="flex items-start gap-3 cursor-pointer">
                          <input type="checkbox" checked={editTools.includes(tool.id)} onChange={() => toggleTool(tool.id)} className="mt-1" />
                          <div>
                            <span className="font-mono text-sm text-gray-900">{tool.id}</span>
                            <p className="text-xs text-gray-500">{tool.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Silence Threshold (hours)</label>
                      <input type="number" value={editSilenceHours} onChange={(e) => setEditSilenceHours(Math.max(24, parseInt(e.target.value) || 48))} min={24} max={720} step={12} className="input w-full" />
                      <p className="text-xs text-gray-500 mt-1">Flag threads with no activity for this long. Checked on each tick.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tick Interval (minutes)</label>
                      <input type="number" value={editTickInterval} onChange={(e) => setEditTickInterval(Math.max(60, parseInt(e.target.value) || 120))} min={60} max={1440} step={30} className="input w-full" />
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
                    <div>
                      <div className="data-label mb-1">Silence Threshold</div>
                      <div className="text-lg font-semibold text-gray-900">{watcher.silence_hours}h</div>
                    </div>
                    <div>
                      <div className="data-label mb-1">Tick Interval</div>
                      <div className="text-lg font-semibold text-gray-900">{watcher.tick_interval}m</div>
                    </div>
                    <div>
                      <div className="data-label mb-1">Template</div>
                      <div className="text-sm text-gray-600">{watcher.template_id || 'Custom'}</div>
                    </div>
                    <div>
                      <div className="data-label mb-1">Created</div>
                      <div className="text-sm text-gray-600">{new Date(watcher.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div>
                    <div className="data-label mb-2">Enabled Tools</div>
                    <div className="flex flex-wrap gap-2">
                      {watcher.tools.map((t) => (<span key={t} className="badge badge-neutral">{t}</span>))}
                    </div>
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

            {/* Danger zone */}
            <div className="panel p-6 border-red-200">
              <h3 className="text-sm font-semibold text-red-700 mb-3">Danger Zone</h3>
              {!showDelete ? (
                <button onClick={() => setShowDelete(true)} className="btn btn-secondary text-red-600 border-red-300 hover:bg-red-50">
                  Delete Watcher
                </button>
              ) : (
                <div className="bg-red-50 p-4 rounded space-y-3">
                  <p className="text-sm text-red-700">
                    This will permanently delete <strong>{watcher.name}</strong>, all its threads, memories, and action history.
                    This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowDelete(false)} className="btn btn-secondary">Cancel</button>
                    <button onClick={handleDelete} disabled={isDeleting} className="btn bg-red-600 text-white hover:bg-red-700">
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
  return (
    <RequireAuth>
      <WatcherDetailContent />
    </RequireAuth>
  );
}
