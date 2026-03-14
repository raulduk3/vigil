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
  const [isExpanded, setIsExpanded] = useState(false);
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
    <div className="border-t border-gray-200">
      {/* Header */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-surface-sunken transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Memories
          <span className="text-gray-400">({active.length})</span>
          {breakdown.length > 0 && (
            <span className="flex items-center gap-0.5 ml-1">
              {breakdown.map((b) => (
                <span key={b.level} className={`text-xs font-semibold ${IMPORTANCE_TEXT_COLORS[b.level]}`}>
                  {b.count}
                </span>
              ))}
            </span>
          )}
        </div>
        <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Toolbar */}
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter memories..."
                className="input py-1.5 pl-7 text-xs w-full"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'importance')}
              className="input py-1.5 text-xs shrink-0 w-auto pr-6"
            >
              <option value="newest">Newest</option>
              <option value="importance">Importance</option>
            </select>
            <button
              onClick={() => setShowObsolete((v) => !v)}
              title={showObsolete ? 'Hide retired' : 'Show retired'}
              className={`p-1.5 rounded text-xs transition-colors ${showObsolete ? 'text-gray-600 bg-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {showObsolete ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              )}
            </button>
          </div>

          {/* Add memory button / form */}
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-vigil-600 hover:text-vigil-700 border border-dashed border-vigil-300 hover:border-vigil-400 rounded transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add memory
            </button>
          ) : (
            <div className="panel-inset px-2.5 py-2 space-y-2">
              <AutoResizeTextarea
                value={newContent}
                onChange={setNewContent}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd();
                  if (e.key === 'Escape') { setShowAddForm(false); setNewContent(''); }
                }}
                placeholder="What should the agent remember?"
                className="input py-1.5 text-xs w-full"
                autoFocus
              />
              <div className="flex items-center justify-between">
                <ImportanceDots value={newImportance} onChange={setNewImportance} />
                <div className="flex gap-1">
                  <button onClick={() => { setShowAddForm(false); setNewContent(''); }} className="btn btn-secondary btn-xs">Cancel</button>
                  <button onClick={handleAdd} disabled={adding || !newContent.trim()} className="btn btn-primary btn-xs">
                    {adding ? <span className="spinner-sm" /> : 'Save'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400">⌘↵ to save · Esc to cancel</p>
            </div>
          )}

          {/* Memory list */}
          {sorted.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              {searchQuery ? 'No memories match.' : 'No memories yet.'}
            </p>
          )}

          {sorted.map((memory) => (
            <div
              key={memory.id}
              className={`panel-inset px-2.5 py-2 text-xs group ${memory.obsolete ? 'opacity-50' : ''}`}
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
                    className="input py-1.5 text-xs w-full"
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <ImportanceDots value={editImportance} onChange={setEditImportance} />
                    <div className="flex gap-1">
                      <button onClick={() => setEditingId(null)} className="btn btn-secondary btn-xs">Cancel</button>
                      <button onClick={() => handleSaveEdit(memory.id)} disabled={savingId === memory.id} className="btn btn-primary btn-xs">
                        {savingId === memory.id ? <span className="spinner-sm" /> : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-1.5">
                    {/* Importance indicator */}
                    <div className="flex items-center gap-0.5 shrink-0 mt-0.5" title={`Importance: ${IMPORTANCE_LABELS[memory.importance]}`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span
                          key={n}
                          className={`inline-block w-1.5 h-1.5 rounded-full ${n <= memory.importance ? IMPORTANCE_COLORS[memory.importance] : 'bg-gray-200'}`}
                        />
                      ))}
                    </div>

                    {/* Content */}
                    <p
                      className={`flex-1 text-gray-700 leading-relaxed cursor-pointer hover:text-gray-900 ${memory.obsolete ? 'line-through text-gray-400' : ''}`}
                      onClick={() => !memory.obsolete && startEdit(memory)}
                      title="Click to edit"
                    >
                      {memory.content}
                    </p>

                    {/* Actions */}
                    {confirmDeleteId === memory.id ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-gray-500">Delete?</span>
                        <button onClick={() => handleDelete(memory.id)} className="text-red-500 hover:text-red-700 font-medium">Yes</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-gray-400 hover:text-gray-600">No</button>
                      </div>
                    ) : (
                      <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Edit */}
                        <button onClick={() => startEdit(memory)} className="text-gray-400 hover:text-gray-600" title="Edit">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        {/* Toggle obsolete */}
                        <button onClick={() => handleToggleObsolete(memory)} className="text-gray-400 hover:text-gray-600" title={memory.obsolete ? 'Restore' : 'Mark retired'}>
                          {memory.obsolete ? (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          )}
                        </button>
                        {/* Delete */}
                        <button onClick={() => setConfirmDeleteId(memory.id)} className="text-gray-400 hover:text-red-500" title="Delete">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="mt-1 text-gray-400 text-xs pl-4">
                    {formatTimestamp(memory.created_at)}
                  </div>
                </>
              )}
            </div>
          ))}

          {obsolete.length > 0 && !showObsolete && (
            <button onClick={() => setShowObsolete(true)} className="text-xs text-gray-400 hover:text-gray-600 w-full text-center py-1">
              {obsolete.length} retired {obsolete.length === 1 ? 'memory' : 'memories'} hidden
            </button>
          )}
        </div>
      )}
    </div>
  );
}
