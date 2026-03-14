'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { RequireAuth } from '@/lib/auth';
import { AppHeader } from '@/components/layout';
import { api } from '@/lib/api';

const NAME_SUGGESTIONS = ['Work', 'Personal', 'Freelance', 'Bills', 'Newsletters', 'Support'];

const MODELS = [
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', costPer1M: '$0.14', costPerEmail: '~$0.0001', speed: 'Fastest', quality: 'Basic triage' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', costPer1M: '$0.21', costPerEmail: '~$0.0002', speed: 'Fast', quality: 'Good balance' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', costPer1M: '$0.21', costPerEmail: '~$0.0002', speed: 'Fast', quality: 'Good balance' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', costPer1M: '$0.56', costPerEmail: '~$0.0006', speed: 'Fast', quality: 'Recommended', default: true },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4', costPer1M: '$1.12', costPerEmail: '~$0.001', speed: 'Fast', quality: 'Strong reasoning' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', costPer1M: '$1.75', costPerEmail: '~$0.002', speed: 'Moderate', quality: 'High accuracy' },
  { id: 'gpt-4.1', label: 'GPT-4.1', costPer1M: '$2.80', costPerEmail: '~$0.003', speed: 'Moderate', quality: 'High accuracy' },
  { id: 'gpt-4o', label: 'GPT-4o', costPer1M: '$3.50', costPerEmail: '~$0.004', speed: 'Moderate', quality: 'High accuracy' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4', costPer1M: '$4.20', costPerEmail: '~$0.004', speed: 'Moderate', quality: 'Strongest reasoning' },
];

const TOOLS = [
  { id: 'send_alert', label: 'Send Alert', description: 'Email you when something needs attention' },
  { id: 'update_thread', label: 'Update Thread', description: 'Track thread status and summaries' },
  { id: 'ignore_thread', label: 'Ignore Thread', description: 'Mark noise threads to skip in future' },
];

const REACTIVITY_LABELS: Record<number, { label: string; description: string }> = {
  1: { label: 'Minimal', description: 'Only the most urgent issues' },
  2: { label: 'Quiet', description: 'Important items only, low noise' },
  3: { label: 'Balanced', description: 'Alerts when it matters' },
  4: { label: 'Attentive', description: 'More proactive, some extra alerts' },
  5: { label: 'Vigilant', description: 'Alert on anything worth knowing' },
};

type Step = 1 | 2 | 3 | 4;

