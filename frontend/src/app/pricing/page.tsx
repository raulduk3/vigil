'use client';

import Link from 'next/link';
import { PublicHeader } from '@/components/layout';
import { PRICE_PER_EMAIL, ALERT_DELIVERY_COST, calculateMonthlyEstimate, formatUsd } from '@/lib/pricing';

const scenarios = [
  { label: 'One focused watcher', emailsPerDay: 5, alertsPerDay: 1 },
  { label: 'Work + bills (typical)', emailsPerDay: 15, alertsPerDay: 2 },
  { label: 'Multiple active watchers', emailsPerDay: 40, alertsPerDay: 3 },
  { label: 'High-volume operations', emailsPerDay: 100, alertsPerDay: 5 },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader />

      <main className="pt-28 pb-20">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Pricing</p>
            <h1 className="text-4xl md:text-5xl font-display font-semibold text-gray-900 tracking-tight mb-5">
              One cent per email.
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              No subscriptions. No tiers. No token math. One penny per email processed.
              Half a penny per alert sent. That&apos;s it.
            </p>
          </div>

          {/* Core pricing — dead simple */}
          <div className="panel p-8 mb-8">
            <div className="grid grid-cols-2 gap-8 text-center">
              <div>
                <div className="text-4xl font-display font-semibold text-gray-900 mb-1">1¢</div>
                <div className="text-sm text-gray-500">per email processed</div>
              </div>
              <div>
                <div className="text-4xl font-display font-semibold text-gray-900 mb-1">½¢</div>
                <div className="text-sm text-gray-500">per alert sent</div>
              </div>
            </div>
          </div>

          {/* No limits */}
          <div className="panel p-6 mb-8 bg-vigil-900 text-white">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-vigil-200 mb-4">Everything included. No limits.</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                'Unlimited watchers',
                'Unlimited emails',
                'GPT-4.1 powered (premium AI)',
                'Full audit trail',
                'Agent chat control',
                'Custom tools and webhooks',
                'Developer API access',
                'Obligation tracking',
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-vigil-100">
                  <svg className="w-4 h-4 text-vigil-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Real costs */}
          <div className="mb-14">
            <h2 className="text-xl font-display font-semibold text-gray-900 mb-1">What it actually costs</h2>
            <p className="text-sm text-gray-500 mb-4">You don&apos;t forward all your email. Just the streams that matter.</p>
            <div className="grid grid-cols-2 gap-4">
              {scenarios.map((s) => {
                const monthly = calculateMonthlyEstimate(s.emailsPerDay, s.alertsPerDay);
                return (
                  <div key={s.label} className="panel p-5">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-medium text-gray-900">{s.label}</div>
                      <div className="text-xl font-display font-semibold text-gray-900">
                        {formatUsd(monthly)}<span className="text-sm font-normal text-gray-400">/mo</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">{s.emailsPerDay} emails/day · {s.alertsPerDay} alerts/day</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* FAQ */}
          <div className="mb-14">
            <h2 className="text-2xl font-display font-semibold text-gray-900 text-center mb-8">Questions</h2>
            <div className="space-y-4">
              {[
                { q: 'What counts as an email processed?', a: 'Each email that arrives at your watcher address. The agent reads it, analyzes it, and decides what to do. That\'s one email processed.' },
                { q: 'What counts as an alert?', a: 'Each notification email Vigil sends you. When the agent decides something needs your attention, it sends an alert. Half a cent per alert.' },
                { q: 'Is there a free trial?', a: 'Yes. 50 emails processed free, no credit card required. After that, add a payment method to continue.' },
                { q: 'Are there any limits?', a: 'No. Unlimited watchers, unlimited emails, unlimited memory, unlimited API access. You pay per email processed. That\'s the only variable.' },
                { q: 'What AI model do you use?', a: 'GPT-4.1 by default — one of the strongest reasoning models available. Premium models like Claude Sonnet 4 are available on request. The AI cost is included in the per-email price.' },
                { q: 'How do I pay?', a: 'Monthly via Stripe. Your dashboard shows real-time usage. No surprises.' },
              ].map((faq) => (
                <div key={faq.q} className="panel p-5">
                  <h3 className="font-medium text-gray-900 mb-2">{faq.q}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center">
            <Link href="/auth/register" className="btn btn-primary btn-lg">Start for free</Link>
            <p className="text-sm text-gray-500 mt-3">50 free emails. No credit card required.</p>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-surface-page">
        <div className="max-w-3xl mx-auto px-6 py-8 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Vigil. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
