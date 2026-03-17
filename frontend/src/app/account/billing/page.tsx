'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api/client';

// ============================================================================
// Types
// ============================================================================

interface BillingStatus {
  has_payment_method: boolean;
  stripe_configured: boolean;
  trial_emails_used: number;
  trial_emails_remaining: number;
  trial_emails_total: number;
  current_month_cost: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  monthly_spend_cap: number | null;
}

interface DetailedUsage {
  period: string;
  total_billed: number;
  total_raw: number;
  total_events: number;
  spend_cap: number | null;
  spend_cap_pct: number | null;
  by_model: Array<{
    model: string;
    input_tokens: number;
    output_tokens: number;
    raw_cost: number;
    billed_cost: number;
    events: number;
  }>;
  by_event_type: Array<{
    type: string;
    count: number;
    billed_cost: number;
  }>;
  by_day: Array<{
    date: string;
    billed_cost: number;
    events: number;
  }>;
  by_watcher: Array<{
    watcher_id: string;
    watcher_name: string;
    billed_cost: number;
    events: number;
  }>;
}

// ============================================================================
// Helpers
// ============================================================================

function formatUsd(value: number): string {
  if (value < 0.01) return `$${value.toFixed(6)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    email_triage: 'Email Triage',
    pre_screen: 'Pre-Screen Gate',
    tick: 'Scheduled Tick',
    chat: 'Chat',
    digest: 'Digest',
    alert_delivery: 'Alert Delivery',
  };
  return labels[type] ?? type;
}

function modelTier(model: string): string {
  if (model.includes('nano')) return 'Nano';
  if (model.includes('mini') || model.includes('flash') || model.includes('haiku')) return 'Mini';
  if (model.includes('pro') || model.includes('sonnet')) return 'Pro';
  return 'Standard';
}

// ============================================================================
// Components
// ============================================================================

function SpendCapEditor({
  currentCap,
  onSave,
}: {
  currentCap: number | null;
  onSave: (cap: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentCap !== null ? String(currentCap) : '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const cap = value === '' ? null : parseFloat(value);
    try {
      const res = await api.updateSpendCap(cap);
      onSave(res.monthly_spend_cap);
      setEditing(false);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700">
          {currentCap !== null ? `${formatUsd(currentCap)}/mo` : 'No limit'}
        </span>
        <button
          onClick={() => { setValue(currentCap !== null ? String(currentCap) : ''); setEditing(true); }}
          className="text-xs text-teal-600 hover:text-teal-700 font-medium"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">$</span>
      <input
        type="number"
        step="0.50"
        min="0"
        placeholder="No limit"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
        autoFocus
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="text-xs font-medium text-teal-600 hover:text-teal-700"
      >
        {saving ? '...' : 'Save'}
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-xs text-gray-400 hover:text-gray-500"
      >
        Cancel
      </button>
    </div>
  );
}

function CostBar({ value, max, color = 'bg-teal-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DailyChart({ days, spendCap }: { days: DetailedUsage['by_day']; spendCap: number | null }) {
  if (days.length === 0) return <p className="text-sm text-gray-400 italic">No usage data yet.</p>;

  const maxCost = Math.max(...days.map((d) => d.billed_cost), 0.001);
  const dailyCap = spendCap !== null ? spendCap / 30 : null;

  return (
    <div className="flex items-end gap-px h-32">
      {days.slice(0, 30).reverse().map((day) => {
        const heightPct = Math.max(2, (day.billed_cost / maxCost) * 100);
        const isOverDailyCap = dailyCap !== null && day.billed_cost > dailyCap;
        return (
          <div
            key={day.date}
            className="flex-1 group relative"
            style={{ minWidth: '4px' }}
          >
            <div
              className={`w-full rounded-t transition-colors ${
                isOverDailyCap ? 'bg-amber-400' : 'bg-teal-400 group-hover:bg-teal-500'
              }`}
              style={{ height: `${heightPct}%` }}
            />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
              <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                {day.date}: {formatUsd(day.billed_cost)} ({day.events} events)
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [detailed, setDetailed] = useState<DetailedUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<'setup' | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [billingRes, detailedRes] = await Promise.all([
        api.getBilling(),
        api.getDetailedUsage(0),
      ]);
      setBilling(billingRes.billing);
      setDetailed(detailedRes);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') === 'success') {
      setSuccessMsg('Payment method added successfully. Billing is now active.');
      window.history.replaceState({}, '', '/account/billing');
    } else if (params.get('setup') === 'canceled') {
      setError('Billing setup was canceled.');
      window.history.replaceState({}, '', '/account/billing');
    }
    loadData();
  }, [loadData]);

  async function handleSetup() {
    setActionLoading('setup');
    setError(null);
    try {
      const res = await api.setupBilling();
      window.location.href = res.checkout_url;
    } catch (err: any) {
      setError(err.message ?? 'Failed to start billing setup');
      setActionLoading(null);
    }
  }

  async function handlePortal() {
    setActionLoading('portal');
    setError(null);
    try {
      const res = await api.getBillingPortal();
      window.location.href = res.portal_url;
    } catch (err: any) {
      setError(err.message ?? 'Failed to open billing portal');
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <main>
        <h2 className="text-xl sm:text-2xl font-display font-semibold text-gray-900 mb-4">Billing & Usage</h2>
        <div className="panel p-8 text-center">
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </main>
    );
  }

  const trialPct = billing
    ? Math.min(100, Math.round((billing.trial_emails_used / billing.trial_emails_total) * 100))
    : 0;

  const capPct = detailed?.spend_cap_pct ?? 0;
  const capColor = capPct >= 90 ? 'bg-red-500' : capPct >= 70 ? 'bg-amber-400' : 'bg-teal-500';

  return (
    <main className="space-y-6">
      <h2 className="text-xl sm:text-2xl font-display font-semibold text-gray-900">Billing & Usage</h2>

      {successMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ================================================================ */}
      {/* Billing Status + Spend Cap */}
      {/* ================================================================ */}
      <div className="panel divide-y divide-gray-100">
        <div className="p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Payment method</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {billing?.has_payment_method
                ? 'Active — usage billed monthly'
                : `Free trial — ${billing?.trial_emails_remaining ?? 0} of ${billing?.trial_emails_total ?? 50} emails remaining`}
            </p>
          </div>
          <span
            className={`badge ${
              billing?.has_payment_method
                ? 'badge-ok'
                : trialPct >= 100
                ? 'badge-critical'
                : 'badge-warning'
            }`}
          >
            <span
              className={`status-indicator mr-1 ${
                billing?.has_payment_method
                  ? 'status-indicator-ok'
                  : trialPct >= 100
                  ? 'status-indicator-critical'
                  : 'status-indicator-warning'
              }`}
            />
            {billing?.has_payment_method ? 'Active' : trialPct >= 100 ? 'Trial ended' : 'Free trial'}
          </span>
        </div>

        {billing && !billing.has_payment_method && (
          <div className="px-5 py-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>{billing.trial_emails_used} emails used</span>
              <span>{billing.trial_emails_total} email trial</span>
            </div>
            <CostBar value={billing.trial_emails_used} max={billing.trial_emails_total} />
          </div>
        )}

        {/* Spend Cap */}
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Monthly spend cap</p>
            <p className="text-xs text-gray-400 mt-0.5">Processing pauses when cap is reached</p>
          </div>
          <SpendCapEditor
            currentCap={billing?.monthly_spend_cap ?? null}
            onSave={(cap) => {
              setBilling((b) => b ? { ...b, monthly_spend_cap: cap } : b);
              loadData();
            }}
          />
        </div>

        {detailed?.spend_cap !== null && detailed?.spend_cap_pct !== null && (
          <div className="px-5 py-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>{formatUsd(detailed.total_billed)} used</span>
              <span>{formatUsd(detailed.spend_cap!)} cap</span>
            </div>
            <CostBar value={detailed.total_billed} max={detailed.spend_cap!} color={capColor} />
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-4 flex flex-wrap gap-3">
          {!billing?.has_payment_method && billing?.stripe_configured && (
            <button onClick={handleSetup} disabled={actionLoading === 'setup'} className="btn btn-primary btn-sm">
              {actionLoading === 'setup' ? 'Redirecting...' : 'Add payment method'}
            </button>
          )}
          {billing?.has_payment_method && billing.stripe_configured && (
            <button onClick={handlePortal} disabled={actionLoading === 'portal'} className="btn btn-secondary btn-sm">
              {actionLoading === 'portal' ? 'Redirecting...' : 'Manage billing'}
            </button>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* This Month Summary */}
      {/* ================================================================ */}
      <div className="panel p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          {detailed?.period ?? 'This month'}
        </p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-display font-bold text-gray-900">
            {formatUsd(detailed?.total_billed ?? 0)}
          </span>
          <span className="text-sm text-gray-400">billed</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {detailed?.total_events ?? 0} events ·{' '}
          {formatUsd(detailed?.total_raw ?? 0)} raw LLM cost ·{' '}
          5% margin applied
        </p>
      </div>

      {/* ================================================================ */}
      {/* Daily Cost Trend */}
      {/* ================================================================ */}
      {detailed && detailed.by_day.length > 0 && (
        <div className="panel p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Daily cost</p>
          <DailyChart days={detailed.by_day} spendCap={detailed.spend_cap} />
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>{detailed.by_day[detailed.by_day.length - 1]?.date}</span>
            <span>{detailed.by_day[0]?.date}</span>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Cost by Model */}
      {/* ================================================================ */}
      {detailed && detailed.by_model.length > 0 && (
        <div className="panel">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Usage by model</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-50">
                  <th className="px-5 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Tier</th>
                  <th className="px-3 py-2 font-medium text-right">Events</th>
                  <th className="px-3 py-2 font-medium text-right">Input</th>
                  <th className="px-3 py-2 font-medium text-right">Output</th>
                  <th className="px-3 py-2 font-medium text-right">Raw</th>
                  <th className="px-5 py-2 font-medium text-right">Billed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {detailed.by_model.map((m) => (
                  <tr key={m.model}>
                    <td className="px-5 py-2.5 font-mono text-gray-900">{m.model}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                        modelTier(m.model) === 'Nano' ? 'bg-gray-100 text-gray-600'
                          : modelTier(m.model) === 'Mini' ? 'bg-blue-50 text-blue-600'
                          : modelTier(m.model) === 'Pro' ? 'bg-purple-50 text-purple-600'
                          : 'bg-teal-50 text-teal-600'
                      }`}>
                        {modelTier(m.model)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{m.events}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">{formatTokens(m.input_tokens)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">{formatTokens(m.output_tokens)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-400">{formatUsd(m.raw_cost)}</td>
                    <td className="px-5 py-2.5 text-right font-mono font-medium text-gray-900">{formatUsd(m.billed_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Cost by Event Type */}
      {/* ================================================================ */}
      {detailed && detailed.by_event_type.length > 0 && (
        <div className="panel">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Usage by event type</p>
          </div>
          <div className="divide-y divide-gray-50">
            {detailed.by_event_type.map((e) => {
              const pct = detailed.total_billed > 0
                ? (e.billed_cost / detailed.total_billed) * 100
                : 0;
              return (
                <div key={e.type} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{eventTypeLabel(e.type)}</span>
                      <span className="text-xs text-gray-400">{e.count} events</span>
                    </div>
                    <span className="text-sm font-mono text-gray-700">{formatUsd(e.billed_cost)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-400 rounded-full"
                      style={{ width: `${Math.max(1, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Per-Watcher Breakdown */}
      {/* ================================================================ */}
      {detailed && detailed.by_watcher.length > 0 && (
        <div className="panel">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Usage by watcher</p>
          </div>
          <div className="divide-y divide-gray-50">
            {detailed.by_watcher.map((w) => (
              <div key={w.watcher_id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{w.watcher_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{w.events} events</p>
                </div>
                <span className="text-sm font-mono text-gray-700 flex-shrink-0">
                  {formatUsd(w.billed_cost)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Pricing note */}
      {/* ================================================================ */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
        <p className="text-xs text-gray-500 max-w-none">
          <span className="font-medium text-gray-700">Pay-per-use, no tiers.</span>{' '}
          Actual AI token cost + 5% margin on all usage. 50 free emails to start. Billed monthly through Stripe.
          Bring your own API key for free LLM usage.
          {!billing?.has_payment_method && ` ${billing?.trial_emails_remaining ?? 50} free emails remaining.`}
        </p>
      </div>
    </main>
  );
}
