'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, type Watcher } from '@/lib/api/client';

// ============================================================================
// Types
// ============================================================================

interface ConfigField {
  name: string;
  label: string;
  type: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
}

interface SkillCatalogEntry {
  provider: string;
  name: string;
  description: string;
  configSchema: { fields: ConfigField[] } | Record<string, any>;
}

interface Skill {
  id: string;
  watcher_id: string;
  provider: string;
  name: string;
  config: Record<string, string>;
  enabled: boolean;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
}

interface SkillsPanelProps {
  watcher: Watcher | null;
  onClose: () => void;
}

// ============================================================================
// Provider icons (emoji fallbacks, clean and lightweight)
// ============================================================================

const PROVIDER_ICONS: Record<string, string> = {
  twilio_sms: 'SMS',
  twilio: 'SMS',
  slack: 'SLK',
  discord: 'DSC',
  telegram: 'TG',
  email_forward: 'FWD',
  notion: 'NTN',
  linear: 'LNR',
  jira: 'JIRA',
  github: 'GH',
  airtable: 'AT',
  google_sheets: 'GS',
  pagerduty: 'PD',
  http_webhook: 'HTTP',
  http: 'HTTP',
};

const PROVIDER_ACCENT: Record<string, string> = {
  twilio_sms: 'border-red-200 bg-red-50',
  twilio: 'border-red-200 bg-red-50',
  slack: 'border-purple-200 bg-purple-50',
  discord: 'border-indigo-200 bg-indigo-50',
  telegram: 'border-sky-200 bg-sky-50',
  email_forward: 'border-amber-200 bg-amber-50',
  notion: 'border-gray-200 bg-gray-50',
  linear: 'border-violet-200 bg-violet-50',
  jira: 'border-blue-200 bg-blue-50',
  github: 'border-gray-300 bg-gray-50',
  airtable: 'border-teal-200 bg-teal-50',
  google_sheets: 'border-green-200 bg-green-50',
  pagerduty: 'border-green-200 bg-green-50',
  http_webhook: 'border-blue-200 bg-blue-50',
  http: 'border-blue-200 bg-blue-50',
};

// ============================================================================
// Skill card component
// ============================================================================

