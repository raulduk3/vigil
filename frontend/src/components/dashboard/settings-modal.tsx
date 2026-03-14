'use client';

import { useState, useEffect } from 'react';
import { api, type Watcher, type Channel } from '@/lib/api/client';
import { ReactivitySlider } from './reactivity-slider';
import { Term } from '@/components/ui/term';

type Tab = 'general' | 'prompt' | 'channels';

interface SettingsModalProps {
  watcher: Watcher;
  onClose: () => void;
  onUpdate: (watcher: Watcher) => void;
  onDelete: (watcherId: string) => void;
}

const TOOLS = [
  { id: 'send_alert', label: 'Send Alert', description: 'Email when something needs attention' },
  { id: 'update_thread', label: 'Update Thread', description: 'Change thread status or summary' },
  { id: 'ignore_thread', label: 'Ignore Thread', description: 'Mark thread as noise' },
  { id: 'webhook', label: 'Webhook', description: 'POST to a configured URL' },
];

const MEMORY_SENSITIVITY_LEVELS = [
  { value: 1, label: 'Minimal', description: 'Only store deadlines and money' },
  { value: 2, label: 'Low', description: 'Concrete facts only' },
  { value: 3, label: 'Balanced', description: 'Default — key facts and context' },
  { value: 4, label: 'Detailed', description: 'Context and patterns' },
  { value: 5, label: 'Maximum', description: 'Remember everything' },
];

function MemorySensitivitySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const current = MEMORY_SENSITIVITY_LEVELS.find((l) => l.value === value) ?? MEMORY_SENSITIVITY_LEVELS[2];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-700">Memory Sensitivity</h4>
          <p className="text-xs text-gray-500 mt-0.5">How much the agent stores in memory</p>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-gray-900 tabular-nums">{value}/5</span>
          <p className="text-xs text-gray-500">{current.label}</p>
        </div>
      </div>
      <div className="relative mb-3">
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
          style={{ background: `linear-gradient(to right, #93c5fd 0%, #3b82f6 50%, #1d4ed8 100%)` }}
        />
        <div className="flex justify-between mt-1.5">
          {MEMORY_SENSITIVITY_LEVELS.map((level) => (
            <button
              key={level.value}
              type="button"
              onClick={() => onChange(level.value)}
              className={`w-6 h-6 rounded-full text-xs font-semibold transition-all ${
                value === level.value
                  ? 'bg-blue-500 text-white shadow-raised-sm'
                  : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              }`}
            >
              {level.value}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-inset px-3 py-2">
        <p className="text-xs text-gray-600">{current.description}</p>
      </div>
    </div>
  );
}

export function SettingsModal({ watcher, onClose, onUpdate, onDelete }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // General state
  const [name, setName] = useState(watcher.name);
  const [reactivity, setReactivity] = useState(watcher.reactivity ?? 3);
  const [memorySensitivity, setMemorySensitivity] = useState((watcher as any).memory_sensitivity ?? 3);
  const [model, setModel] = useState((watcher as any).model ?? 'gpt-4.1-mini');
  const [silenceHours, setSilenceHours] = useState(watcher.silence_hours);
  const [tickInterval, setTickInterval] = useState(watcher.tick_interval);
  const [tools, setTools] = useState<string[]>(watcher.tools);

  // Prompt state
  const [systemPrompt, setSystemPrompt] = useState(watcher.system_prompt);

  // Channels state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [newChannelType, setNewChannelType] = useState<'email' | 'webhook'>('email');
  const [newChannelDest, setNewChannelDest] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);

  // Delete state
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (tab === 'channels') {
      setLoadingChannels(true);
      api.getChannels(watcher.id)
        .then((res) => setChannels(res.channels || []))
        .catch(() => setChannels([]))
        .finally(() => setLoadingChannels(false));
    }
  }, [tab, watcher.id]);

  const handleToggleTool = (toolId: string) => {
    setTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  const handleSaveGeneral = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateWatcher(watcher.id, {
        name,
        reactivity,
        memory_sensitivity: memorySensitivity,
        model,
        silence_hours: silenceHours,
        tick_interval: tickInterval,
        tools,
      } as any);
      onUpdate(res.watcher);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrompt = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateWatcher(watcher.id, { system_prompt: systemPrompt });
      onUpdate(res.watcher);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddChannel = async () => {
    if (!newChannelDest.trim()) return;
    setAddingChannel(true);
    try {
      const res = await api.createChannel(watcher.id, { type: newChannelType, destination: newChannelDest.trim() });
      setChannels((prev) => [...prev, res.channel]);
      setNewChannelDest('');
    } catch {
      // ignore
    } finally {
      setAddingChannel(false);
    }
  };

  const handleToggleChannel = async (channel: Channel) => {
    try {
      const res = await api.updateChannel(watcher.id, channel.id, { enabled: !channel.enabled });
      setChannels((prev) => prev.map((c) => (c.id === channel.id ? res.channel : c)));
    } catch {
      // ignore
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    try {
      await api.deleteChannel(watcher.id, channelId);
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
    } catch {
      // ignore
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== watcher.name) return;
    setDeleting(true);
    try {
      await api.deleteWatcher(watcher.id);
      onDelete(watcher.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
      setDeleting(false);
    }
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: 'general', label: 'General' },
    { value: 'prompt', label: 'Prompt' },
    { value: 'channels', label: 'Channels' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-surface-raised rounded-lg shadow-panel-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{watcher.name}</h2>
            <p className="text-xs text-gray-400 font-mono">{watcher.ingestion_address}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-5">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.value
                  ? 'border-vigil-900 text-vigil-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="notice notice-error mb-4 text-sm">{error}</div>
          )}

          {/* General tab */}
          {tab === 'general' && (
            <div className="space-y-4">
              <div className="form-group">
                <label className="form-label text-sm">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input py-2"
                />
              </div>

              <ReactivitySlider value={reactivity} onChange={setReactivity} variant="full" />

              <MemorySensitivitySlider value={memorySensitivity} onChange={setMemorySensitivity} />

              <div className="form-group">
                <label className="form-label text-sm">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="input py-2"
                >
                  <optgroup label="OpenAI">
                    <option value="gpt-4.1-nano">GPT-4.1 Nano — $0.12/M in</option>
                    <option value="gpt-4o-mini">GPT-4o Mini — $0.18/M in</option>
                    <option value="gpt-4.1-mini">GPT-4.1 Mini — $0.48/M in</option>
                    <option value="gpt-4.1">GPT-4.1 — $2.40/M in</option>
                    <option value="gpt-4o">GPT-4o — $3.00/M in</option>
                  </optgroup>
                  <optgroup label="Anthropic">
                    <option value="claude-haiku-4">Claude Haiku 4 — $0.96/M in</option>
                    <option value="claude-sonnet-4">Claude Sonnet 4 — $3.60/M in</option>
                  </optgroup>
                  <optgroup label="Google">
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash — $0.18/M in</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro — $1.50/M in</option>
                  </optgroup>
                </select>
                <p className="text-xs text-gray-400 mt-1">Affects both email triage and chat. Cheaper models are faster but less nuanced.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label text-sm"><Term>Silence Threshold</Term> (hours)</label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={silenceHours}
                    onChange={(e) => setSilenceHours(parseInt(e.target.value) || 1)}
                    className="input py-2"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label text-sm"><Term>Tick Interval</Term> (minutes)</label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={tickInterval}
                    onChange={(e) => setTickInterval(parseInt(e.target.value) || 5)}
                    className="input py-2"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label text-sm">Tools</label>
                <div className="space-y-2">
                  {TOOLS.map((tool) => (
                    <label key={tool.id} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={tools.includes(tool.id)}
                        onChange={() => handleToggleTool(tool.id)}
                        className="w-4 h-4 accent-vigil-900"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-700">{tool.label}</div>
                        <div className="text-xs text-gray-400">{tool.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSaveGeneral}
                disabled={saving}
                className="btn btn-primary btn-sm w-full"
              >
                {saving ? <span className="spinner-sm" /> : 'Save Changes'}
              </button>

              {/* Danger zone */}
              <div className="border border-red-200 rounded-md p-4 space-y-3">
                <h4 className="text-sm font-medium text-red-700">Danger Zone</h4>
                {!showDelete ? (
                  <button
                    onClick={() => setShowDelete(true)}
                    className="btn btn-danger-subtle btn-sm"
                  >
                    Delete Watcher
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600">
                      Type <strong>{watcher.name}</strong> to confirm deletion. This will permanently delete all threads, emails, actions, memories, and channels.
                    </p>
                    <input
                      type="text"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={watcher.name}
                      className="input py-1.5 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleDelete}
                        disabled={deleteConfirm !== watcher.name || deleting}
                        className="btn btn-danger btn-sm disabled:opacity-50"
                      >
                        {deleting ? <span className="spinner-sm" /> : 'Delete Permanently'}
                      </button>
                      <button onClick={() => setShowDelete(false)} className="btn btn-secondary btn-sm">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Prompt tab */}
          {tab === 'prompt' && (
            <div className="space-y-3">
              <div className="form-group">
                <label className="form-label text-sm">System Prompt</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={14}
                  className="input py-2 resize-none font-mono text-xs leading-relaxed"
                />
              </div>
              <button
                onClick={handleSavePrompt}
                disabled={saving}
                className="btn btn-primary btn-sm w-full"
              >
                {saving ? <span className="spinner-sm" /> : 'Save Prompt'}
              </button>
            </div>
          )}

          {/* Channels tab */}
          {tab === 'channels' && (
            <div className="space-y-4">
              {loadingChannels ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="spinner-sm" /> Loading channels...
                </div>
              ) : (
                <>
                  {channels.length === 0 && (
                    <p className="text-sm text-gray-400">No alert channels configured.</p>
                  )}
                  {channels.map((channel) => (
                    <div key={channel.id} className="flex items-center gap-3 panel px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-500 uppercase">{channel.type}</div>
                        <div className="text-sm text-gray-700 font-mono truncate">{channel.destination}</div>
                      </div>
                      <button
                        onClick={() => handleToggleChannel(channel)}
                        className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                          channel.enabled
                            ? 'text-status-ok bg-status-ok/10 hover:bg-status-ok/20'
                            : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                        }`}
                      >
                        {channel.enabled ? 'On' : 'Off'}
                      </button>
                      <button
                        onClick={() => handleDeleteChannel(channel.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  {/* Add channel */}
                  <div className="border-t border-gray-200 pt-4 space-y-2">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Add Channel</div>
                    <div className="flex gap-2">
                      <select
                        value={newChannelType}
                        onChange={(e) => setNewChannelType(e.target.value as 'email' | 'webhook')}
                        className="input py-1.5 text-sm w-28 shrink-0"
                      >
                        <option value="email">Email</option>
                        <option value="webhook">Webhook</option>
                      </select>
                      <input
                        type="text"
                        value={newChannelDest}
                        onChange={(e) => setNewChannelDest(e.target.value)}
                        placeholder={newChannelType === 'email' ? 'you@example.com' : 'https://...'}
                        className="input py-1.5 text-sm flex-1"
                      />
                    </div>
                    <button
                      onClick={handleAddChannel}
                      disabled={addingChannel || !newChannelDest.trim()}
                      className="btn btn-secondary btn-sm"
                    >
                      {addingChannel ? <span className="spinner-sm" /> : '+ Add Channel'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
