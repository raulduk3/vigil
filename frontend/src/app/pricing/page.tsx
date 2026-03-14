'use client';

import Link from 'next/link';
import { PublicHeader } from '@/components/layout';
import {
  ALERT_DELIVERY_COST,
  DEFAULT_ESTIMATE_ASSUMPTIONS,
  PLATFORM_FEE_PER_INVOCATION,
  PRICING_MODELS,
  calculateMonthlyEstimate,
  formatUsd,
  formatUsdRate,
  getPricingModel,
} from '@/lib/pricing';

const scenarios = [
  {
    label: 'Light personal stream',
    emailsPerDay: 10,
    alertsPerDay: 1,
    modelId: 'gpt-4.1-mini',
  },
  {
    label: 'Default work inbox',
    emailsPerDay: 50,
    alertsPerDay: 2,
    modelId: 'gpt-4.1-mini',
  },
  {
    label: 'Busy operations queue',
    emailsPerDay: 200,
    alertsPerDay: 8,
    modelId: 'gpt-4.1-mini',
  },
  {
    label: 'Higher-judgment workflow',
    emailsPerDay: 50,
    alertsPerDay: 2,
    modelId: 'claude-sonnet-4',
  },
] as const;

export default function PricingPage() {
  const examples = scenarios.map((scenario) => {
    const model = getPricingModel(scenario.modelId);
    const estimate = calculateMonthlyEstimate({
      modelId: scenario.modelId,
      emailsPerDay: scenario.emailsPerDay,
      alertsPerDay: scenario.alertsPerDay,
      inputTokensPerInvocation: DEFAULT_ESTIMATE_ASSUMPTIONS.inputTokensPerInvocation,
      outputTokensPerInvocation: DEFAULT_ESTIMATE_ASSUMPTIONS.outputTokensPerInvocation,
    });

    return {
      ...scenario,
      ...estimate,
      model,
    };
  });

  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader />

      <main className="pt-28 pb-20">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="w-full">
            <div className="text-center mb-14">
              <h1 className="text-4xl md:text-5xl font-display font-semibold text-gray-900 tracking-tight mb-5">
                Pay for what you use.
              </h1>
              <p className="w-full text-xl text-gray-600 leading-relaxed">
                No tiers. No subscriptions. Each invocation costs a platform fee plus model token usage.
                Alert deliveries are billed separately.
              </p>
            </div>

            <div className="panel p-8 mb-8">
              <div className="grid gap-6 text-center md:grid-cols-3">
                <div>
                  <div className="text-3xl font-display font-semibold text-gray-900 mb-1">{formatUsd(PLATFORM_FEE_PER_INVOCATION)}</div>
                  <div className="text-sm text-gray-500">platform fee<br />per invocation</div>
                </div>
                <div>
                  <div className="text-3xl font-display font-semibold text-gray-900 mb-1">+ tokens</div>
                  <div className="text-sm text-gray-500">input and output usage<br />priced by model</div>
                </div>
                <div>
                  <div className="text-3xl font-display font-semibold text-gray-900 mb-1">{formatUsd(ALERT_DELIVERY_COST)}</div>
                  <div className="text-sm text-gray-500">per alert<br />email sent</div>
                </div>
              </div>
              <p className="mt-5 text-center text-sm text-gray-500 max-w-none">
                Token rates shown below already include Vigil&apos;s 20% markup on provider pricing.
              </p>
            </div>

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
                  `${PRICING_MODELS.length} models across 3 providers`,
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

            <div className="mb-8">
              <h2 className="text-xl font-display font-semibold text-gray-900 mb-1">Choose your model</h2>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                Exact token rates used by the backend, billed per 1K tokens for both input and output.
              </p>
              <div className="panel overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-surface-sunken">
                      <th className="text-left px-4 py-3 font-medium text-gray-700">Model</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-700">Provider</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-700">Input / 1K</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-700">Output / 1K</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-700">Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRICING_MODELS.map((model) => (
                      <tr key={model.id} className={`border-b border-gray-100 ${model.isDefault ? 'bg-vigil-50' : ''}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {model.label}
                          {model.isDefault && <span className="ml-2 badge badge-sm badge-ok">default</span>}
                          <div className="mt-1 text-xs font-normal text-gray-500">{model.description}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{model.provider}</td>
                        <td className="px-4 py-3 text-gray-700 font-mono">{formatUsdRate(model.inputCostPer1k)}</td>
                        <td className="px-4 py-3 text-gray-700 font-mono">{formatUsdRate(model.outputCostPer1k)}</td>
                        <td className="px-4 py-3 text-gray-600 capitalize">{model.tier}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-14">
              <h2 className="text-xl font-display font-semibold text-gray-900 mb-1">Monthly estimate</h2>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                These examples use the exact billing formula. Each bar shows cost composition, assuming a 30-day month,
                {` ${DEFAULT_ESTIMATE_ASSUMPTIONS.inputTokensPerInvocation}`} input tokens, and {DEFAULT_ESTIMATE_ASSUMPTIONS.outputTokensPerInvocation} output tokens per invocation.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {examples.map((example) => {
                  const platformWidth = (example.platformCost / example.totalCost) * 100;
                  const tokenWidth = (example.tokenCost / example.totalCost) * 100;
                  const alertWidth = (example.alertCost / example.totalCost) * 100;

                  return (
                    <div key={example.label + example.model.id} className="panel p-5">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <div>
                          <div className="font-medium text-gray-900">{example.label}</div>
                          <div className="text-xs text-gray-500">
                            {example.emailsPerDay} emails/day · {example.alertsPerDay} alerts/day · {example.model.label}
                          </div>
                        </div>
                        <div className="text-xl font-display font-semibold text-gray-900">{formatUsd(example.totalCost)}/mo</div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-vigil-800 h-full" style={{ width: `${platformWidth}%` }} />
                        <div className="bg-vigil-400 h-full" style={{ width: `${tokenWidth}%` }} />
                        <div className="bg-status-warning h-full" style={{ width: `${alertWidth}%` }} />
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
                        <div className="rounded-md bg-surface-sunken px-3 py-2">
                          <span className="block text-[11px] uppercase tracking-wider text-gray-400">Platform</span>
                          <span className="font-mono text-gray-700">{formatUsd(example.platformCost)}</span>
                        </div>
                        <div className="rounded-md bg-surface-sunken px-3 py-2">
                          <span className="block text-[11px] uppercase tracking-wider text-gray-400">Tokens</span>
                          <span className="font-mono text-gray-700">{formatUsd(example.tokenCost)}</span>
                        </div>
                        <div className="rounded-md bg-surface-sunken px-3 py-2">
                          <span className="block text-[11px] uppercase tracking-wider text-gray-400">Alerts</span>
                          <span className="font-mono text-gray-700">{formatUsd(example.alertCost)}</span>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-gray-500 max-w-none">
                        {example.invocationsPerMonth.toLocaleString()} invocations/month and {example.alertsPerMonth.toLocaleString()} alert deliveries/month.
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mb-14">
              <h2 className="text-2xl font-display font-semibold text-gray-900 text-center mb-8">Questions</h2>
              <div className="space-y-4">
                {[
                  { q: 'What counts as an invocation?', a: 'Any time the agent runs: a forwarded email, a scheduled review tick, or a chat request. Most accounts are dominated by forwarded-email invocations.' },
                  { q: 'What counts as an alert?', a: 'Each email sent by Vigil to notify you. Silence alerts, urgency alerts, and weekly digests each count as one alert ($0.005 each).' },
                  { q: 'Is there a minimum charge?', a: 'No. If you send 0 emails in a month, you pay $0. The platform fee only applies when the agent actually runs.' },
                  { q: 'Can I set a spending cap?', a: 'Coming soon. For now, you control costs by choosing cheaper models and adjusting your reactivity level so fewer alerts are sent.' },
                  { q: 'How do I pay?', a: 'Usage is tracked per account. Billing is monthly via Stripe. You can see your current usage and actual billed cost in the dashboard.' },
                ].map((faq) => (
                  <div key={faq.q} className="panel p-5">
                    <h3 className="font-medium text-gray-900 mb-2">{faq.q}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>

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