function SkillCard({
  skill,
  onToggle,
  onTest,
  onEdit,
  onDelete,
  testingId,
  testResults,
}: {
  skill: Skill;
  onToggle: (skill: Skill) => void;
  onTest: (skillId: string) => void;
  onEdit: (skill: Skill) => void;
  onDelete: (skillId: string) => void;
  testingId: string | null;
  testResults: Record<string, { success: boolean; error?: string; status?: number }>;
}) {
  const icon = PROVIDER_ICONS[skill.provider] ?? 'CFG';
  const result = testResults[skill.id];

  return (
    <div className="panel px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${skill.enabled ? 'bg-status-ok' : 'bg-gray-300'}`} />

        {/* Icon + name */}
        <span className="text-lg leading-none">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 truncate">{skill.name}</span>
            <span className="text-xs text-gray-400 font-mono capitalize">
              {skill.provider.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {skill.execution_count} run{skill.execution_count !== 1 ? 's' : ''}
            {skill.last_executed_at && (
              <span className="ml-2">
                · last {new Date(skill.last_executed_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => onToggle(skill)}
          className={`text-xs px-2 py-1 rounded font-medium transition-colors shrink-0 ${
            skill.enabled
              ? 'text-status-ok bg-status-ok/10 hover:bg-status-ok/20'
              : 'text-gray-400 bg-gray-100 hover:bg-gray-200'
          }`}
        >
          {skill.enabled ? 'On' : 'Off'}
        </button>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-3 pl-5">
        <button
          onClick={() => onTest(skill.id)}
          disabled={testingId === skill.id}
          className="text-xs text-vigil-700 hover:text-vigil-900 font-medium transition-colors"
        >
          {testingId === skill.id ? 'Testing…' : 'Test'}
        </button>
        <button
          onClick={() => onEdit(skill)}
          className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(skill.id)}
          className="text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          Delete
        </button>
        {result && (
          <span className={`text-xs font-medium ml-auto ${result.success ? 'text-status-ok' : 'text-red-500'}`}>
            {result.success
              ? `✓ OK${result.status ? ` (${result.status})` : ''}`
              : `✗ ${result.error ?? 'Failed'}`}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Provider catalog grid
// ============================================================================

function CatalogGrid({
  catalog,
  onSelect,
}: {
  catalog: SkillCatalogEntry[];
  onSelect: (entry: SkillCatalogEntry) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {catalog.map((entry) => {
        const icon = PROVIDER_ICONS[entry.provider] ?? 'CFG';
        const accent = PROVIDER_ACCENT[entry.provider] ?? 'border-gray-200 bg-gray-50';
        const isTwilio = entry.provider === 'twilio_sms';

        return (
          <button
            key={entry.provider}
            onClick={() => onSelect(entry)}
            className={`relative text-left border rounded-lg px-4 py-3 transition-all hover:shadow-raised-sm hover:border-vigil-300 focus:outline-none focus:ring-2 focus:ring-vigil-500 ${accent} ${
              isTwilio ? 'col-span-2 border-red-300 bg-red-50 ring-1 ring-red-200' : ''
            }`}
          >
            {isTwilio && (
              <span className="absolute top-2 right-3 text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                Hero skill
              </span>
            )}
            <div className="text-2xl mb-1.5 leading-none">{icon}</div>
            <div className="font-semibold text-sm text-gray-900">{entry.name}</div>
            <div className="text-xs text-gray-500 mt-0.5 leading-snug">{entry.description}</div>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Config form (dynamic from configSchema)
// ============================================================================

function ConfigForm({
  entry,
  initial,
  onSubmit,
  onCancel,
  saving,
  skillName,
  setSkillName,
}: {
  entry: SkillCatalogEntry;
  initial?: Partial<Record<string, string>>;
  onSubmit: (config: Record<string, string>) => void;
  onCancel: () => void;
  saving: boolean;
  skillName: string;
  setSkillName: (v: string) => void;
}) {
  // Normalize configSchema — API returns { fields: [...] }, fallback handles Record<string, schema>
  const schemaFields: ConfigField[] = (() => {
    const s = entry.configSchema as any;
    if (s?.fields && Array.isArray(s.fields)) return s.fields;
    if (typeof s === 'object') return Object.entries(s).map(([name, v]: [string, any]) => ({ name, ...v }));
    return [];
  })();

  const [config, setConfig] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    schemaFields.forEach((f) => { defaults[f.name] = initial?.[f.name] ?? ''; });
    return defaults;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(config);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{PROVIDER_ICONS[entry.provider] ?? 'CFG'}</span>
        <div>
          <div className="font-semibold text-gray-900">{entry.name}</div>
          <div className="text-xs text-gray-400">{entry.description}</div>
        </div>
      </div>

      {/* Skill name */}
      <div className="form-group">
        <label className="form-label">Skill name</label>
        <input
          type="text"
          value={skillName}
          onChange={(e) => setSkillName(e.target.value)}
          placeholder={`My ${entry.name}`}
          className="input py-2"
          required
        />
        <p className="text-xs text-gray-400 mt-1">A friendly name for this integration.</p>
      </div>

      {/* Dynamic config fields */}
      {schemaFields.map((field) => (
        <div key={field.name} className="form-group">
          <label className="form-label">
            {field.label}
            {field.required !== false && <span className="text-red-400 ml-1">*</span>}
          </label>
          <input
            type={field.type ?? 'text'}
            value={config[field.name] ?? ''}
            onChange={(e) => setConfig((prev) => ({ ...prev, [field.name]: e.target.value }))}
            placeholder={field.placeholder ?? ''}
            className="input py-2"
            required={field.required !== false}
            autoComplete="off"
          />
          {field.description && (
            <p className="text-xs text-gray-400 mt-1">{field.description}</p>
          )}
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !skillName.trim()}
          className="btn btn-primary btn-sm"
        >
          {saving ? <span className="spinner-sm" /> : initial ? 'Update Skill' : 'Connect'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// Fallback catalog (shown if API not yet available)
// ============================================================================

const FALLBACK_CATALOG: SkillCatalogEntry[] = [
  {
    provider: 'twilio_sms',
    name: 'Twilio SMS',
    description: 'Send SMS alerts directly to any phone number via Twilio.',
    configSchema: {
      account_sid: { label: 'Account SID', type: 'text', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', description: 'Your Twilio Account SID from console.twilio.com', required: true },
      auth_token: { label: 'Auth Token', type: 'password', placeholder: '••••••••••••••••••••••••••••••••', description: 'Your Twilio Auth Token', required: true },
      from_number: { label: 'From Number', type: 'tel', placeholder: '+15551234567', description: 'Your Twilio phone number (E.164 format)', required: true },
      to_number: { label: 'To Number', type: 'tel', placeholder: '+15559876543', description: 'Recipient phone number (E.164 format)', required: true },
    },
  },
  {
    provider: 'slack',
    name: 'Slack',
    description: 'Post alerts to a Slack channel via Incoming Webhook.',
    configSchema: {
      webhook_url: { label: 'Webhook URL', type: 'url', placeholder: 'https://hooks.slack.com/services/…', description: 'Slack Incoming Webhook URL from api.slack.com/apps', required: true },
      channel: { label: 'Channel (optional)', type: 'text', placeholder: '#alerts', description: 'Override the default channel. Leave blank to use webhook default.', required: false },
    },
  },
  {
    provider: 'discord',
    name: 'Discord',
    description: 'Send alerts to a Discord channel via webhook.',
    configSchema: {
      webhook_url: { label: 'Webhook URL', type: 'url', placeholder: 'https://discord.com/api/webhooks/…', description: 'Discord channel webhook URL', required: true },
      username: { label: 'Bot username (optional)', type: 'text', placeholder: 'Vigil', description: 'Override the default webhook username.', required: false },
    },
  },
  {
    provider: 'notion',
    name: 'Notion',
    description: 'Create pages in a Notion database when alerts fire.',
    configSchema: {
      api_key: { label: 'Integration Token', type: 'password', placeholder: 'secret_…', description: 'Notion internal integration token from notion.so/my-integrations', required: true },
      database_id: { label: 'Database ID', type: 'text', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', description: 'The ID of the Notion database to write to', required: true },
    },
  },
  {
    provider: 'pagerduty',
    name: 'PagerDuty',
    description: 'Trigger PagerDuty incidents for high-urgency alerts.',
    configSchema: {
      integration_key: { label: 'Integration Key', type: 'password', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', description: 'PagerDuty Events API v2 Integration Key (from a Service)', required: true },
      severity: { label: 'Default Severity', type: 'text', placeholder: 'critical', description: 'One of: critical, error, warning, info', required: false },
    },
  },
  {
    provider: 'http_webhook',
    name: 'HTTP Webhook',
    description: 'POST alert data as JSON to any URL you control.',
    configSchema: {
      url: { label: 'Webhook URL', type: 'url', placeholder: 'https://example.com/webhook', description: 'The endpoint that will receive POST requests', required: true },
      secret: { label: 'Secret (optional)', type: 'password', placeholder: 'your-shared-secret', description: 'Sent as X-Vigil-Secret header for verification', required: false },
    },
  },
];

// ============================================================================
// Main SkillsPanel
// ============================================================================

type FlowStep = 'list' | 'catalog' | 'configure';

export function SkillsPanel({ watcher, onClose }: SkillsPanelProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [catalog, setCatalog] = useState<SkillCatalogEntry[]>(FALLBACK_CATALOG);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<FlowStep>('list');
  const [selectedEntry, setSelectedEntry] = useState<SkillCatalogEntry | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [skillName, setSkillName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string; status?: number }>>({});

  const watcherId = watcher?.id ?? null;

  // Load skills
  const loadSkills = useCallback(async () => {
    if (!watcherId) return;
    setLoading(true);
    try {
      const res = await api.getSkills(watcherId);
      setSkills((res.skills as Skill[]) || []);
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [watcherId]);

  // Load catalog
  useEffect(() => {
    api.getSkillsCatalog()
      .then((res) => {
        if (Array.isArray(res.catalog) && res.catalog.length > 0) {
          setCatalog(res.catalog as SkillCatalogEntry[]);
        }
      })
      .catch(() => {
        // keep fallback
      });
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleSelectProvider = (entry: SkillCatalogEntry) => {
    setSelectedEntry(entry);
    setSkillName(entry.name);
    setEditingSkill(null);
    setError(null);
    setStep('configure');
  };

  const handleEdit = (skill: Skill) => {
    const entry = catalog.find((c) => c.provider === skill.provider);
    if (!entry) return;
    setSelectedEntry(entry);
    setEditingSkill(skill);
    setSkillName(skill.name);
    setError(null);
    setStep('configure');
  };

  const handleConnect = async (config: Record<string, string>) => {
    if (!watcherId || !selectedEntry) return;
    setSaving(true);
    setError(null);
    try {
      if (editingSkill) {
        const res = await api.updateSkill(watcherId, editingSkill.id, {
          name: skillName.trim(),
          config,
        });
        setSkills((prev) => prev.map((s) => (s.id === editingSkill.id ? (res.skill as Skill) : s)));
      } else {
        const res = await api.createSkill(watcherId, {
          provider: selectedEntry.provider,
          name: skillName.trim(),
          config,
        });
        setSkills((prev) => [...prev, res.skill as Skill]);
      }
      setStep('list');
      setSelectedEntry(null);
      setEditingSkill(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save skill');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (skill: Skill) => {
    if (!watcherId) return;
    try {
      const res = await api.updateSkill(watcherId, skill.id, { enabled: !skill.enabled });
      setSkills((prev) => prev.map((s) => (s.id === skill.id ? (res.skill as Skill) : s)));
    } catch { /* ignore */ }
  };

  const handleTest = async (skillId: string) => {
    if (!watcherId) return;
    setTestingId(skillId);
    try {
      const res = await api.testSkill(watcherId, skillId);
      setTestResults((prev) => ({ ...prev, [skillId]: res }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [skillId]: { success: false, error: e instanceof Error ? e.message : 'Error' },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (skillId: string) => {
    if (!watcherId) return;
    try {
      await api.deleteSkill(watcherId, skillId);
      setSkills((prev) => prev.filter((s) => s.id !== skillId));
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[skillId];
        return next;
      });
    } catch { /* ignore */ }
  };

  if (!watcher) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-surface-raised rounded-lg p-8 text-center text-gray-500 text-sm">
          Select a watcher first.
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-surface-raised rounded-lg shadow-panel-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            {step !== 'list' && (
              <button
                onClick={() => {
                  if (step === 'configure') setStep('catalog');
                  else setStep('list');
                  setError(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Back"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {step === 'list' && 'Skills'}
                {step === 'catalog' && 'Choose a Provider'}
                {step === 'configure' && (editingSkill ? `Edit ${editingSkill.name}` : `Connect ${selectedEntry?.name}`)}
              </h2>
              <p className="text-xs text-gray-400">{watcher.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {step === 'list' && (
              <button
                onClick={() => { setStep('catalog'); setError(null); }}
                className="btn btn-primary btn-sm"
              >
                + Add Skill
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="notice notice-error mb-4 text-sm">{error}</div>
          )}

          {/* Skills list */}
          {step === 'list' && (
            <>
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <span className="spinner" />
                </div>
              )}
              {!loading && skills.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-title">No skills connected</div>
                  <div className="empty-state-description">
                    Connect integrations so Vigil can take action — send an SMS, post to Slack, trigger a PagerDuty incident, and more.
                  </div>
                  <button
                    onClick={() => setStep('catalog')}
                    className="btn btn-primary btn-sm mt-4"
                  >
                    + Add your first skill
                  </button>
                </div>
              )}
              {!loading && skills.length > 0 && (
                <div className="space-y-3">
                  {skills.map((skill) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      onToggle={handleToggle}
                      onTest={handleTest}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      testingId={testingId}
                      testResults={testResults}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Provider catalog */}
          {step === 'catalog' && (
            <CatalogGrid catalog={catalog} onSelect={handleSelectProvider} />
          )}

          {/* Config form */}
          {step === 'configure' && selectedEntry && (
            <ConfigForm
              entry={selectedEntry}
              initial={editingSkill?.config}
              onSubmit={handleConnect}
              onCancel={() => setStep('catalog')}
              saving={saving}
              skillName={skillName}
              setSkillName={setSkillName}
            />
          )}
        </div>
      </div>
    </div>
  );
}
