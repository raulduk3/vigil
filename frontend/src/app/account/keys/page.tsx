'use client';

import { useEffect, useState } from 'react';
import { RequireAuth } from '@/lib/auth';

interface KeyStatus {
  openai: boolean;
  anthropic: boolean;
  google: boolean;
}

const providers = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...', desc: 'GPT-4.1, GPT-4.1-mini, GPT-4.1-nano, GPT-4o' },
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...', desc: 'Claude Sonnet, Claude Haiku' },
  { id: 'google', name: 'Google', placeholder: 'AIza...', desc: 'Gemini 2.5 Pro, Gemini 2.5 Flash' },
] as const;

function KeysContent() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [keys, setKeys] = useState<Record<string, string>>({ openai: '', anthropic: '', google: '' });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const getToken = () => localStorage.getItem('vigil_access_token');

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const res = await fetch(`${apiUrl}/api/account/keys`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setStatus(await res.json());
    } catch {}
    setLoading(false);
  }

  async function saveKey(provider: string) {
    const key = keys[provider];
    if (!key && !status?.[provider as keyof KeyStatus]) return;

    setSaving(true);
    setMessage('');
    try {
      const body: Record<string, string> = {};
      body[`${provider}_key`] = key; // empty string removes
      const res = await fetch(`${apiUrl}/api/account/keys`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setMessage(key ? `${provider} key saved and encrypted.` : `${provider} key removed.`);
        setKeys(prev => ({ ...prev, [provider]: '' }));
        await loadStatus();
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error || 'Failed to save key.');
      }
    } catch {
      setMessage('Something went wrong.');
    }
    setSaving(false);
    setTimeout(() => setMessage(''), 4000);
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h2 className="text-xl font-display font-semibold text-gray-900 mb-1">Bring Your Own Key</h2>
      <p className="text-sm text-gray-500 mb-6">
        Provide your own API keys for LLM providers. When set, Vigil uses your key instead of the platform key.
        Your keys are encrypted with AES-256-GCM at rest and never exposed through any API.
      </p>

      {message && (
        <div className="mb-6 p-3 rounded bg-surface-sunken text-sm text-gray-700">{message}</div>
      )}

      <div className="space-y-6">
        {providers.map((p) => {
          const isSet = status?.[p.id as keyof KeyStatus] ?? false;
          return (
            <div key={p.id} className="panel p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{p.name}</h3>
                  <p className="text-xs text-gray-500">{p.desc}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded ${isSet ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {isSet ? 'Connected' : 'Not set'}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <input
                  type="password"
                  value={keys[p.id]}
                  onChange={(e) => setKeys(prev => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder={isSet ? '••••••••••••••' : p.placeholder}
                  className="input flex-1 text-sm font-mono"
                />
                <button
                  onClick={() => saveKey(p.id)}
                  disabled={saving}
                  className="btn btn-primary btn-sm shrink-0"
                >
                  {keys[p.id] ? 'Save' : isSet ? 'Remove' : 'Save'}
                </button>
              </div>
              {isSet && !keys[p.id] && (
                <p className="text-xs text-gray-400 mt-2">
                  Key is encrypted and stored. Enter a new key to replace it, or click Remove with an empty field to delete it.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 panel-inset rounded p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">How it works</h3>
        <ul className="text-xs text-gray-600 space-y-1.5">
          <li>When your key is set, Vigil uses it for all LLM calls on your watchers. You pay the provider directly at their rates.</li>
          <li>The platform fee ($0.005/email) still applies. Token costs go to your own API account.</li>
          <li>If your key fails (expired, rate limited, invalid), Vigil falls back to the platform key automatically.</li>
          <li>Keys are encrypted with AES-256-GCM. They are never logged, never returned by any API, and never visible to anyone.</li>
        </ul>
      </div>
    </div>
  );
}

export default function AccountKeysPage() {
  return (
    <RequireAuth>
      <KeysContent />
    </RequireAuth>
  );
}
