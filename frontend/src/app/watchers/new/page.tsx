'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { RequireAuth } from '@/lib/auth';
import { AppHeader } from '@/components/layout';
import { api } from '@/lib/api';
import { DEFAULT_MODEL_ID, MODEL_OPTIONS, normalizeModelId } from '@/lib/models';

const NAME_SUGGESTIONS = ['Work', 'Personal', 'Freelance', 'Bills', 'Newsletters', 'Support'];

const REACTIVITY_LABELS: Record<number, { label: string; desc: string }> = {
  1: { label: 'Minimal', desc: 'Only the most urgent' },
  2: { label: 'Quiet', desc: 'Important items only' },
  3: { label: 'Balanced', desc: 'Alerts when it matters' },
  4: { label: 'Attentive', desc: 'More proactive' },
  5: { label: 'Vigilant', desc: 'Everything worth knowing' },
};

interface CreatedWatcher {
  id: string;
  ingestion_address: string;
  name: string;
}

function SuccessView({ watcher }: { watcher: CreatedWatcher }) {
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const copy = () => {
    navigator.clipboard.writeText(watcher.ingestion_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="text-center">
      <div className="w-14 h-14 rounded-full bg-vigil-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-vigil-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-display font-semibold text-gray-900 mb-1">{watcher.name} is ready</h2>
      <p className="text-sm text-gray-500 mb-8">Forward emails to this address and Vigil starts watching immediately.</p>

      <div className="panel p-5 text-left mb-6">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Your forwarding address</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono text-gray-900 bg-surface-sunken px-3 py-2 rounded break-all">
            {watcher.ingestion_address}
          </code>
          <button onClick={copy} className={`btn btn-secondary btn-sm shrink-0 ${copied ? 'text-vigil-600' : ''}`}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="panel p-5 text-left mb-6">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Fastest: Chrome extension</p>
        <p className="text-sm text-gray-600 mb-3">Walks you through Gmail or Outlook forwarding in 30 seconds.</p>
        <a href="/extension" target="_blank" className="btn btn-primary w-full text-center block">Get the Chrome extension</a>
      </div>

      <div className="panel p-5 text-left mb-8">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Manual setup</p>
        <div className="space-y-3 text-sm text-gray-600">
          <div>
            <span className="font-medium text-gray-800">Gmail:</span> Settings → See all settings → Forwarding and POP/IMAP → Add a forwarding address
          </div>
          <div>
            <span className="font-medium text-gray-800">Outlook:</span> Settings → Mail → Forwarding → Forward to
          </div>
          <div>
            <span className="font-medium text-gray-800">Quick test:</span> Forward one email manually to see it work.
          </div>
        </div>
      </div>

      <button onClick={() => router.push(`/dashboard?watcher=${watcher.id}`)} className="btn btn-primary btn-lg">
        Go to dashboard
      </button>
    </div>
  );
}

function NewWatcherContent() {
  const searchParams = useSearchParams();
  const intentParam = searchParams.get('intent');

  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [reactivity, setReactivity] = useState(3);
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedWatcher | null>(null);

  // Pre-fill from onboarding intent
  useEffect(() => {
    if (intentParam) {
      const intent = decodeURIComponent(intentParam);
      setSystemPrompt(`Monitor and track: ${intent}. Alert me when something needs my attention, when someone is waiting for a response, or when a deadline is approaching.`);
      const words = intent.split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1));
      if (words.length > 0) setName(words.join(' '));
    }
  }, [intentParam]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await api.createWatcher({
        name: name.trim(),
        system_prompt: systemPrompt.trim() || `Watch my ${name.trim().toLowerCase()} emails. Alert me when something needs my attention, when someone is waiting for a response, or when a deadline is approaching. Stay quiet on newsletters, marketing, and automated notifications.`,
        tools: ['send_alert', 'update_thread', 'ignore_thread'],
        reactivity,
        model: normalizeModelId(model),
        silence_hours: 48,
        tick_interval: 120,
      } as Parameters<typeof api.createWatcher>[0]);
      setCreated({
        id: result.watcher.id,
        ingestion_address: result.watcher.ingestion_address,
        name: result.watcher.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create watcher');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (created) {
    return (
      <div className="min-h-screen bg-surface-page">
        <AppHeader />
        <main className="max-w-2xl mx-auto px-6 py-12">
          <SuccessView watcher={created} />
        </main>
      </div>
    );
  }

  const selectedModel = MODEL_OPTIONS.find((m) => m.id === model) ?? MODEL_OPTIONS[0];

  return (
    <div className="min-h-screen bg-surface-page">
      <AppHeader />
      <main className="max-w-xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
          <span>→</span>
          <span className="text-gray-900">New Watcher</span>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <div className="panel p-6 space-y-6">
          <div>
            <h2 className="text-lg font-display font-semibold text-gray-900 mb-1">Create a watcher</h2>
            <p className="text-sm text-gray-500">Name it, optionally describe what to watch, and you're done.</p>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="watcher-name" className="form-label">Name</label>
            <input
              id="watcher-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && handleSubmit()}
              placeholder="e.g., Work, Personal, Freelance"
              className="input w-full text-base"
              autoFocus
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {NAME_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setName(s)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    name === s
                      ? 'border-vigil-500 bg-vigil-50 text-vigil-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt — optional, collapsed by default unless intent was passed */}
          <div>
            <label htmlFor="watcher-prompt" className="form-label">
              Instructions <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="watcher-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={3}
              className="input w-full resize-y text-sm"
              placeholder="Alert me when a client hasn't responded in 48 hours. Ignore newsletters and marketing."
            />
            <p className="text-xs text-gray-400 mt-1">Leave blank for smart defaults. You can refine this anytime.</p>
          </div>

          {/* Advanced — collapsed */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1"
            >
              <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Advanced options
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4 pl-4 border-l-2 border-gray-100">
                {/* Reactivity */}
                <div>
                  <label className="form-label">Reactivity</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setReactivity(level)}
                        title={`${REACTIVITY_LABELS[level].label}: ${REACTIVITY_LABELS[level].desc}`}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold transition-colors ${
                          reactivity === level
                            ? 'bg-vigil-900 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {REACTIVITY_LABELS[reactivity].label} — {REACTIVITY_LABELS[reactivity].desc}
                  </p>
                </div>

                {/* Model */}
                <div>
                  <label className="form-label">Model</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(normalizeModelId(e.target.value))}
                    className="input w-full text-sm"
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} — {m.costPerEmail}/email{m.default ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    {selectedModel.label}: {selectedModel.quality} · {selectedModel.speed}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim()}
            className="w-full btn btn-primary btn-lg"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="spinner" />
                Creating...
              </span>
            ) : (
              'Create watcher'
            )}
          </button>
        </div>
      </main>
    </div>
  );
}

export default function NewWatcherPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="spinner" /></div>}>
        <NewWatcherContent />
      </Suspense>
    </RequireAuth>
  );
}
