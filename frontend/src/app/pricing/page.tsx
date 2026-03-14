'use client';

import Link from 'next/link';
import { PublicHeader } from '@/components/layout';
import {
  ALERT_DELIVERY_COST,
  PLATFORM_FEE_PER_INVOCATION,
  PRICING_MODELS,
  calculateMonthlyEstimate,
  formatUsd,
} from '@/lib/pricing';

const scenarios = [
  { label: 'Light use', emailsPerDay: 10, alertsPerDay: 1, modelId: 'gpt-4.1' },
  { label: 'Typical professional', emailsPerDay: 50, alertsPerDay: 2, modelId: 'gpt-4.1' },
  { label: 'Heavy inbox', emailsPerDay: 200, alertsPerDay: 5, modelId: 'gpt-4.1' },
  { label: 'Premium reasoning', emailsPerDay: 50, alertsPerDay: 2, modelId: 'claude-sonnet-4' },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader />

      <main className="pt-28 pb-20">
        <div className="pricing-content max-w-3xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-14">
            <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">Pricing</p>
            <h1 className="text-4xl md:text-5xl font-display font-semibold text-gray-900 tracking-tight mb-5">
              Pay for what you use.
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              No tiers. No subscriptions. No limits. Each invocation costs a {formatUsd(PLATFORM_FEE_PER_INVOCATION)} platform fee
              plus model token costs. Alerts cost {formatUsd(ALERT_DELIVERY_COST)} each.
            </p>
          </div>

          {/* Core pricing */}
          <div className="panel p-8 mb-8">
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl font-display font-semibold text-gray-900 mb-1">{formatUsd(PLATFORM_FEE_PER_INVOCATION)}</div>
                <div className="text-sm text-gray-500">platform fee<br />per invocation</div>
              </div>
              <div>
                <div className="text-3xl font-display font-semibold text-gray-900 mb-1">+ tokens</div>
                <div className="text-sm text-gray-500">AI cost<br />varies by model</div>
              </div>
              <div>
                <div className="text-3xl font-display font-semibold text-gray-900 mb-1">{formatUsd(ALERT_DELIVERY_COST)}</div>
                <div className="text-sm text-gray-500">per alert<br />email sent</div>
              </div>
            </div>
          </div>

          {/* No limits */}
          <div className="panel p-6 mb-8 bg-vigil-900 text-white">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-vigil-200 mb-4">No limits. Ever.</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                'Unlimited watchers',
                'Unlimited emails',
                'Unlimited threads and memory',
                'Unlimited API access',
                'Full audit trail',
                'Agent chat control',
                'Custom tools and webhooks',
                '4 premium models, 3 providers',
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

          {/* Model pricing */}
          <div className="mb-8">
            <h2 className="text-xl font-display font-semibold text-gray-900 mb-1">Choose your model</h2>
            <p className="text-sm text-gray-500 mb-4">Cost per 1M input tokens (20% markup on provider rates). Each email uses ~900 input + ~120 output tokens.</p>
            <div className="panel overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-surface-sunken">
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Model</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Provider</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Input/1M</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {PRICING_MODELS.map((m) => (
                    <tr key={m.id} className={`border-b border-gray-100 ${m.isDefault ? 'bg-vigil-50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {m.label}
                        {m.isDefault && <span className="ml-2 badge badge-sm badge-ok">default</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{m.provider}</td>
                      <td className="px-4 py-3 text-gray-700 font-mono">${(m.inputCostPer1k * 1000).toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-600">{m.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Real cost estimates */}
          <div className="mb-14">
            <h2 className="text-xl font-display font-semibold text-gray-900 mb-1">What it actually costs</h2>
            <p className="text-sm text-gray-500 mb-4">Real monthly estimates. No caps. Scale as much as you want.</p>
            <div className="grid grid-cols-2 gap-4">
              {scenarios.map((s) => {
                const model = PRICING_MODELS.find(m => m.id === s.modelId) ?? PRICING_MODELS[0];
                const monthly = calculateMonthlyEstimate(s.emailsPerDay, s.alertsPerDay, s.modelId);
                return (
                  <div key={s.label} className="panel p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-medium text-gray-900">{s.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {s.emailsPerDay} emails/day · {s.alertsPerDay} alerts/day · {model.label}
                        </div>
                      </div>
                      <div className="text-xl font-display font-semibold text-gray-900">
                        {formatUsd(monthly)}<span className="text-sm font-normal text-gray-400">/mo</span>
                      </div>
                    </div>
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
                { q: 'Is there a limit on emails?', a: 'No. Process as many emails as you want. There are no caps, no throttling, no tier limits. You pay per email processed.' },
                { q: 'What counts as an invocation?', a: 'Each time the agent processes an email, runs a scheduled review, or handles a chat message. Each invocation costs the platform fee plus token costs.' },
                { q: 'What counts as an alert?', a: 'Each email sent by Vigil to notify you. Silence alerts, urgency alerts, and digests each count as one alert.' },
                { q: 'Is there a free trial?', a: 'Yes. 50 emails processed free, no credit card required. After that, add a payment method to continue.' },
                { q: 'Can I set a spending cap?', a: 'Coming soon. For now, costs are fully transparent in the billing dashboard and you can adjust your model choice for lower costs.' },
                { q: 'How do I pay?', a: 'Usage is tracked per account. Billing is monthly via Stripe. You can see your current usage and cost in the dashboard at any time.' },
              ].map((faq) => (
                <div key={faq.q} className="panel p-5">
                  <h3 className="font-medium text-gray-900 mb-2">{faq.q}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
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
