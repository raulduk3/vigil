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
    description: 'Get started with basic monitoring',
    popular: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 10,
    features: ['5 watchers', '200 emails/week', 'Email & webhook notifications', 'Email support'],
    description: 'For individuals and small teams',
    popular: false,
  },
  {
    id: 'pro',
    name: 'Professional',
    price: 30,
    features: ['20 watchers', '1,000 emails/week', 'All notification channels', 'Priority support', 'Advanced reporting', 'SMS notifications'],
    description: 'For growing businesses',
    popular: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 100,
    features: ['Unlimited watchers', 'Unlimited emails', 'All features', 'Dedicated support', 'SLA guarantee', 'Custom integrations'],
    description: 'For large organizations',
    popular: false,
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
      const [subResult, usageResult] = await Promise.all([
        api.getSubscription(),
        api.getUsage(),
      ]);
      setSubscription(subResult.subscription);
      setUsage(usageResult.usage);
      
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
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else if (result.portal_url) {
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
    if (!timestamp) {
      return '—';
    }
    const ms = timestamp < 100000000000 ? timestamp * 1000 : timestamp;
    return new Date(ms).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm text-gray-500">Loading billing data...</span>
        </div>
      </div>
    );
  }

  const currentPlan = subscription?.plan || 'free';

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-display font-semibold text-gray-900">Billing</h2>
        <p className="mt-1 text-sm sm:text-base text-gray-500">
          Manage your subscription and payment methods
        </p>
      </div>

      {/* Messages */}
      {message && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${
          message.type === 'success' 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <svg className={`w-5 h-5 flex-shrink-0 ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {message.type === 'success' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
          <p className={`flex-1 text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>
          <button onClick={() => setMessage(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Current Plan Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Current Plan</h3>
                <p className="text-sm text-gray-500">
                  You&apos;re on the <span className="font-medium text-gray-900 capitalize">{currentPlan}</span> plan
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {subscription && subscription.plan !== 'free' && (
                <>
                  <button 
                    onClick={handleManageBilling} 
                    className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Manage Billing
                  </button>
                  {subscription.cancel_at_period_end ? (
                    <button
                      onClick={handleResumeSubscription}
                      disabled={isResuming}
                      className="px-4 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2"
                    >
                      {isResuming && (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {isResuming ? 'Resuming...' : 'Resume'}
                    </button>
                  ) : (
                    <button
                      onClick={handleCancelSubscription}
                      disabled={isCanceling}
                      className="px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:bg-red-100 disabled:text-red-400 flex items-center justify-center gap-2"
                    >
                      {isCanceling && (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {isCanceling ? 'Canceling...' : 'Cancel Plan'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Cancellation Warning */}
        {subscription?.cancel_at_period_end && subscription.current_period_end && (
          <div className="px-4 sm:px-6 py-4 bg-amber-50 border-b border-amber-100">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Your subscription will be canceled on {formatDate(subscription.current_period_end)}
                </p>
                <p className="text-sm text-amber-700 mt-0.5">
                  You&apos;ll retain access to {subscription.plan} features until then.
                </p>
              </div>
            </div>
          </div>
        )}

        {subscription && (subscription.current_period_start || subscription.status !== 'free') && (
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Status</p>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  subscription.cancel_at_period_end 
                    ? 'bg-amber-100 text-amber-700' 
                    : subscription.status === 'active' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-gray-100 text-gray-700'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                    subscription.cancel_at_period_end 
                      ? 'bg-amber-500' 
                      : subscription.status === 'active' 
                        ? 'bg-green-500' 
                        : 'bg-gray-500'
                  }`}></span>
                  {subscription.cancel_at_period_end ? 'Canceling' : subscription.status}
                </span>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Billing Period</p>
                <p className="text-sm font-medium text-gray-900">
                  {formatDate(subscription.current_period_start)} – {formatDate(subscription.current_period_end)}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  {subscription.cancel_at_period_end ? 'Access Until' : 'Next Billing'}
                </p>
                <p className="text-sm font-medium text-gray-900">{formatDate(subscription.current_period_end)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Usage Card */}
      {usage && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Current Usage</h3>
                <p className="text-sm text-gray-500">
                  {formatDate(usage.current_period.start)} – {formatDate(usage.current_period.end)}
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Emails Processed</p>
                <p className="text-2xl sm:text-3xl font-display font-bold text-gray-900 tabular-nums">
                  {usage.emails.processed.toLocaleString()}
                  {!usage.emails.unlimited && (
                    <span className="text-sm font-normal text-gray-400 ml-1">/ {usage.emails.limit.toLocaleString()}</span>
                  )}
                </p>
                {!usage.emails.unlimited && (
                  <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gray-900 rounded-full transition-all"
                      style={{ width: `${Math.min((usage.emails.processed / usage.emails.limit) * 100, 100)}%` }}
                    ></div>
                  </div>
                )}
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Active Watchers</p>
                <p className="text-2xl sm:text-3xl font-display font-bold text-gray-900 tabular-nums">
                  {usage.watchers.count}
                  {!usage.watchers.unlimited && (
                    <span className="text-sm font-normal text-gray-400 ml-1">/ {usage.watchers.limit}</span>
                  )}
                </p>
                {!usage.watchers.unlimited && (
                  <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gray-900 rounded-full transition-all"
                      style={{ width: `${Math.min((usage.watchers.count / usage.watchers.limit) * 100, 100)}%` }}
                    ></div>
                  </div>
                )}
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Remaining</p>
                <p className="text-2xl sm:text-3xl font-display font-bold text-gray-900 tabular-nums">
                  {usage.emails.unlimited ? '∞' : usage.emails.remaining.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-1">emails this period</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Available Plans */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">
          Available Plans
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => (
            <div 
              key={plan.id} 
              className={`relative bg-white rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
                currentPlan === plan.id 
                  ? 'border-gray-900 ring-2 ring-gray-900' 
                  : plan.popular 
                    ? 'border-gray-300' 
                    : 'border-gray-200'
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-gray-900 text-white text-xs font-medium px-3 py-1 rounded-bl-lg">
                  Popular
                </div>
              )}
              <div className="p-5">
                <h4 className="text-lg font-semibold text-gray-900">{plan.name}</h4>
                <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                <div className="mt-4">
                  <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                  <span className="text-gray-500">/mo</span>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {plan.features.slice(0, 4).map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                  {plan.features.length > 4 && (
                    <li className="text-sm text-gray-500 pl-6">
                      +{plan.features.length - 4} more
                    </li>
                  )}
                </ul>
                <div className="mt-5">
                  {currentPlan === plan.id ? (
                    <button 
                      disabled 
                      className="w-full px-4 py-2.5 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-default"
                    >
                      Current Plan
                    </button>
                  ) : plan.id === 'free' ? (
                    <button 
                      disabled 
                      className="w-full px-4 py-2.5 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-default"
                    >
                      —
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={isUpgrading !== null}
                      className={`w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                        plan.popular
                          ? 'text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400'
                          : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:bg-gray-100'
                      }`}
                    >
                      {isUpgrading === plan.id ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </>
                      ) : currentPlan === 'free' ? (
                        'Upgrade'
                      ) : (
                        'Switch'
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invoice History */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Invoice History</h3>
              <p className="text-sm text-gray-500 hidden sm:block">View and download your past invoices</p>
            </div>
          </div>
        </div>

        {invoices.length > 0 ? (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Invoice</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Date</th>
                    <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amount</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900">
                          {invoice.number || `INV-${invoice.id.slice(-8)}`}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600 tabular-nums">
                          {formatDate(invoice.created * 1000)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          invoice.status === 'paid' 
                            ? 'bg-green-100 text-green-700' 
                            : invoice.status === 'open' 
                              ? 'bg-amber-100 text-amber-700' 
                              : 'bg-gray-100 text-gray-700'
                        }`}>
                          {invoice.status || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-medium text-gray-900 tabular-nums">
                          ${(invoice.amount_paid / 100).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {invoice.invoice_pdf && (
                            <a 
                              href={invoice.invoice_pdf} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                            >
                              PDF
                            </a>
                          )}
                          {invoice.hosted_invoice_url && (
                            <a 
                              href={invoice.hosted_invoice_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                            >
                              View
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile List */}
            <div className="sm:hidden divide-y divide-gray-100">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        {invoice.number || `INV-${invoice.id.slice(-8)}`}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5 tabular-nums">
                        {formatDate(invoice.created * 1000)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900 tabular-nums">
                        ${(invoice.amount_paid / 100).toFixed(2)}
                      </p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${
                        invoice.status === 'paid' 
                          ? 'bg-green-100 text-green-700' 
                          : invoice.status === 'open' 
                            ? 'bg-amber-100 text-amber-700' 
                            : 'bg-gray-100 text-gray-700'
                      }`}>
                        {invoice.status || 'Unknown'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    {invoice.invoice_pdf && (
                      <a 
                        href={invoice.invoice_pdf} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-sm font-medium text-gray-600 hover:text-gray-900"
                      >
                        Download PDF
                      </a>
                    )}
                    {invoice.hosted_invoice_url && (
                      <a 
                        href={invoice.hosted_invoice_url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-sm font-medium text-gray-600 hover:text-gray-900"
                      >
                        View Online
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="p-8 sm:p-12 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">No invoices yet</p>
            <p className="text-xs text-gray-400 mt-1">Your billing history will appear here</p>
          </div>
        )}

        {subscription && subscription.plan !== 'free' && (
          <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t border-gray-100">
            <button 
              onClick={handleManageBilling} 
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1"
            >
              View all invoices in billing portal
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
