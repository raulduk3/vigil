'use client';

import { useState } from 'react';

export default function OpenClawPage() {
  const [apiKey, setApiKey] = useState('');
  const [copied, setCopied] = useState('');

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const installCmd = `curl -sf https://vigil.run/install-skill.sh | bash`;

  const manualSteps = `# Clone or download the skill
git clone https://github.com/ArekAlvarez/vigil.git
ln -s "$(pwd)/vigil/skills/openclaw" ~/.openclaw/skills/vigil

# Set your API key
echo 'export VIGIL_API_KEY="vk_your_key_here"' >> ~/.zshrc
source ~/.zshrc`;

  const skillMd = `---
name: vigil
description: Query and control Vigil email watchers via API key. Check inbox, obligations, threads, memories, tools, and chat with the agent.
metadata:
  openclaw:
    emoji: "👁️"
---

# Vigil Integration
...`;

  const envBlock = apiKey
    ? `export VIGIL_API_KEY="${apiKey}"`
    : `export VIGIL_API_KEY="vk_your_key_here"`;

  return (
    <div className="prose">
      <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Integration</p>
      <h1>OpenClaw Skill</h1>
      <p>
        Give your OpenClaw assistant full access to your email. The Vigil skill lets your agent
        check your inbox, track obligations, manage threads, and talk to the Vigil agent — all
        through natural language.
      </p>

      <h2>Quick Install</h2>
      <p>One command. Downloads the skill and links it into OpenClaw.</p>

      <div className="not-prose my-6">
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Terminal</span>
            <button onClick={() => handleCopy(installCmd, 'install')} className="btn btn-secondary btn-xs">
              {copied === 'install' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="text-sm text-gray-700 bg-surface-sunken rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono">{installCmd}</pre>
        </div>
      </div>

      <p>
        Or install manually:
      </p>

      <div className="not-prose my-6">
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Manual</span>
            <button onClick={() => handleCopy(manualSteps, 'manual')} className="btn btn-secondary btn-xs">
              {copied === 'manual' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="text-sm text-gray-700 bg-surface-sunken rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono">{manualSteps}</pre>
        </div>
      </div>

      <h2>Configuration</h2>
      <p>
        The skill needs your Vigil API key. Get one from{' '}
        <a href="/account/developer">Account → Developer</a>.
      </p>

      <div className="not-prose my-6">
        <div className="space-y-4">
          <div className="form-group">
            <label className="form-label text-sm">Your API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="input py-2 text-sm font-mono"
              placeholder="vk_..."
            />
          </div>

          <div className="panel p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Add to ~/.zshrc</span>
              <button onClick={() => handleCopy(envBlock, 'env')} className="btn btn-secondary btn-xs">
                {copied === 'env' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="text-sm text-gray-700 bg-surface-sunken rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono">{envBlock}</pre>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm my-4 not-prose">
        <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">VIGIL_API_KEY</code>
        <span className="text-gray-600">Required. Your API key (starts with <code className="text-xs">vk_</code>)</span>
        <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">VIGIL_API_URL</code>
        <span className="text-gray-600">Optional. API base URL. Default: <code className="text-xs">https://api.vigil.run</code></span>
        <code className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">VIGIL_WATCHER_ID</code>
        <span className="text-gray-600">Optional. Default watcher. Auto-detects if not set.</span>
      </div>

      <h2>What You Can Say</h2>
      <p>Once installed, just talk to your assistant:</p>

      <div className="not-prose my-6 space-y-2">
        {[
          { prompt: 'Check my email', command: 'vigil.sh status' },
          { prompt: 'Any obligations I\'m missing?', command: 'vigil.sh obligations' },
          { prompt: 'Show me the last 20 emails', command: 'vigil.sh emails 20' },
          { prompt: 'Tell Vigil to ignore marketing emails', command: 'vigil.sh chat "ignore marketing emails"' },
          { prompt: 'What does Vigil remember?', command: 'vigil.sh memories' },
          { prompt: 'How much has Vigil cost this month?', command: 'vigil.sh usage' },
          { prompt: 'What models are available?', command: 'vigil.sh models' },
          { prompt: 'Show watcher config', command: 'vigil.sh config' },
        ].map(({ prompt, command }) => (
          <div key={command} className="flex items-start gap-3 text-sm">
            <span className="text-gray-400 shrink-0">&quot;{prompt}&quot;</span>
            <span className="text-gray-300">→</span>
            <code className="text-xs text-gray-600 font-mono">{command}</code>
          </div>
        ))}
      </div>

      <h2>All Commands</h2>

      <div className="not-prose my-6">
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Command</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['status', 'Inbox overview with costs, active threads, watching threads'],
                ['emails [n]', 'List recent emails with triage status (default 10)'],
                ['threads [status]', 'List threads: active, watching, ignored, resolved'],
                ['obligations', 'Ask the agent what needs attention right now'],
                ['chat "message"', 'Talk to the agent — can take actions and add rules'],
                ['usage', 'Full cost and usage breakdown'],
                ['memories', 'List agent memories with importance levels'],
                ['tools', 'List custom webhook tools'],
                ['models', 'List available AI models'],
                ['config', 'Show all watcher configurations'],
                ['set-model <id> <model>', 'Change a watcher\'s AI model'],
                ['flush [watcher_id]', 'Flush all data for a watcher'],
              ].map(([cmd, desc]) => (
                <tr key={cmd} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-gray-900 whitespace-nowrap">{cmd}</td>
                  <td className="px-3 py-2 text-gray-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2>How It Works</h2>
      <p>
        The skill is a <code>SKILL.md</code> file that tells OpenClaw when and how to call Vigil,
        plus a bash script that wraps the Vigil REST API. When you mention email, obligations, or
        deadlines, OpenClaw matches the skill description and runs the appropriate command.
      </p>
      <p>
        The script uses <code>curl</code> and <code>python3</code> (both preinstalled on macOS and
        most Linux systems). No additional dependencies.
      </p>

      <h2>Public Files</h2>
      <p>These files are available for agents and scripts:</p>
      <ul>
        <li><a href="https://vigil.run/SKILL.md"><code>vigil.run/SKILL.md</code></a> — skill definition</li>
        <li><a href="https://vigil.run/vigil.sh"><code>vigil.run/vigil.sh</code></a> — CLI wrapper script</li>
        <li><a href="https://vigil.run/llms.txt"><code>vigil.run/llms.txt</code></a> — machine-readable product summary</li>
      </ul>

      <h2>What is OpenClaw?</h2>
      <p>
        <a href="https://openclaw.com">OpenClaw</a> is an AI assistant platform that uses skills
        to extend what your agent can do. Skills are directories with a <code>SKILL.md</code> file
        and optional scripts. Drop them in <code>~/.openclaw/skills/</code> and your assistant
        learns new capabilities.
      </p>
    </div>
  );
}
