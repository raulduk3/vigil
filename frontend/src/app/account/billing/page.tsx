'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, type Subscription, type Usage } from '@/lib/api';

interface Invoice {
  id: string;
  number: string | null;
  status: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  created: number;
  period_start: number;
  period_end: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    features: ['2 watchers', '50 emails/week', 'Email notifications', 'Community support'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 10,
    features: ['5 watchers', '200 emails/week', 'Email & webhook notifications', 'Email support'],
  },
  {
    id: 'pro',
    name: 'Professional',
    price: 30,
    features: ['20 watchers', '1,000 emails/week', 'All notification channels', 'Priority support', 'Advanced reporting', 'SMS notifications'],
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 100,
    features: ['Unlimited watchers', 'Unlimited emails', 'All features', 'Dedicated support', 'SLA guarantee', 'Custom integrations'],
  },
];

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpgrading, setIsUpgrading] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchBillingData = async () => {
    try {
      // Fetch subscription and usage first (these are critical)
      const [subResult, usageResult] = await Promise.all([
        api.getSubscription(),
        api.getUsage(),
      ]);
      setSubscription(subResult.subscription);
      setUsage(usageResult.usage);
      
      // Fetch invoices separately - don't fail if this errors
      try {
        const invoiceResult = await api.getInvoices();
        setInvoices(invoiceResult.invoices || []);
      } catch (invoiceError) {
        console.warn('Failed to fetch invoices:', invoiceError);
        setInvoices([]);
      }
    } catch (error) {
      console.error('Failed to fetch billing data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    
    if (success === 'true') {
      setMessage({ type: 'success', text: 'Payment successful. Your subscription has been activated.' });
      window.history.replaceState({}, '', '/account/billing');
    } else if (canceled === 'true') {
      setMessage({ type: 'error', text: 'Payment was canceled. Your subscription was not changed.' });
      window.history.replaceState({}, '', '/account/billing');
    }
  }, [searchParams]);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const handleUpgrade = async (planId: string) => {
    setMessage(null);
    setIsUpgrading(planId);
    
    try {
      const result = await api.createCheckoutSession(planId);
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      } else {
        setMessage({ type: 'error', text: 'Failed to create checkout session' });
        setIsUpgrading(null);
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to create checkout session'
      });
      setIsUpgrading(null);
    }
  };

  const handleManageBilling = async () => {
    try {
      const result = await api.createBillingPortalSession();
      if (result.portal_url) {
        window.location.href = result.portal_url;
      } else {
        setMessage({ type: 'error', text: 'Failed to open billing portal' });
      }
    } catch (error) {
      console.error('Failed to open billing portal:', error);
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to open billing portal'
      });
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.')) {
      return;
    }
    
    setIsCanceling(true);
    setMessage(null);
    
    try {
      await api.cancelSubscription();
      setMessage({ type: 'success', text: 'Subscription canceled. You will have access until the end of your billing period.' });
      await fetchBillingData();
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to cancel subscription'
      });
    } finally {
      setIsCanceling(false);
    }
  };

  const handleResumeSubscription = async () => {
    setIsResuming(true);
    setMessage(null);
    
    try {
      await api.resumeSubscription();
      setMessage({ type: 'success', text: 'Subscription resumed. Your plan will continue as normal.' });
      await fetchBillingData();
    } catch (error) {
      console.error('Failed to resume subscription:', error);
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to resume subscription'
      });
    } finally {
      setIsResuming(false);
    }
  };

  const formatDate = (timestamp: number | null | undefined) => {
    // Handle invalid timestamps (null, undefined, 0)
    if (!timestamp) {
      return '—';
    }
    // Convert seconds to milliseconds if needed (timestamps before year 3000 in seconds)
    const ms = timestamp < 100000000000 ? timestamp * 1000 : timestamp;
    return new Date(ms).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="panel p-12 flex items-center justify-center">
        <span className="spinner mr-3" />
        <span className="text-sm text-gray-600">Loading billing data...</span>
      </div>
    );
  }

  const currentPlan = subscription?.plan || 'free';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-display font-semibold text-gray-900">Billing</h1>
        <p className="text-sm text-gray-600 mt-1">
          Manage your subscription and payment methods.
        </p>
      </div>

      {/* Messages */}
      {message && (
        <div className={`notice ${message.type === 'success' ? 'notice-success' : 'notice-error'}`}>
          <div className="flex items-center justify-between">
            <p className="text-sm">{message.text}</p>
            <button onClick={() => setMessage(null)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Current Plan */}
      <section className="panel">
        <div className="px-4 py-3 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Current Plan</h2>
            <p className="text-sm text-gray-600">
              You&apos;re on the <span className="font-medium capitalize">{currentPlan}</span> plan.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {subscription && subscription.plan !== 'free' && (
              <>
                <button onClick={handleManageBilling} className="btn btn-secondary text-sm">
                  Manage Billing
                </button>
                {subscription.cancel_at_period_end ? (
                  <button
                    onClick={handleResumeSubscription}
                    disabled={isResuming}
                    className="btn btn-primary text-sm"
                  >
                    {isResuming ? 'Resuming...' : 'Resume'}
                  </button>
                ) : (
                  <button
                    onClick={handleCancelSubscription}
                    disabled={isCanceling}
                    className="btn btn-danger text-sm"
                  >
                    {isCanceling ? 'Canceling...' : 'Cancel'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Cancellation Warning */}
        {subscription?.cancel_at_period_end && subscription.current_period_end && (
          <div className="px-4 py-3 bg-status-warning/10 border-b border-status-warning/20">
            <p className="text-sm text-status-warning font-medium">
              Cancels on {formatDate(subscription.current_period_end)}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              You&apos;ll retain access to {subscription.plan} features until then.
            </p>
          </div>
        )}

        {subscription && (subscription.current_period_start || subscription.status !== 'free') && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="min-h-20">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Status</p>
              <span className={`badge ${
                subscription.cancel_at_period_end ? 'badge-warning' :
                subscription.status === 'active' ? 'badge-ok' : 'badge-inactive'
              }`}>
                {subscription.cancel_at_period_end ? 'Canceling' : subscription.status}
              </span>
            </div>
            <div className="min-h-20">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Period</p>
              <p className="text-sm text-gray-900">
                {formatDate(subscription.current_period_start)} – {formatDate(subscription.current_period_end)}
              </p>
            </div>
            <div className="min-h-20">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                {subscription.cancel_at_period_end ? 'Access Until' : 'Next Billing'}
              </p>
              <p className="text-sm text-gray-900">{formatDate(subscription.current_period_end)}</p>
            </div>
          </div>
        )}
      </section>

      {/* Usage */}
      {usage && (
        <section className="panel">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Current Usage</h2>
            <p className="text-sm text-gray-600">
              {formatDate(usage.current_period.start)} – {formatDate(usage.current_period.end)}
            </p>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="min-h-20 flex flex-col justify-center">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Emails Processed</p>
              <p className="text-2xl font-display font-semibold text-gray-900 tabular-nums">
                {usage.emails.processed.toLocaleString()}
                {!usage.emails.unlimited && (
                  <span className="text-sm font-normal text-gray-500"> / {usage.emails.limit.toLocaleString()}</span>
                )}
              </p>
            </div>
            <div className="min-h-20 flex flex-col justify-center">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Active Watchers</p>
              <p className="text-2xl font-display font-semibold text-gray-900 tabular-nums">
                {usage.watchers.count}
                {!usage.watchers.unlimited && (
                  <span className="text-sm font-normal text-gray-500"> / {usage.watchers.limit}</span>
                )}
              </p>
            </div>
            <div className="min-h-20 flex flex-col justify-center">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Remaining</p>
              <p className="text-2xl font-display font-semibold text-gray-900 tabular-nums">
                {usage.emails.unlimited ? '∞' : usage.emails.remaining.toLocaleString()}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Plans Table */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700 mb-3">
          Available Plans
        </h2>
        <div className="panel overflow-x-auto">
          <table className="table-base min-w-[800px]">
            <thead>
              <tr>
                <th className="table-header">Plan</th>
                <th className="table-header text-right">Price</th>
                <th className="table-header">Features</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((plan) => (
                <tr key={plan.id} className={`table-row ${currentPlan === plan.id ? 'bg-surface-sunken' : ''}`}>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{plan.name}</span>
                      {currentPlan === plan.id && <span className="badge badge-inactive text-xs">Current</span>}
                    </div>
                  </td>
                  <td className="table-cell text-right tabular-nums">
                    <span className="font-semibold text-gray-900">${plan.price}</span>
                    <span className="text-gray-500">/mo</span>
                  </td>
                  <td className="table-cell text-sm text-gray-600">
                    {plan.features.slice(0, 3).join(' · ')}
                    {plan.features.length > 3 && ` +${plan.features.length - 3} more`}
                  </td>
                  <td className="table-cell text-right">
                    {currentPlan === plan.id ? (
                      <span className="text-sm text-gray-400">Current</span>
                    ) : plan.id === 'free' ? (
                      <span className="text-sm text-gray-400">—</span>
                    ) : (
                      <button
                        onClick={() => handleUpgrade(plan.id)}
                        disabled={isUpgrading !== null}
                        className="btn btn-secondary text-sm"
                      >
                        {isUpgrading === plan.id ? (
                          <span className="flex items-center gap-2">
                            <span className="spinner" />
                            Processing
                          </span>
                        ) : currentPlan === 'free' ? 'Upgrade' : 'Switch'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Invoice History */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700 mb-3">
          Invoice History
        </h2>
        <div className="panel overflow-x-auto">
          {invoices.length > 0 ? (
            <table className="table-base min-w-[800px]">
              <thead>
                <tr>
                  <th className="table-header">Invoice</th>
                  <th className="table-header">Date</th>
                  <th className="table-header text-center">Status</th>
                  <th className="table-header text-right">Amount</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="table-row">
                    <td className="table-cell font-medium text-gray-900">
                      {invoice.number || `INV-${invoice.id.slice(-8)}`}
                    </td>
                    <td className="table-cell text-sm text-gray-600 tabular-nums">
                      {formatDate(invoice.created * 1000)}
                    </td>
                    <td className="table-cell text-center">
                      <span className={`badge ${
                        invoice.status === 'paid' ? 'badge-ok' :
                        invoice.status === 'open' ? 'badge-warning' : 'badge-inactive'
                      }`}>
                        {invoice.status || 'Unknown'}
                      </span>
                    </td>
                    <td className="table-cell text-right tabular-nums font-medium">
                      ${(invoice.amount_paid / 100).toFixed(2)}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-3">
                        {invoice.invoice_pdf && (
                          <a href={invoice.invoice_pdf} target="_blank" rel="noopener noreferrer" className="text-sm link">
                            PDF
                          </a>
                        )}
                        {invoice.hosted_invoice_url && (
                          <a href={invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-sm link">
                            View
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-center text-sm text-gray-500">
              No invoices yet.
            </div>
          )}
        </div>
        {subscription && (
          <button onClick={handleManageBilling} className="text-sm link mt-3">
            View all invoices in billing portal →
          </button>
        )}
      </section>
    </div>
  );
}
