'use client';

import Link from 'next/link';
import { PublicHeader } from '@/components/layout';

const models = [
  { name: 'GPT-4.1', cost: '$2.40', speed: 'Fast', quality: 'Strong reasoning, reliable triage', recommended: true },
  { name: 'GPT-4o', cost: '$3.00', speed: 'Fast', quality: 'Multimodal, strong analysis', recommended: false },
  { name: 'Gemini 2.5 Pro', cost: '$1.50', speed: 'Fast', quality: 'High accuracy, good value', recommended: false },
  { name: 'Claude Sonnet 4', cost: '$3.60', speed: 'Moderate', quality: 'Best reasoning and judgment', recommended: false },
];

const examples = [
  { emails: 10, label: '10 emails/day', monthly: '~$1.00/mo', model: 'GPT-4.1' },
  { emails: 50, label: '50 emails/day', monthly: '~$5.10/mo', model: 'GPT-4.1' },
  { emails: 200, label: '200 emails/day', monthly: '~$19/mo', model: 'GPT-4.1' },
  { emails: 50, label: '50 emails/day', monthly: '~$6.50/mo', model: 'Claude Sonnet 4' },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader />

      <main className="pt-28 pb-20">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-14">
            <h1 className="text-4xl md:text-5xl font-display font-semibold text-gray-900 tracking-tight mb-5">
              Pay for what you use.
            </h1>
            <p className="max-w-2xl mx-auto text-xl text-gray-600 leading-relaxed">
              No tiers. No subscriptions. Each invocation costs a $0.001 platform fee
              plus the AI token cost for your chosen model. Alerts cost $0.005 each.
            </p>
          </div>

          {/* Core pricing */}
          <div className="panel p-8 mb-8">
            <div className="grid gap-6 text-center md:grid-cols-3">
              <div>
                <div className="text-3xl font-display font-semibold text-gray-900 mb-1">$0.001</div>
                <div className="text-sm text-gray-500">platform fee<br />per invocation</div>
              </div>
              <div>
                <div className="text-3xl font-display font-semibold text-gray-900 mb-1">+ tokens</div>
                <div className="text-sm text-gray-500">AI cost<br />varies by model</div>
              </div>
              <div>
                <div className="text-3xl font-display font-semibold text-gray-900 mb-1">$0.005</div>
                <div className="text-sm text-gray-500">per alert<br />email sent</div>
              </div>
            </div>
          </div>

          {/* What's free */}
          <div className="panel p-6 mb-8 bg-vigil-900 text-white">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-vigil-200 mb-4">Always free</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                'Unlimited watchers',
                'Unlimited threads and memory',
                'Full audit trail',
                'Agent chat',
                'Obligation tracking',
                'Webhook integrations',
                '4 premium models, 3 providers',
                'Reactivity control',
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

          {/* Model pricing table */}
          <div className="mb-8">
            <h2 className="text-xl font-display font-semibold text-gray-900 mb-1">Choose your model</h2>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed">Cost per 1M input tokens. Each email uses ~500–2000 tokens.</p>
            <div className="panel overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-surface-sunken">
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Model</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Cost/1M tokens</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Speed</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.name} className={`border-b border-gray-100 ${m.recommended ? 'bg-vigil-50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {m.name}
                        {m.recommended && <span className="ml-2 badge badge-sm badge-ok">default</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-mono">{m.cost}</td>
                      <td className="px-4 py-3 text-gray-600">{m.speed}</td>
                      <td className="px-4 py-3 text-gray-600">{m.quality}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cost examples */}
          <div className="mb-14">
            <h2 className="text-xl font-display font-semibold text-gray-900 mb-1">What it actually costs</h2>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed">Real monthly estimates based on email volume.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {examples.map((ex) => (
                <div key={ex.label + ex.model} className="panel p-5">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium text-gray-900">{ex.label}</div>
                      <div className="text-xs text-gray-500">{ex.model}</div>
                    </div>
                    <div className="text-xl font-display font-semibold text-gray-900">{ex.monthly}</div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-vigil-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (ex.emails / 200) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="mb-14">
            <h2 className="text-2xl font-display font-semibold text-gray-900 text-center mb-8">Questions</h2>
            <div className="space-y-4">
              {[
                { q: 'What counts as a processed email?', a: 'Each email forwarded to your watcher address. Follow-ups in the same thread count separately since each may contain new obligations or deadlines.' },
                { q: 'What counts as an alert?', a: 'Each email sent by Vigil to notify you. Silence alerts, urgency alerts, and weekly digests each count as one alert ($0.005 each).' },
                { q: 'Is there a minimum charge?', a: 'No. If you send 0 emails in a month, you pay $0. The $0.001 platform fee only applies when the agent processes an email or runs a scheduled review.' },
                { q: 'Can I set a spending cap?', a: 'Coming soon. For now, you control costs by choosing cheaper models and adjusting your reactivity level (fewer alerts = lower cost).' },
                { q: 'How do I pay?', a: 'Usage is tracked per account. Billing is monthly via Stripe. You can see your current usage and estimated cost in the dashboard.' },
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
            <Link href="/auth/register" className="btn btn-primary btn-lg">Start today</Link>
          </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-surface-page">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-8 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Vigil. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
