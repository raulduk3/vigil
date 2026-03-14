'use client';

import { useState, useRef, useEffect } from 'react';
import { api, type Memory } from '@/lib/api/client';

interface MemoryPanelProps {
  watcherId: string;
  memories: Memory[];
  onMemoriesChange: (memories: Memory[]) => void;
}

const IMPORTANCE_COLORS: Record<number, string> = {
  1: 'bg-gray-300',
  2: 'bg-blue-400',
  3: 'bg-yellow-400',
  4: 'bg-orange-400',
  5: 'bg-red-500',
};

const IMPORTANCE_TEXT_COLORS: Record<number, string> = {
  1: 'text-gray-400',
  2: 'text-blue-400',
  3: 'text-yellow-500',
  4: 'text-orange-500',
  5: 'text-red-500',
};

const IMPORTANCE_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Normal',
  3: 'Medium',
  4: 'High',
  5: 'Critical',
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function AutoResizeTextarea({
  value, onChange, onKeyDown, placeholder, className, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
      rows={2}
      style={{ resize: 'none', overflow: 'hidden' }}
    />
  );
}

function ImportanceDots({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1" title="Importance">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          title={IMPORTANCE_LABELS[n]}
          className={`w-2.5 h-2.5 rounded-full transition-all hover:scale-125 ${
            n <= value ? IMPORTANCE_COLORS[value] : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

export function MemoryPanel({ watcherId, memories, onMemoriesChange }: MemoryPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newImportance, setNewImportance] = useState(3);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editImportance, setEditImportance] = useState(3);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'importance'>('newest');
  const [showObsolete, setShowObsolete] = useState(false);

  const active = memories.filter((m) => !m.obsolete);
  const obsolete = memories.filter((m) => m.obsolete);

  const displayed = showObsolete ? memories : active;
  const filtered = displayed.filter((m) =>
    searchQuery.trim() === '' || m.content.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'importance') return b.importance - a.importance;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Breakdown by importance
  const breakdown = [1, 2, 3, 4, 5].map((level) => ({
    level,
    count: active.filter((m) => m.importance === level).length,
  })).filter((b) => b.count > 0);
  const criticalCount = active.filter((m) => m.importance >= 4).length;
  const newestMemory = active[0] ?? memories[0] ?? null;

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      const res = await api.createMemory(watcherId, { content: newContent.trim(), importance: newImportance });
      onMemoriesChange([res.memory, ...memories]);
      setNewContent('');
      setNewImportance(3);
      setShowAddForm(false);
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (memoryId: string) => {
    try {
      await api.deleteMemory(watcherId, memoryId);
      onMemoriesChange(memories.filter((m) => m.id !== memoryId));
    } catch {
      // ignore
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleToggleObsolete = async (memory: Memory) => {
    try {
      const res = await api.updateMemory(watcherId, memory.id, { obsolete: !memory.obsolete });
      onMemoriesChange(memories.map((m) => (m.id === memory.id ? res.memory : m)));
    } catch {
      // ignore
    }
  };

  const startEdit = (memory: Memory) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
    setEditImportance(memory.importance);
  };

  const handleSaveEdit = async (memoryId: string) => {
    if (!editContent.trim()) return;
    setSavingId(memoryId);
    try {
      const res = await api.updateMemory(watcherId, memoryId, {
        content: editContent.trim(),
        importance: editImportance,
      });
      onMemoriesChange(memories.map((m) => (m.id === memoryId ? res.memory : m)));
      setEditingId(null);
    } catch {
      // ignore
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-surface-page">
      <div className="border-b border-gray-200 bg-surface-raised px-4 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-500">Memory</h3>
            <p className="mt-1 max-w-none text-sm text-gray-500">Persistent notes the watcher has learned. Edit, retire, or add guidance without leaving the dashboard.</p>
          </div>
          <button
            onClick={() => setShowAddForm((value) => !value)}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${showAddForm ? 'border-gray-300 bg-surface-sunken text-gray-700 hover:bg-surface-inset' : 'border-vigil-300 bg-white text-vigil-700 hover:border-vigil-400 hover:bg-vigil-50'}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {showAddForm ? 'Close composer' : 'Add memory'}
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-surface-page px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Active</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-gray-800">{active.length}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-surface-page px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Retired</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-gray-800">{obsolete.length}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-surface-page px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">High priority</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-gray-800">{criticalCount}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-surface-page px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400">Latest</div>
            <div className="mt-1 truncate text-sm font-medium text-gray-700">{newestMemory ? formatTimestamp(newestMemory.created_at) : 'No memories'}</div>
          </div>
        </div>

        {breakdown.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="uppercase tracking-[0.14em] text-gray-400">Importance mix</span>
            {breakdown.map((b) => (
              <span key={b.level} className="inline-flex items-center gap-1 rounded-full bg-surface-page px-2 py-1">
                <span className={`h-2 w-2 rounded-full ${IMPORTANCE_COLORS[b.level]}`} />
                <span className={IMPORTANCE_TEXT_COLORS[b.level]}>{IMPORTANCE_LABELS[b.level]}</span>
                <span className="tabular-nums text-gray-400">{b.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="border-b border-gray-200 bg-surface-page px-4 py-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories"
              className="input w-full py-2 pl-9 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'importance')}
              className="input w-auto min-w-32 py-2 pr-8 text-sm"
            >
              <option value="newest">Newest first</option>
              <option value="importance">Highest importance</option>
            </select>
            <button
              onClick={() => setShowObsolete((v) => !v)}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${showObsolete ? 'border-gray-300 bg-surface-sunken text-gray-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
            >
              {showObsolete ? 'Hide retired' : `Show retired (${obsolete.length})`}
            </button>
          </div>
        </div>
      </div>

      {showAddForm && (
        <div className="border-b border-gray-200 bg-surface-raised px-4 py-4">
          <div className="mx-auto max-w-4xl rounded-xl border border-gray-200 bg-surface-page p-4 shadow-raised-sm">
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">New memory</div>
                <p className="mt-1 max-w-none text-sm text-gray-500">Capture a stable preference, recurring pattern, or instruction worth remembering.</p>
              </div>
              <AutoResizeTextarea
                value={newContent}
                onChange={setNewContent}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd();
                  if (e.key === 'Escape') { setShowAddForm(false); setNewContent(''); }
                }}
                placeholder="What should the agent remember?"
                className="input w-full py-2 text-sm"
                autoFocus
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <ImportanceDots value={newImportance} onChange={setNewImportance} />
                  <span className="text-sm text-gray-500">{IMPORTANCE_LABELS[newImportance]} priority</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowAddForm(false); setNewContent(''); }} className="btn btn-secondary">Cancel</button>
                  <button onClick={handleAdd} disabled={adding || !newContent.trim()} className="btn btn-primary">
                    {adding ? <span className="spinner-sm" /> : 'Save memory'}
                  </button>
                </div>
              </div>
              <p className="max-w-none text-xs text-gray-400">⌘↵ to save, Esc to close.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-4xl space-y-3">
          {sorted.length === 0 && (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-surface-raised px-6 py-12 text-center">
              <p className="mb-1 text-center text-sm font-medium text-gray-700">{searchQuery ? 'No matching memories' : 'No memories yet'}</p>
              <p className="text-center text-sm text-gray-500">{searchQuery ? 'Try a different term or include retired memories.' : 'Add a memory to give this watcher durable context.'}</p>
            </div>
          )}

          {sorted.map((memory) => (
            <div
              key={memory.id}
              className={`group rounded-xl border bg-surface-raised p-4 shadow-raised-sm transition-colors ${memory.obsolete ? 'border-gray-200 opacity-70' : 'border-gray-200 hover:border-gray-300'}`}
            >
              {editingId === memory.id ? (
                <div className="space-y-2">
                  <AutoResizeTextarea
                    value={editContent}
                    onChange={setEditContent}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveEdit(memory.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="input w-full py-2 text-sm"
                    autoFocus
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <ImportanceDots value={editImportance} onChange={setEditImportance} />
                      <span className="text-sm text-gray-500">{IMPORTANCE_LABELS[editImportance]} priority</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingId(null)} className="btn btn-secondary">Cancel</button>
                      <button onClick={() => handleSaveEdit(memory.id)} disabled={savingId === memory.id} className="btn btn-primary">
                        {savingId === memory.id ? <span className="spinner-sm" /> : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${IMPORTANCE_TEXT_COLORS[memory.importance]} bg-surface-page`}>
                          <span className={`h-2 w-2 rounded-full ${IMPORTANCE_COLORS[memory.importance]}`} />
                          {IMPORTANCE_LABELS[memory.importance]}
                        </span>
                        {memory.obsolete && (
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">
                            Retired
                          </span>
                        )}
                      </div>
                    
                    <p
                      className={`max-w-none cursor-pointer text-sm leading-6 text-gray-700 hover:text-gray-900 ${memory.obsolete ? 'line-through text-gray-400' : ''}`}
                      onClick={() => !memory.obsolete && startEdit(memory)}
                      title="Click to edit"
                    >
                      {memory.content}
                    </p>
                      <div className="mt-3 text-xs text-gray-400">{formatTimestamp(memory.created_at)}</div>
                    </div>

                    {confirmDeleteId === memory.id ? (
                      <div className="flex shrink-0 items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs">
                        <span className="text-red-600">Delete?</span>
                        <button onClick={() => handleDelete(memory.id)} className="font-medium text-red-600 hover:text-red-700">Yes</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-gray-500 hover:text-gray-700">No</button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                        <button onClick={() => startEdit(memory)} className="rounded-lg p-2 text-gray-400 hover:bg-surface-page hover:text-gray-700" title="Edit">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button onClick={() => handleToggleObsolete(memory)} className="rounded-lg p-2 text-gray-400 hover:bg-surface-page hover:text-gray-700" title={memory.obsolete ? 'Restore' : 'Mark retired'}>
                          {memory.obsolete ? (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          )}
                        </button>
                        <button onClick={() => setConfirmDeleteId(memory.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500" title="Delete">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}

          {obsolete.length > 0 && !showObsolete && (
            <button onClick={() => setShowObsolete(true)} className="w-full rounded-lg border border-dashed border-gray-300 px-4 py-3 text-center text-sm text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700">
              {obsolete.length} retired {obsolete.length === 1 ? 'memory' : 'memories'} hidden
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