function StepIndicator({ current, total }: { current: Step; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => (
        <React.Fragment key={step}>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
            step < current ? 'bg-vigil-600 text-white' :
            step === current ? 'bg-vigil-900 text-white' :
            'bg-gray-100 text-gray-400'
          }`}>
            {step < current ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : step}
          </div>
          {step < total && (
            <div className={`flex-1 h-0.5 transition-colors ${step < current ? 'bg-vigil-600' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

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
      <h2 className="text-xl font-display font-semibold text-gray-900 mb-1">{watcher.name} created</h2>
      <p className="text-sm text-gray-500 mb-8">Forward emails to this address to start watching.</p>

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

      <div className="panel p-5 text-left mb-8">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Set up forwarding</p>
        <div className="space-y-3 text-sm text-gray-600">
          <div>
            <span className="font-medium text-gray-800">Gmail:</span> Settings → See all settings → Forwarding and POP/IMAP → Add a forwarding address
          </div>
          <div>
            <span className="font-medium text-gray-800">Outlook:</span> Settings → Mail → Forwarding → Forward to
          </div>
          <div>
            <span className="font-medium text-gray-800">Any email:</span> Or just BCC / forward individual emails manually to test.
          </div>
        </div>
      </div>

      <button onClick={() => router.push(`/watchers/${watcher.id}`)} className="btn btn-primary btn-lg">
        Go to watcher dashboard
      </button>
    </div>
  );
}

function NewWatcherContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intentParam = searchParams.get('intent');

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  // Pre-fill from onboarding intent
  useEffect(() => {
    if (intentParam) {
      const intent = decodeURIComponent(intentParam);
      setSystemPrompt(`Monitor and track: ${intent}. Alert me when something needs my attention, when someone is waiting for a response, or when a deadline is approaching.`);
      // Try to generate a name from the intent
      const words = intent.split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1));
      if (words.length > 0) setName(words.join(' '));
    }
  }, [intentParam]);
  const [reactivity, setReactivity] = useState(3);
  const [model, setModel] = useState('gpt-4.1-mini');
  const [tools, setTools] = useState(['send_alert', 'update_thread', 'ignore_thread']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedWatcher | null>(null);

  const toggleTool = (toolId: string) => {
    setTools((prev) => prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]);
  };

  const canProceed = () => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return systemPrompt.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (step < 4) setStep((s) => (s + 1) as Step);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await api.createWatcher({
        name: name.trim(),
        system_prompt: systemPrompt.trim(),
        tools,
        reactivity,
        model,
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

  const selectedModel = MODELS.find((m) => m.id === model) ?? MODELS[3];

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

  return (
    <div className="min-h-screen bg-surface-page">
      <AppHeader />
      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link href="/dashboard" className="hover:text-gray-700">Dashboard</Link>
          <span>→</span>
          <span className="text-gray-900">New Watcher</span>
        </div>

        <StepIndicator current={step} total={4} />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {/* Step 1: Name */}
        {step === 1 && (
          <div className="panel p-6 space-y-5">
            <div>
              <h2 className="text-lg font-display font-semibold text-gray-900 mb-1">Name your watcher</h2>
              <p className="text-sm text-gray-500 mb-4">Give it a name that describes what emails it will watch.</p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canProceed() && handleNext()}
                placeholder="e.g., Work, Personal, Freelance"
                className="input w-full text-base"
                autoFocus
              />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2">Suggestions</p>
              <div className="flex flex-wrap gap-2">
                {NAME_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setName(s)}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      name === s
                        ? 'border-vigil-500 bg-vigil-50 text-vigil-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Prompt */}
        {step === 2 && (
          <div className="panel p-6">
            <h2 className="text-lg font-display font-semibold text-gray-900 mb-1">Describe what to watch</h2>
            <p className="text-sm text-gray-500 mb-4">Tell the agent what kinds of emails need attention and what to ignore.</p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={7}
              className="input w-full resize-y text-sm"
              placeholder="Monitor my work emails. Alert me when deadlines are approaching or when someone is waiting for my response. Stay quiet on newsletters, order confirmations, and marketing emails."
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-2">Be specific about what deserves an alert vs. what should be silently tracked.</p>
          </div>
        )}

        {/* Step 3: Reactivity */}
        {step === 3 && (
          <div className="panel p-6 space-y-5">
            <div>
              <h2 className="text-lg font-display font-semibold text-gray-900 mb-1">Choose reactivity</h2>
              <p className="text-sm text-gray-500 mb-6">How sensitive should the agent be? Higher = more alerts.</p>
            </div>

            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((level) => {
                const info = REACTIVITY_LABELS[level];
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setReactivity(level)}
                    className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg border text-left transition-colors ${
                      reactivity === level
                        ? 'border-vigil-500 bg-vigil-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      reactivity === level ? 'bg-vigil-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {level}
                    </div>
                    <div>
                      <div className={`text-sm font-medium ${reactivity === level ? 'text-vigil-800' : 'text-gray-700'}`}>
                        {info.label}
                      </div>
                      <div className="text-xs text-gray-500">{info.description}</div>
                    </div>
                    {level === 3 && (
                      <span className="ml-auto text-xs text-vigil-600 font-medium">recommended</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tools */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-600 mb-2">Agent capabilities</p>
              <div className="flex flex-wrap gap-2">
                {TOOLS.map((tool) => {
                  const active = tools.includes(tool.id);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => toggleTool(tool.id)}
                      title={tool.description}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        active
                          ? 'bg-vigil-900 border-vigil-900 text-white'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {tool.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Model */}
        {step === 4 && (
          <div className="panel p-6 space-y-4">
            <div>
              <h2 className="text-lg font-display font-semibold text-gray-900 mb-1">Choose model</h2>
              <p className="text-sm text-gray-500 mb-4">The AI model used to read and analyze emails. You can change this later.</p>
            </div>

            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="input w-full text-sm"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.costPer1M}/1M tokens ({m.costPerEmail}/email){m.default ? ' ★ default' : ''}
                </option>
              ))}
            </select>

            {selectedModel && (
              <div className="panel-inset px-4 py-3 text-sm text-gray-600 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">{selectedModel.label}</span>
                  <span className="font-mono text-xs">{selectedModel.costPerEmail} per email</span>
                </div>
                <div className="text-xs text-gray-500">{selectedModel.quality} · {selectedModel.speed}</div>
              </div>
            )}

            {/* Summary */}
            <div className="border-t border-gray-100 pt-4 space-y-2 text-sm text-gray-600">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Summary</p>
              <div className="flex justify-between">
                <span>Name</span>
                <span className="font-medium text-gray-800">{name}</span>
              </div>
              <div className="flex justify-between">
                <span>Reactivity</span>
                <span className="font-medium text-gray-800">{REACTIVITY_LABELS[reactivity].label}</span>
              </div>
              <div className="flex justify-between">
                <span>Model</span>
                <span className="font-medium text-gray-800">{selectedModel?.label}</span>
              </div>
              <div className="flex justify-between">
                <span>Tools</span>
                <span className="font-medium text-gray-800">{tools.length} enabled</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          {step > 1 ? (
            <button type="button" onClick={handleBack} className="btn btn-secondary">
              Back
            </button>
          ) : (
            <Link href="/dashboard" className="btn btn-secondary">Cancel</Link>
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed()}
              className="btn btn-primary"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn btn-primary"
            >
              {isSubmitting ? 'Creating…' : 'Create Watcher'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

export default function NewWatcherPage() {
  return (
    <RequireAuth>
      <NewWatcherContent />
    </RequireAuth>
  );
}
