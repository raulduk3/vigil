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

  const curlExample = `curl -s https://api.vigil.run/api/watchers/${watcherId || '<watcher-id>'}/threads \\
  -H "Authorization: Bearer ${apiKey || '<your-api-key>'}"`;

  const pythonExample = `import requests

API_KEY = "${apiKey || '<your-api-key>'}"
WATCHER = "${watcherId || '<watcher-id>'}"
BASE = "https://api.vigil.run/api"

headers = {"Authorization": f"Bearer {API_KEY}"}

# Check obligations
threads = requests.get(f"{BASE}/watchers/{WATCHER}/threads", headers=headers).json()
for t in threads:
    if t.get("has_obligation"):
        print(f"Waiting: {t['subject']} from {t['from_addr']}")

# Chat with the agent
resp = requests.post(
    f"{BASE}/watchers/{WATCHER}/invoke",
    headers=headers,
    json={"message": "What needs my attention today?"}
)
print(resp.json()["response"])`;

  const typescriptExample = `const API_KEY = "${apiKey || '<your-api-key>'}";
const WATCHER = "${watcherId || '<watcher-id>'}";
const BASE = "https://api.vigil.run/api";

const headers = { Authorization: \`Bearer \${API_KEY}\` };

// Get inbox threads
const threads = await fetch(\`\${BASE}/watchers/\${WATCHER}/threads\`, { headers })
  .then(r => r.json());

// Ask the agent a question
const { response } = await fetch(\`\${BASE}/watchers/\${WATCHER}/invoke\`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Summarize today's inbox" }),
}).then(r => r.json());`;

  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Integration Guide</p>
      <h1>Connect Vigil to Your Agent</h1>
      <p>
        Vigil works as a dedicated email sub-agent for any AI system. Give your assistant,
        copilot, or autonomous agent access to your email through a simple REST API.
        Check obligations, read thread summaries, take actions, and query everything
        happening in your inbox.
      </p>

      <h2>How It Works</h2>
      <p>
        Any system that can make HTTP calls can connect to Vigil: agent frameworks
        (LangChain, CrewAI, AutoGen, Semantic Kernel), personal assistants, custom bots,
        cron jobs, or a simple script. Authenticate with an API key and you get:
      </p>
      <ul>
        <li><strong>Read the inbox</strong> — every email Vigil has processed, with AI summaries</li>
        <li><strong>Check obligations</strong> — who&apos;s waiting, what deadlines are approaching</li>
        <li><strong>Take actions</strong> — ignore senders, resolve threads, change alert behavior</li>
        <li><strong>Access memory</strong> — facts the agent has stored across all emails</li>
        <li><strong>Control behavior</strong> — add rules, modify the prompt, adjust reactivity</li>
        <li><strong>Chat with the agent</strong> — natural language commands, executed autonomously</li>
      </ul>

      <h2>Quick Setup</h2>
      <ol>
        <li><strong>Create an API key</strong> at <a href="/account/developer">Account &rarr; Developer</a></li>
        <li><strong>Get your watcher ID</strong> from the dashboard URL or the watchers API</li>
        <li><strong>Make API calls</strong> from your agent, script, or application</li>
      </ol>

      <h2>One-Line Install</h2>
      <pre><code>{`curl -s https://vigil.run/vigil.sh -o vigil.sh && chmod +x vigil.sh
# Edit vigil.sh: set VK and WATCHER, then:
./vigil.sh status`}</code></pre>

      <h2>Public Files</h2>
      <p>These files are available for agents, scripts, and integrations:</p>
      <ul>
        <li><a href="https://vigil.run/SKILL.md"><code>vigil.run/SKILL.md</code></a> — agent skill definition with API reference</li>
        <li><a href="https://vigil.run/vigil.sh"><code>vigil.run/vigil.sh</code></a> — CLI wrapper script (bash, requires curl + python3)</li>
        <li><a href="https://vigil.run/llms.txt"><code>vigil.run/llms.txt</code></a> — machine-readable product summary for AI agents</li>
      </ul>

      <h2>Try It</h2>
      <p>Enter your credentials to generate ready-to-use code.</p>

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

        {/* cURL */}
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">cURL</span>
            <button onClick={() => handleCopy(curlExample, 'curl')} className="btn btn-secondary btn-xs">
              {copied === 'curl' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="text-xs text-gray-700 bg-surface-sunken rounded p-3 overflow-x-auto whitespace-pre-wrap">{curlExample}</pre>
        </div>

        {/* Python */}
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Python</span>
            <button onClick={() => handleCopy(pythonExample, 'python')} className="btn btn-secondary btn-xs">
              {copied === 'python' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="text-xs text-gray-700 bg-surface-sunken rounded p-3 overflow-x-auto max-h-72 overflow-y-auto whitespace-pre-wrap">{pythonExample}</pre>
        </div>

        {/* TypeScript */}
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">TypeScript</span>
            <button onClick={() => handleCopy(typescriptExample, 'ts')} className="btn btn-secondary btn-xs">
              {copied === 'ts' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="text-xs text-gray-700 bg-surface-sunken rounded p-3 overflow-x-auto max-h-72 overflow-y-auto whitespace-pre-wrap">{typescriptExample}</pre>
        </div>
      </div>

      <h2>API Reference</h2>
      <p>All endpoints use <code>Authorization: Bearer vk_...</code></p>

      <h3>Watchers</h3>
      <ul>
        <li><code>GET /api/watchers</code> — list all watchers</li>
        <li><code>GET /api/watchers/:id</code> — watcher details</li>
        <li><code>POST /api/watchers</code> — create a watcher</li>
        <li><code>PUT /api/watchers/:id</code> — update watcher config</li>
      </ul>

      <h3>Threads and Inbox</h3>
      <ul>
        <li><code>GET /api/watchers/:id/threads</code> — list email threads</li>
        <li><code>GET /api/watchers/:id/threads/:threadId</code> — thread detail with emails</li>
        <li><code>POST /api/watchers/:id/threads/:threadId/close</code> — close a thread</li>
      </ul>

      <h3>Agent</h3>
      <ul>
        <li><code>POST /api/watchers/:id/invoke</code> — chat with the watcher agent</li>
        <li><code>POST /api/watchers/:id/digest</code> — generate an inbox digest</li>
        <li><code>GET /api/watchers/:id/memory</code> — agent memories</li>
        <li><code>GET /api/watchers/:id/actions</code> — action history</li>
      </ul>

      <h3>Account</h3>
      <ul>
        <li><code>GET /api/usage</code> — cost and usage breakdown</li>
        <li><code>GET /api/keys</code> — list API keys</li>
        <li><code>POST /api/keys</code> — create a new API key</li>
      </ul>

      <h2>What Your Agent Can Say to Vigil</h2>
      <p>Through the invoke endpoint, your agent gives natural language commands:</p>
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

      <h2>Agent Framework Examples</h2>
      <p>
        Vigil&apos;s API is framework-agnostic. Here are patterns for common setups:
      </p>
      <ul>
        <li><strong>LangChain / LangGraph</strong> — wrap the invoke endpoint as a custom tool. The agent calls it when the user asks about email.</li>
        <li><strong>CrewAI</strong> — assign a &quot;mail analyst&quot; crew member with Vigil API access. It checks obligations on a schedule and reports to the lead agent.</li>
        <li><strong>AutoGen / Semantic Kernel</strong> — register Vigil endpoints as function calls. The planner invokes them when email context is needed.</li>
        <li><strong>MCP (Model Context Protocol)</strong> — expose Vigil&apos;s API as MCP tools. Any MCP-compatible client can query the inbox.</li>
        <li><strong>Cron / scripts</strong> — call the digest endpoint on a schedule, pipe the result to Slack, email, or a dashboard.</li>
        <li><strong><a href="/learn/openclaw">OpenClaw</a></strong> — one-command install. Drop the Vigil skill into your OpenClaw agent and talk to your inbox in natural language.</li>
      </ul>
    </div>
  );
}
