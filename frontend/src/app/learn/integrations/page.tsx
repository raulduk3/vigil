'use client';

import { useState } from 'react';

export default function IntegrationsPage() {
  const [apiKey, setApiKey] = useState('');
  const [watcherId, setWatcherId] = useState('');
  const [copied, setCopied] = useState('');

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const skillMd = [
    '---',
    'name: vigil',
    'description: Query and control Vigil email watchers. Check inbox, obligations, threads, memories. Use when the user asks about email, deadlines, or obligations.',
    'metadata:',
    '  openclaw:',
    '    emoji: "👁️"',
    '---',
    '',
    '# Vigil Integration',
    '',
    `API: https://api.vigil.run`,
    `Auth: Authorization: Bearer ${apiKey || '<your-api-key>'}`,
    `Watcher: ${watcherId || '<your-watcher-id>'}`,
    '',
    '## Commands',
    '',
    '| Command | Description |',
    '|---------|-------------|',
    '| `vigil.sh status` | Inbox overview |',
    '| `vigil.sh emails` | Recent emails with triage |',
    '| `vigil.sh obligations` | What needs attention now |',
    '| `vigil.sh chat "msg"` | Talk to the agent |',
    '| `vigil.sh usage` | Cost breakdown |',
    '| `vigil.sh memories` | Agent memories |',
    '',
    'Script: `~/.openclaw/skills/vigil/scripts/vigil.sh`',
  ].join('\n');

  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Integration Guide</p>
      <h1>Connect Vigil to Your Agent</h1>
      <p>
        Vigil works as a dedicated email sub-agent for any agent system. Give your AI assistant
        full access to your email inbox through Vigil&apos;s API. Your agent can check obligations,
        read thread summaries, take actions, and stay informed about everything happening in your email.
      </p>

      <h2>How It Works</h2>
      <p>
        Your agent (OpenClaw, LangChain, CrewAI, or any system that can run shell commands or HTTP calls)
        connects to Vigil via a simple API key. It can:
      </p>
      <ul>
        <li><strong>Read the inbox</strong> — every email Vigil has processed, with AI summaries</li>
        <li><strong>Check obligations</strong> — who&apos;s waiting, what deadlines are approaching</li>
        <li><strong>Take actions</strong> — ignore senders, resolve threads, change alert behavior</li>
        <li><strong>Access memory</strong> — facts the agent has stored across all emails</li>
        <li><strong>Control behavior</strong> — add rules, modify the prompt, adjust reactivity</li>
      </ul>

      <h2>Quick Setup</h2>
      <ol>
        <li><strong>Create an API key</strong> at <a href="/account/developer">Account → Developer</a></li>
        <li><strong>Get your watcher ID</strong> from the dashboard URL</li>
        <li><strong>Drop the skill files</strong> into your agent&apos;s skill directory</li>
      </ol>

      <h2>Generate Your SKILL.md</h2>
      <p>Enter your credentials to generate a ready-to-use skill file.</p>

      <div className="not-prose space-y-4 my-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="form-group">
            <label className="form-label text-sm">API Key</label>
            <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
              className="input py-2 text-sm font-mono" placeholder="vk_..." />
          </div>
          <div className="form-group">
            <label className="form-label text-sm">Watcher ID</label>
            <input type="text" value={watcherId} onChange={e => setWatcherId(e.target.value)}
              className="input py-2 text-sm font-mono" placeholder="de8d5254-..." />
          </div>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">SKILL.md</span>
            <button onClick={() => handleCopy(skillMd, 'skill')} className="btn btn-secondary btn-xs">
              {copied === 'skill' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="text-xs text-gray-700 bg-surface-sunken rounded p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">{skillMd}</pre>
        </div>
      </div>

      <h2>Installation</h2>
      <pre><code>{`mkdir -p ~/.openclaw/skills/vigil/scripts
# Save SKILL.md to ~/.openclaw/skills/vigil/SKILL.md
# Download vigil.sh from the Vigil GitHub repo
chmod +x ~/.openclaw/skills/vigil/scripts/vigil.sh`}</code></pre>
      <p>Your agent discovers the skill automatically and uses it when you ask about email.</p>

      <h2>API Endpoints</h2>
      <p>All endpoints use <code>Authorization: Bearer vk_...</code></p>
      <ul>
        <li><code>GET /api/usage</code> — account usage and cost</li>
        <li><code>GET /api/watchers/:id/threads</code> — list threads</li>
        <li><code>GET /api/watchers/:id/memory</code> — agent memories</li>
        <li><code>GET /api/watchers/:id/actions</code> — action history</li>
        <li><code>POST /api/watchers/:id/invoke</code> — chat with the agent</li>
      </ul>

      <h2>What Your Agent Can Say to Vigil</h2>
      <p>Through the chat endpoint, your agent gives natural language commands:</p>
      <ul>
        <li>&quot;Ignore all emails from marketing@company.com&quot;</li>
        <li>&quot;What deadlines are coming up this week?&quot;</li>
        <li>&quot;Resolve the invoice thread, I already paid it&quot;</li>
        <li>&quot;Be more aggressive about alerting on client emails&quot;</li>
        <li>&quot;Summarize what happened in my inbox today&quot;</li>
      </ul>
      <p>
        Vigil executes these autonomously. Your parent agent doesn&apos;t need to understand email
        infrastructure. It talks to Vigil like a colleague who manages the inbox.
      </p>
    </div>
  );
}
