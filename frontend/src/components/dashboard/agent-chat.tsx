'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '@/lib/api/client';

interface Message {
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

interface AgentChatProps {
  watcherId: string;
}

export function AgentChat({ watcherId }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Allow external focus trigger via '/' key (handled in parent)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const send = useCallback(async () => {
    const query = input.trim();
    if (!query || sending) return;

    const userMsg: Message = { role: 'user', content: query, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await api.invokeWatcher(watcherId, query);
      const responseText = extractResponseText(res.response);
      const agentMsg: Message = { role: 'agent', content: responseText, timestamp: new Date() };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err) {
      const errMsg: Message = {
        role: 'agent',
        content: err instanceof Error ? `Error: ${err.message}` : 'Failed to get agent response.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  }, [input, sending, watcherId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="data-label px-3 pt-3 pb-2">Agent Chat</div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 space-y-2 pb-2 min-h-0">
        {messages.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-6">
            Ask the agent anything about this watcher's emails.
            <br />
            <span className="text-gray-300">Press / to focus</span>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-md px-2.5 py-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-vigil-100 text-vigil-900 text-right'
                  : 'bg-surface-sunken text-gray-700'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-surface-sunken rounded-md px-2.5 py-2 text-xs text-gray-400 flex items-center gap-1.5">
              <span className="spinner-sm" /> Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 px-3 py-2.5 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the agent… (press /)"
          disabled={sending}
          className="input py-1.5 text-xs flex-1"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="btn btn-primary btn-xs shrink-0 disabled:opacity-50"
        >
          {sending ? <span className="spinner-sm" /> : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function extractResponseText(response: unknown): string {
  if (!response) return 'No response from agent.';
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null) {
    const r = response as Record<string, unknown>;
    // Try common response fields
    if (typeof r.decision === 'string') return r.decision;
    if (typeof r.message === 'string') return r.message;
    if (typeof r.content === 'string') return r.content;
    if (typeof r.text === 'string') return r.text;
    // Summarize actions if present
    if (Array.isArray(r.actions) && r.actions.length > 0) {
      return `Agent took ${r.actions.length} action(s): ${r.actions.map((a: unknown) => {
        if (typeof a === 'object' && a !== null) {
          const action = a as Record<string, unknown>;
          return action.tool || action.type || 'action';
        }
        return String(a);
      }).join(', ')}.`;
    }
    return JSON.stringify(response, null, 2);
  }
  return String(response);
}
