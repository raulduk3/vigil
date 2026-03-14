'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api/client';
import { formatUsd } from '@/lib/pricing';

interface BillingStatus {
  has_payment_method: boolean;
  stripe_configured: boolean;
  trial_emails_used: number;
  trial_emails_remaining: number;
  trial_emails_total: number;
  current_month_cost: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface UsageData {
  total_cost: number;
  total_invocations: number;
  total_alerts: number;
  total_emails: number;
  current_month: { cost: number; invocations: number };
  watchers: Array<{
    watcher_id: string;
    watcher_name: string;
    cost: number;
    invocations: number;
    alerts: number;
    emails: number;
  }>;
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<'setup' | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    // Check for success/canceled query params from Stripe redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') === 'success') {
      setSuccessMsg('Payment method added successfully. Billing is now active.');
      window.history.replaceState({}, '', '/account/billing');
    } else if (params.get('setup') === 'canceled') {
      setError('Billing setup was canceled.');
      window.history.replaceState({}, '', '/account/billing');
    }

    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [billingRes, usageRes] = await Promise.all([
        api.getBilling(),
        api.getUsage(),
      ]);
      setBilling(billingRes.billing);
      setUsage(usageRes.usage);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }

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
        <h2 className="text-xl sm:text-2xl font-display font-semibold text-gray-900 mb-4">Billing</h2>
        <div className="panel p-8 text-center">
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </main>
    );
  }

  const trialPct = billing
    ? Math.min(100, Math.round((billing.trial_emails_used / billing.trial_emails_total) * 100))
    : 0;

  return (
    <main className="space-y-6">
      <h2 className="text-xl sm:text-2xl font-display font-semibold text-gray-900">Billing</h2>

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

      {/* Status card */}
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
          <div className="flex items-center gap-2 flex-shrink-0">
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
        </div>

        {/* Trial progress bar (only shown when no payment method) */}
        {billing && !billing.has_payment_method && (
          <div className="px-5 py-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>{billing.trial_emails_used} emails used</span>
              <span>{billing.trial_emails_total} email trial</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  trialPct >= 80 ? 'bg-status-critical' : trialPct >= 50 ? 'bg-status-warning' : 'bg-status-ok'
                }`}
                style={{ width: `${trialPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-4 flex flex-wrap gap-3">
          {!billing?.has_payment_method && billing?.stripe_configured && (
            <button
              onClick={handleSetup}
              disabled={actionLoading === 'setup'}
              className="btn btn-primary btn-sm"
            >
              {actionLoading === 'setup' ? 'Redirecting...' : 'Add payment method'}
            </button>
          )}
          {billing?.has_payment_method && billing.stripe_configured && (
            <button
              onClick={handlePortal}
              disabled={actionLoading === 'portal'}
              className="btn btn-secondary btn-sm"
            >
              {actionLoading === 'portal' ? 'Redirecting...' : 'Manage billing'}
            </button>
          )}
          {!billing?.stripe_configured && (
            <p className="text-xs text-gray-400 italic">Stripe not configured on this server.</p>
          )}
        </div>
      </div>

      {/* Current month cost */}
      <div className="panel p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">This month</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-display font-bold text-gray-900">
            ${(usage?.current_month?.cost ?? 0).toFixed(4)}
          </span>
          <span className="text-sm text-gray-400">USD</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {usage?.current_month?.invocations ?? 0} agent invocations · includes platform, token, and alert delivery charges
        </p>
      </div>

      {/* Per-watcher breakdown */}
      {usage && usage.watchers.length > 0 && (
        <div className="panel">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Usage by watcher</p>
          </div>
          <div className="divide-y divide-gray-50">
            {usage.watchers.map((w) => (
              <div key={w.watcher_id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{w.watcher_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {w.emails} emails · {w.invocations} invocations · {w.alerts} alerts
                  </p>
                </div>
                <span className="text-sm font-mono text-gray-700 flex-shrink-0">
                  ${w.cost.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-gray-100 flex justify-between">
            <span className="text-xs text-gray-400">All-time total</span>
            <span className="text-sm font-mono font-medium text-gray-900">
              ${(usage.total_cost ?? 0).toFixed(4)}
            </span>
          </div>
        </div>
      )}

      {/* Pricing note */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
        <p className="text-xs text-gray-500 max-w-none">
          <span className="font-medium text-gray-700">Pay-per-use, no tiers.</span>{' '}
          1¢ per email processed. ½¢ per alert sent. AI included. Billed monthly through Stripe.{!billing?.has_payment_method && ` ${billing?.trial_emails_remaining ?? 50} free trial emails remaining.`}
        </p>
      </div>
    </main>
  );
}
