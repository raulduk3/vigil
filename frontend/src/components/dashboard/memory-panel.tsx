'use client';

import { useState } from 'react';
import { api, type Memory } from '@/lib/api/client';

interface MemoryPanelProps {
  watcherId: string;
  memories: Memory[];
  onMemoriesChange: (memories: Memory[]) => void;
}

const IMPORTANCE_COLORS: Record<number, string> = {
  1: 'text-gray-400',
  2: 'text-blue-400',
  3: 'text-yellow-500',
  4: 'text-orange-500',
  5: 'text-red-500',
};

export function MemoryPanel({ watcherId, memories, onMemoriesChange }: MemoryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const active = memories.filter((m) => !m.obsolete);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      const res = await api.createMemory(watcherId, { content: newContent.trim(), importance: 3 });
      onMemoriesChange([res.memory, ...memories]);
      setNewContent('');
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
  };

  const handleSaveEdit = async (memoryId: string) => {
    if (!editContent.trim()) return;
    try {
      const res = await api.updateMemory(watcherId, memoryId, { content: editContent.trim() });
      onMemoriesChange(memories.map((m) => (m.id === memoryId ? res.memory : m)));
      setEditingId(null);
    } catch {
      // ignore
    }
  };

  return (
    <div className="border-t border-gray-200">
      {/* Collapsible header */}
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
        </div>
        <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Add new memory */}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="Add memory..."
              className="input py-1.5 text-xs"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newContent.trim()}
              className="btn btn-secondary btn-xs shrink-0"
            >
              {adding ? <span className="spinner-sm" /> : '+'}
            </button>
          </div>

          {/* Memory list */}
          {active.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">No memories yet.</p>
          )}
          {active.map((memory) => (
            <div key={memory.id} className="panel-inset px-2.5 py-2 text-xs group">
              {editingId === memory.id ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(memory.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="input py-1 text-xs flex-1"
                    autoFocus
                  />
                  <button onClick={() => handleSaveEdit(memory.id)} className="btn btn-primary btn-xs">Save</button>
                  <button onClick={() => setEditingId(null)} className="btn btn-secondary btn-xs">×</button>
                </div>
              ) : (
                <div className="flex items-start gap-1.5">
                  <span className={`shrink-0 font-bold tabular-nums mt-px ${IMPORTANCE_COLORS[memory.importance] ?? 'text-gray-400'}`}>
                    {memory.importance}
                  </span>
                  <p className="flex-1 text-gray-700 leading-relaxed">{memory.content}</p>
                  <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(memory)} className="text-gray-400 hover:text-gray-600" title="Edit">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button onClick={() => handleToggleObsolete(memory)} className="text-gray-400 hover:text-gray-600" title="Mark obsolete">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button onClick={() => handleDelete(memory.id)} className="text-gray-400 hover:text-red-500" title="Delete">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
