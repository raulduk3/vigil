'use client';

import { useState, useEffect } from 'react';
import { api, type Watcher, type Channel, type CustomTool } from '@/lib/api/client';
import { ReactivitySlider } from './reactivity-slider';
import { Term } from '@/components/ui/term';
import { DEFAULT_MODEL_ID, MODEL_OPTIONS, normalizeModelId } from '@/lib/models';

type Tab = 'watcher' | 'agent' | 'prompt' | 'channels' | 'tools';

interface SettingsModalProps {
  watcher: Watcher;
  onClose: () => void;
  onUpdate: (watcher: Watcher) => void;
  onDelete: (watcherId: string) => void;
}

const TOOLS = [
  { id: 'send_alert', label: 'Send Alert', description: 'Sends you an email when something needs attention. Controlled by reactivity level.' },
  { id: 'update_thread', label: 'Update Thread', description: 'Tracks conversations with status: active, watching, resolved, or ignored.' },
  { id: 'ignore_thread', label: 'Ignore Thread', description: 'Marks irrelevant threads as noise — they stop being monitored.' },
  { id: 'webhook', label: 'Webhook', description: 'Sends structured data to any URL you configure.' },
];

const MEMORY_SENSITIVITY_LEVELS = [
  { value: 1, label: 'Minimal', description: 'Only deadlines and money' },
  { value: 2, label: 'Low', description: 'Concrete facts only' },
  { value: 3, label: 'Balanced', description: 'Key facts and context' },
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
          <p className="text-xs text-gray-500 mt-0.5">How much the agent stores across emails</p>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-gray-900 tabular-nums">{value}/5</span>
          <p className="text-xs text-gray-500">{current.label}</p>
        </div>
      </div>
      <div className="relative mb-3">
        <input
          type="range" min={1} max={5} step={1} value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
          style={{ background: `linear-gradient(to right, #93c5fd 0%, #3b82f6 50%, #1d4ed8 100%)` }}
        />
        <div className="flex justify-between mt-1.5">
          {MEMORY_SENSITIVITY_LEVELS.map((level) => (
            <button key={level.value} type="button" onClick={() => onChange(level.value)}
              className={`w-6 h-6 rounded-full text-xs font-semibold transition-all ${
                value === level.value
                  ? 'bg-blue-500 text-white shadow-raised-sm'
                  : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              }`}
            >{level.value}</button>
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
  const [tab, setTab] = useState<Tab>('watcher');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Watcher state
  const [name, setName] = useState(watcher.name);
  const [silenceHours, setSilenceHours] = useState(watcher.silence_hours);
  const [tickInterval, setTickInterval] = useState(watcher.tick_interval);

  // Agent state
  const [reactivity, setReactivity] = useState(watcher.reactivity ?? 3);
  const [memorySensitivity, setMemorySensitivity] = useState((watcher as any).memory_sensitivity ?? 3);
  const [model, setModel] = useState(normalizeModelId((watcher as any).model ?? DEFAULT_MODEL_ID));
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

  // Custom tools state
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [showToolForm, setShowToolForm] = useState(false);
  const [editingTool, setEditingTool] = useState<CustomTool | null>(null);
  const [toolForm, setToolForm] = useState({
    name: '', description: '', webhook_url: '',
    headers: [] as { key: string; value: string }[],
    params: [] as { key: string; description: string }[],
  });
  const [savingTool, setSavingTool] = useState(false);
  const [testingToolId, setTestingToolId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; status?: number; error?: string }>>({});

  useEffect(() => {
    if (tab === 'channels') {
      setLoadingChannels(true);
      api.getChannels(watcher.id)
        .then((res) => setChannels(res.channels || []))
        .catch(() => setChannels([]))
        .finally(() => setLoadingChannels(false));
    }
    if (tab === 'tools') {
      setLoadingTools(true);
      api.getCustomTools(watcher.id)
        .then((res) => setCustomTools(res.tools || []))
        .catch(() => setCustomTools([]))
        .finally(() => setLoadingTools(false));
    }
  }, [tab, watcher.id]);

  const showSavedFlash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateWatcher(watcher.id, {
        name, reactivity,
        memory_sensitivity: memorySensitivity,
        model: normalizeModelId(model),
        silence_hours: silenceHours,
        tick_interval: tickInterval,
        tools,
        system_prompt: systemPrompt,
      } as any);
      onUpdate(res.watcher);
      showSavedFlash();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTool = (toolId: string) => {
    setTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  const handleAddChannel = async () => {
    if (!newChannelDest.trim()) return;
    setAddingChannel(true);
    try {
      const res = await api.createChannel(watcher.id, { type: newChannelType, destination: newChannelDest.trim() });
      setChannels((prev) => [...prev, res.channel]);
      setNewChannelDest('');
    } catch { /* ignore */ } finally {
      setAddingChannel(false);
    }
  };

  const handleToggleChannel = async (channel: Channel) => {
    try {
      const res = await api.updateChannel(watcher.id, channel.id, { enabled: !channel.enabled });
      setChannels((prev) => prev.map((c) => (c.id === channel.id ? res.channel : c)));
    } catch { /* ignore */ }
  };

  const handleDeleteChannel = async (channelId: string) => {
    try {
      await api.deleteChannel(watcher.id, channelId);
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
    } catch { /* ignore */ }
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

  const openToolForm = (tool?: CustomTool) => {
    if (tool) {
      setEditingTool(tool);
      setToolForm({
        name: tool.name, description: tool.description, webhook_url: tool.webhook_url,
        headers: Object.entries(tool.headers || {}).map(([key, value]) => ({ key, value })),
        params: Object.entries(tool.parameter_schema || {}).map(([key, v]) => ({ key, description: v.description || '' })),
      });
    } else {
      setEditingTool(null);
      setToolForm({ name: '', description: '', webhook_url: '', headers: [], params: [] });
    }
    setShowToolForm(true);
  };

  const handleSaveTool = async () => {
    if (!toolForm.name.trim() || !toolForm.description.trim() || !toolForm.webhook_url.trim()) return;
    setSavingTool(true);
    try {
      const headersObj = Object.fromEntries(toolForm.headers.filter(h => h.key).map(h => [h.key, h.value]));
      const paramSchema = Object.fromEntries(toolForm.params.filter(p => p.key).map(p => [p.key, { type: 'string', description: p.description }]));
      const data = { name: toolForm.name.trim(), description: toolForm.description.trim(), webhook_url: toolForm.webhook_url.trim(), headers: headersObj, parameter_schema: paramSchema };
      if (editingTool) {
        const res = await api.updateCustomTool(watcher.id, editingTool.id, data);
        setCustomTools(prev => prev.map(t => t.id === editingTool.id ? res.tool : t));
      } else {
        const res = await api.createCustomTool(watcher.id, data);
        setCustomTools(prev => [...prev, res.tool]);
      }
      setShowToolForm(false);
    } catch { /* ignore */ } finally {
      setSavingTool(false);
    }
  };

  const handleDeleteTool = async (toolId: string) => {
    try { await api.deleteCustomTool(watcher.id, toolId); setCustomTools(prev => prev.filter(t => t.id !== toolId)); } catch { /* ignore */ }
  };

  const handleToggleCustomTool = async (tool: CustomTool) => {
    try {
      const res = await api.updateCustomTool(watcher.id, tool.id, { enabled: !tool.enabled });
      setCustomTools(prev => prev.map(t => t.id === tool.id ? res.tool : t));
    } catch { /* ignore */ }
  };

  const handleTestTool = async (toolId: string) => {
    setTestingToolId(toolId);
    try { const res = await api.testCustomTool(watcher.id, toolId); setTestResults(prev => ({ ...prev, [toolId]: res })); }
    catch { /* ignore */ } finally { setTestingToolId(null); }
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: 'watcher', label: 'Watcher' },
    { value: 'agent', label: 'Agent' },
    { value: 'prompt', label: 'Prompt' },
    { value: 'channels', label: 'Channels' },
    { value: 'tools', label: 'Tools' },
  ];

  const selectedModel = MODEL_OPTIONS.find(m => m.id === model);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-surface-raised rounded-lg shadow-panel-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{watcher.name}</h2>
            <p className="text-xs text-gray-400 font-mono">{watcher.ingestion_address}</p>
          </div>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-green-600 font-medium animate-pulse">Saved ✓</span>}
            <button onClick={onClose}
              className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-5 gap-1">
          {tabs.map((t) => (
            <button key={t.value} onClick={() => setTab(t.value)}
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
          {error && <div className="notice notice-error mb-4 text-sm">{error}</div>}

          {/* ========== WATCHER TAB ========== */}
          {tab === 'watcher' && (
            <div className="space-y-5">
              <div className="panel-inset p-3 text-xs text-gray-600">
                Configure how this watcher monitors your inbox. These settings control timing and thresholds.
              </div>

              <div className="form-group">
                <label className="form-label text-sm">Watcher Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input py-2" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label text-sm"><Term>Silence Threshold</Term></label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} max={720} value={silenceHours}
                      onChange={(e) => setSilenceHours(Math.max(1, parseInt(e.target.value) || 1))}
                      className="input py-2 w-20 text-center" />
                    <span className="text-sm text-gray-500">hours</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">How long before a quiet thread gets flagged</p>
                </div>
                <div className="form-group">
                  <label className="form-label text-sm"><Term>Tick Interval</Term></label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={60} max={1440} value={tickInterval}
                      onChange={(e) => setTickInterval(Math.max(60, parseInt(e.target.value) || 60))}
                      className="input py-2 w-20 text-center" />
                    <span className="text-sm text-gray-500">minutes</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">How often the agent checks for overdue threads (min 60)</p>
                </div>
              </div>

              <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm w-full">
                {saving ? <span className="spinner-sm" /> : 'Save Watcher Settings'}
              </button>

              {/* Danger zone */}
              <div className="border border-red-200 rounded-md p-4 space-y-3 mt-4">
                <h4 className="text-sm font-medium text-red-700">Danger Zone</h4>
                {!showDelete ? (
                  <button onClick={() => setShowDelete(true)} className="btn btn-danger-subtle btn-sm">Delete Watcher</button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600">
                      Type <strong>{watcher.name}</strong> to confirm. This permanently deletes all threads, emails, actions, memories, and channels.
                    </p>
                    <input type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={watcher.name} className="input py-1.5 text-sm" />
                    <div className="flex gap-2">
                      <button onClick={handleDelete} disabled={deleteConfirm !== watcher.name || deleting}
                        className="btn btn-danger btn-sm disabled:opacity-50">
                        {deleting ? <span className="spinner-sm" /> : 'Delete Permanently'}
                      </button>
                      <button onClick={() => setShowDelete(false)} className="btn btn-secondary btn-sm">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========== AGENT TAB ========== */}
          {tab === 'agent' && (
            <div className="space-y-5">
              <div className="panel-inset p-3 text-xs text-gray-600">
                Control how the agent thinks: which model it uses, how aggressively it alerts, and how much it remembers.
              </div>

              {/* Model Selection */}
              <div className="form-group">
                <label className="form-label text-sm">Model</label>
                <div className="space-y-1.5">
                  {MODEL_OPTIONS.map((option) => (
                    <label key={option.id}
                      className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all ${
                        model === option.id
                          ? 'border-vigil-900 bg-vigil-900/5 ring-1 ring-vigil-900/20'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input type="radio" name="model" value={option.id} checked={model === option.id}
                        onChange={() => setModel(option.id)} className="sr-only" />
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        model === option.id ? 'border-vigil-900' : 'border-gray-300'
                      }`}>
                        {model === option.id && <div className="w-1.5 h-1.5 rounded-full bg-vigil-900" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{option.label}</span>
                          {option.badge && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700">{option.badge}</span>
                          )}
                          <span className="text-xs text-gray-400 ml-auto">{option.costPerEmail}/email</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{option.quality}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <ReactivitySlider value={reactivity} onChange={setReactivity} variant="full" />

              <MemorySensitivitySlider value={memorySensitivity} onChange={setMemorySensitivity} />

              <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm w-full">
                {saving ? <span className="spinner-sm" /> : 'Save Agent Settings'}
              </button>
            </div>
          )}

          {/* ========== PROMPT TAB ========== */}
          {tab === 'prompt' && (
            <div className="space-y-3">
              <div className="panel-inset p-3 text-xs text-gray-600 leading-relaxed space-y-1.5">
                <p><strong>Tell your agent what to care about.</strong> You don&apos;t need to mention tools. The agent automatically uses Send Alert, Update Thread, and other enabled tools based on your description.</p>
                <p>Example: &quot;Monitor client emails. Alert me when deadlines approach or someone is waiting for a response.&quot;</p>
              </div>
              <div className="form-group">
                <label className="form-label text-sm">System Prompt</label>
                <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={16} className="input py-2 resize-none font-mono text-xs leading-relaxed" />
              </div>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm w-full">
                {saving ? <span className="spinner-sm" /> : 'Save Prompt'}
              </button>
            </div>
          )}

          {/* ========== CHANNELS TAB ========== */}
          {tab === 'channels' && (
            <div className="space-y-4">
              <div className="panel-inset p-3 text-xs text-gray-600 leading-relaxed space-y-2">
                <p><strong>Channels are where alerts get delivered.</strong> Alerts always go to your account email. Add channels for additional delivery.</p>
                <p><strong>Webhook channels</strong> receive a JSON POST with alert data (event, subject, body, urgency, thread info).</p>
              </div>

              {loadingChannels ? (
                <div className="flex items-center gap-2 text-sm text-gray-400"><span className="spinner-sm" /> Loading...</div>
              ) : (
                <>
                  {channels.length === 0 && <p className="text-sm text-gray-400">No additional channels configured.</p>}
                  {channels.map((channel) => (
                    <div key={channel.id} className="flex items-center gap-3 panel px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-500 uppercase">{channel.type}</div>
                        <div className="text-sm text-gray-700 font-mono truncate">{channel.destination}</div>
                      </div>
                      <button onClick={() => handleToggleChannel(channel)}
                        className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                          channel.enabled ? 'text-status-ok bg-status-ok/10 hover:bg-status-ok/20' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                        }`}>{channel.enabled ? 'On' : 'Off'}</button>
                      <button onClick={() => handleDeleteChannel(channel.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  <div className="border-t border-gray-200 pt-4 space-y-2">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Add Channel</div>
                    <div className="flex gap-2">
                      <select value={newChannelType} onChange={(e) => setNewChannelType(e.target.value as 'email' | 'webhook')}
                        className="input py-1.5 text-sm w-28 shrink-0">
                        <option value="email">Email</option>
                        <option value="webhook">Webhook</option>
                      </select>
                      <input type="text" value={newChannelDest} onChange={(e) => setNewChannelDest(e.target.value)}
                        placeholder={newChannelType === 'email' ? 'you@example.com' : 'https://...'}
                        className="input py-1.5 text-sm flex-1" />
                    </div>
                    <button onClick={handleAddChannel} disabled={addingChannel || !newChannelDest.trim()}
                      className="btn btn-secondary btn-sm">
                      {addingChannel ? <span className="spinner-sm" /> : '+ Add Channel'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ========== TOOLS TAB ========== */}
          {tab === 'tools' && (
            <div className="space-y-5">
              {/* Built-in Tools */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Built-in Tools</h4>
                <div className="space-y-2">
                  {TOOLS.map((tool) => (
                    <label key={tool.id} className="flex items-center gap-3 cursor-pointer group">
                      <input type="checkbox" checked={tools.includes(tool.id)} onChange={() => handleToggleTool(tool.id)}
                        className="w-4 h-4 accent-vigil-900" />
                      <div>
                        <div className="text-sm font-medium text-gray-700">{tool.label}</div>
                        <div className="text-xs text-gray-400">{tool.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <button onClick={handleSave} disabled={saving} className="btn btn-secondary btn-sm mt-3">
                  {saving ? <span className="spinner-sm" /> : 'Save Tools'}
                </button>
              </div>

              {/* Custom Tools */}
              <div className="border-t border-gray-200 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Custom Tools</h4>
                  <button onClick={() => openToolForm()} className="btn btn-secondary btn-sm">+ Add Tool</button>
                </div>

                {loadingTools ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400"><span className="spinner-sm" /> Loading...</div>
                ) : (
                  <>
                    {customTools.length === 0 && !showToolForm && (
                      <p className="text-sm text-gray-400">No custom tools. Custom tools let the agent call external webhooks based on email content.</p>
                    )}
                    {customTools.map((tool) => (
                      <div key={tool.id} className="panel px-3 py-2.5 mb-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-700 font-mono">{tool.name}</div>
                            <div className="text-xs text-gray-400 truncate">{tool.webhook_url}</div>
                          </div>
                          <span className="text-xs text-gray-400 tabular-nums">{tool.execution_count} runs</span>
                          <button onClick={() => handleToggleCustomTool(tool)}
                            className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                              tool.enabled ? 'text-status-ok bg-status-ok/10 hover:bg-status-ok/20' : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
                            }`}>{tool.enabled ? 'On' : 'Off'}</button>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => openToolForm(tool)} className="text-xs text-gray-500 hover:text-gray-700">Edit</button>
                          <button onClick={() => handleTestTool(tool.id)} disabled={testingToolId === tool.id}
                            className="text-xs text-blue-500 hover:text-blue-700">
                            {testingToolId === tool.id ? 'Testing...' : 'Test'}
                          </button>
                          <button onClick={() => handleDeleteTool(tool.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                          {testResults[tool.id] && (
                            <span className={`text-xs font-medium ${testResults[tool.id].success ? 'text-green-600' : 'text-red-600'}`}>
                              {testResults[tool.id].success ? `OK (${testResults[tool.id].status})` : `Failed${testResults[tool.id].error ? `: ${testResults[tool.id].error}` : ''}`}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                    {showToolForm && (
                      <div className="panel p-4 space-y-3 mt-3">
                        <h4 className="text-sm font-semibold text-gray-700">{editingTool ? 'Edit Tool' : 'New Custom Tool'}</h4>
                        <div className="form-group">
                          <label className="form-label text-xs">Name (snake_case)</label>
                          <input type="text" value={toolForm.name} onChange={(e) => setToolForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="notify_slack" className="input py-1.5 text-sm font-mono" />
                        </div>
                        <div className="form-group">
                          <label className="form-label text-xs">Description (tells the agent when to use this)</label>
                          <textarea value={toolForm.description} onChange={(e) => setToolForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Send a message to Slack when something needs attention" rows={2}
                            className="input py-1.5 text-sm resize-none" />
                        </div>
                        <div className="form-group">
                          <label className="form-label text-xs">Webhook URL</label>
                          <input type="url" value={toolForm.webhook_url} onChange={(e) => setToolForm(f => ({ ...f, webhook_url: e.target.value }))}
                            placeholder="https://hooks.slack.com/services/..." className="input py-1.5 text-sm" />
                        </div>
                        <div className="form-group">
                          <div className="flex items-center justify-between">
                            <label className="form-label text-xs mb-0">Headers (optional)</label>
                            <button type="button" onClick={() => setToolForm(f => ({ ...f, headers: [...f.headers, { key: '', value: '' }] }))}
                              className="text-xs text-blue-500 hover:text-blue-700">+ Add</button>
                          </div>
                          {toolForm.headers.map((h, i) => (
                            <div key={i} className="flex gap-2 mt-1">
                              <input type="text" value={h.key} onChange={(e) => {
                                const headers = [...toolForm.headers]; headers[i] = { ...h, key: e.target.value };
                                setToolForm(f => ({ ...f, headers }));
                              }} placeholder="Header" className="input py-1 text-xs flex-1" />
                              <input type="text" value={h.value} onChange={(e) => {
                                const headers = [...toolForm.headers]; headers[i] = { ...h, value: e.target.value };
                                setToolForm(f => ({ ...f, headers }));
                              }} placeholder="Value" className="input py-1 text-xs flex-1" />
                              <button type="button" onClick={() => setToolForm(f => ({ ...f, headers: f.headers.filter((_, j) => j !== i) }))}
                                className="text-gray-400 hover:text-red-500 p-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="form-group">
                          <div className="flex items-center justify-between">
                            <label className="form-label text-xs mb-0">Parameters (optional)</label>
                            <button type="button" onClick={() => setToolForm(f => ({ ...f, params: [...f.params, { key: '', description: '' }] }))}
                              className="text-xs text-blue-500 hover:text-blue-700">+ Add</button>
                          </div>
                          {toolForm.params.map((p, i) => (
                            <div key={i} className="flex gap-2 mt-1">
                              <input type="text" value={p.key} onChange={(e) => {
                                const params = [...toolForm.params]; params[i] = { ...p, key: e.target.value };
                                setToolForm(f => ({ ...f, params }));
                              }} placeholder="Param name" className="input py-1 text-xs w-32" />
                              <input type="text" value={p.description} onChange={(e) => {
                                const params = [...toolForm.params]; params[i] = { ...p, description: e.target.value };
                                setToolForm(f => ({ ...f, params }));
                              }} placeholder="What should the agent extract?" className="input py-1 text-xs flex-1" />
                              <button type="button" onClick={() => setToolForm(f => ({ ...f, params: f.params.filter((_, j) => j !== i) }))}
                                className="text-gray-400 hover:text-red-500 p-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleSaveTool}
                            disabled={savingTool || !toolForm.name.trim() || !toolForm.description.trim() || !toolForm.webhook_url.trim()}
                            className="btn btn-primary btn-sm">
                            {savingTool ? <span className="spinner-sm" /> : editingTool ? 'Update Tool' : 'Create Tool'}
                          </button>
                          <button onClick={() => setShowToolForm(false)} className="btn btn-secondary btn-sm">Cancel</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
