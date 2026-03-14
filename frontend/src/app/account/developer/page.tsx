'use client';

import { useState, useEffect } from 'react';
import { api, type ApiKey, type NewApiKey } from '@/lib/api/client';
import Link from 'next/link';

export default function DeveloperPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getApiKeys()
      .then(res => setKeys(res.keys || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await api.createApiKey({ name: newKeyName.trim() });
      const created = res.key as NewApiKey;
      setRevealedKey(created.full_key);
      setKeys(prev => [created, ...prev]);
      setNewKeyName('');
    } catch { /* ignore */ }
    finally { setCreating(false); }
  };

  const handleRevoke = async (id: string) => {
    try {
      await api.deleteApiKey(id);
      setKeys(prev => prev.filter(k => k.id !== id));
    } catch { /* ignore */ }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.vigil.run';

  return (
    <main className="max-w-3xl mx-auto lg:mx-0">
      <h2 className="text-xl sm:text-2xl font-display font-semibold text-gray-900 mb-6">Developer</h2>

      {/* API Keys Section */}
      <div className="panel p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">API Keys</h3>
          <p className="text-xs text-gray-500">Create keys for programmatic access to the Vigil API. Keys are shown once on creation.</p>
        </div>

        {/* Create Key */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Key name (e.g. my-integration)"
            className="input py-2 text-sm flex-1"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newKeyName.trim()}
            className="btn btn-primary btn-sm whitespace-nowrap"
          >
            {creating ? 'Creating...' : 'Create Key'}
          </button>
        </div>

        {/* Revealed Key (shown once) */}
        {revealedKey && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-800 uppercase">New Key Created</span>
              <span className="text-xs text-amber-600">Copy it now — you won&apos;t see it again</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="bg-white border border-amber-200 rounded px-3 py-2 text-sm font-mono text-gray-900 flex-1 select-all break-all">
                {revealedKey}
              </code>
              <button
                onClick={() => handleCopy(revealedKey)}
                className="btn btn-secondary btn-sm shrink-0"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button
              onClick={() => setRevealedKey(null)}
              className="text-xs text-amber-600 hover:text-amber-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Key List */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="spinner-sm" /> Loading keys...
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-400">No API keys yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {keys.map(key => (
              <div key={key.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-700">{key.name}</div>
                  <div className="text-xs text-gray-400 font-mono">{key.key_prefix}...  ·  {key.usage_count} uses{key.last_used_at ? `  ·  last used ${new Date(key.last_used_at).toLocaleDateString()}` : ''}</div>
                </div>
                <button
                  onClick={() => handleRevoke(key.id)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Reference */}
      <div className="panel p-6 space-y-4 mt-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Quick Reference</h3>
          <p className="text-xs text-gray-500">
            Base URL: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{API_URL}/api</code>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Auth header: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">Authorization: Bearer vk_...</code>
          </p>
        </div>

        <div className="space-y-3">
          <QuickRef method="GET" path="/watchers" desc="List all watchers" apiUrl={API_URL} />
          <QuickRef method="GET" path="/watchers/:id/threads" desc="List threads for a watcher" apiUrl={API_URL} />
          <QuickRef method="GET" path="/watchers/:id/memory" desc="List watcher memories" apiUrl={API_URL} />
          <QuickRef method="POST" path="/watchers/:id/invoke" desc="Trigger agent invocation" apiUrl={API_URL} />
          <QuickRef method="GET" path="/usage" desc="Get usage and billing data" apiUrl={API_URL} />
        </div>

        <Link href="/learn/api" className="text-sm text-vigil-700 hover:text-vigil-900 font-medium inline-block mt-2">
          Full API documentation →
        </Link>
      </div>
    </main>
  );
}

function QuickRef({ method, path, desc, apiUrl }: { method: string; path: string; desc: string; apiUrl: string }) {
  const color = method === 'GET' ? 'text-blue-600 bg-blue-50' : 'text-green-600 bg-green-50';
  return (
    <div className="flex items-start gap-2">
      <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${color} shrink-0`}>{method}</span>
      <div className="min-w-0">
        <code className="text-xs font-mono text-gray-700 break-all">{path}</code>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
    </div>
  );
}
