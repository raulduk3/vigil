'use client';

import Link from 'next/link';
import { PublicHeader, Footer } from '@/components/layout';
import { AVG_COST_PER_EMAIL, formatUsd } from '@/lib/pricing';

const scenarios = [
  { label: 'Light', emails: 100, summary: 'One watcher for a few streams that matter.' },
  { label: 'Normal', emails: 500, summary: 'Work email plus bills or vendor follow-up.' },
  { label: 'Heavy', emails: 2000, summary: 'Several active watchers handling real operational flow.' },
  { label: 'Power', emails: 5000, summary: 'High-volume teams routing lots of mail through Vigil.' },
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
              Pay what it costs. Plus 5%.
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              Every API call is billed at the actual LLM token cost plus a 5% margin.
              No flat rates. No hidden markup. Bring your own API key and it&apos;s free.
            </p>
          </div>

          <div className="panel p-8 mb-8">
            <div className="grid gap-6 text-center md:grid-cols-3">
              <div>
                <div className="text-4xl font-display font-semibold text-gray-900 mb-1">5%</div>
                <div className="text-sm text-gray-500">margin on LLM costs</div>
              </div>
              <div>
                <div className="text-4xl font-display font-semibold text-gray-900 mb-1">50</div>
                <div className="text-sm text-gray-500">free emails to start</div>
              </div>
              <div>
                <div className="text-4xl font-display font-semibold text-gray-900 mb-1">Free</div>
                <div className="text-sm text-gray-500">scheduled checks + BYOK</div>
              </div>
            </div>
          </div>

          <div className="panel p-6 mb-8 bg-vigil-900 text-white">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-vigil-200 mb-4">What you pay for</h3>
            <p className="text-sm text-vigil-100 mb-4">
              Email processing and chat messages are billed at actual LLM token cost + 5%.
              Scheduled checks and digests are free (we absorb the cost). Your dashboard shows every call and its exact cost.
            </p>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-vigil-200 mb-4 mt-6">What&apos;s included free</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                'Unlimited watchers',
                'Unlimited forwarding rules',
                'Agent memory and threads',
                'Full audit trail',
                'Custom tools and webhooks',
                'Developer API access',
                'Chrome extension',
                'Daily or weekly digests',
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

          {/* BYOK callout */}
          <div className="panel p-6 mb-8 border-2 border-vigil-300 bg-vigil-50">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-vigil-900 text-white flex items-center justify-center text-lg font-bold flex-shrink-0">🔑</div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Bring Your Own Key</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Add your own OpenAI, Anthropic, or Google API key and Vigil is completely free.
                  No trial limit. No metering. No margin. You pay your provider directly.
                  We never store your key in plaintext (AES-256-GCM encrypted at rest).
                </p>
              </div>
            </div>
          </div>

          {/* Estimates */}
          <div className="mb-14">
            <h2 className="text-xl font-display font-semibold text-gray-900 mb-1">Typical monthly costs</h2>
            <p className="text-sm text-gray-500 mb-4">Estimates based on GPT-4.1-mini (default model). Scheduled checks and digests are free. Actual costs vary by email length and model.</p>
            <div className="grid grid-cols-2 gap-4">
              {scenarios.map((s) => {
                const monthly = s.emails * AVG_COST_PER_EMAIL;
                return (
                  <div key={s.label} className="panel p-5">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-medium text-gray-900">{s.label}</div>
                      <div className="text-xl font-display font-semibold text-gray-900">
                        ~{formatUsd(monthly)}<span className="text-sm font-normal text-gray-400">/mo</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">{s.emails.toLocaleString()} emails/month · checks free</div>
                    <p className="text-sm text-gray-600 mt-3 max-w-none">{s.summary}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cost breakdown */}
          <div className="panel p-6 mb-14">
            <h2 className="text-xl font-display font-semibold text-gray-900 mb-4">Where the cost comes from</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Email processing (per email)</span>
                <span className="font-mono text-gray-900">~1.2¢</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Chat message (per message)</span>
                <span className="font-mono text-gray-900">~0.6¢</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Scheduled checks + digests</span>
                <span className="font-mono text-vigil-700 font-semibold">Free</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Vigil margin</span>
                <span className="font-mono text-gray-900">5%</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600">BYOK (your own API key)</span>
                <span className="font-mono text-vigil-700 font-semibold">Free</span>
              </div>
            </div>
          </div>

          <div className="mb-14">
            <h2 className="text-2xl font-display font-semibold text-gray-900 text-center mb-8">Questions</h2>
            <div className="space-y-4">
              {[
                { q: 'How is my bill calculated?', a: 'Every time Vigil calls an AI model on your behalf, the token cost is recorded. At the end of the month, you pay the sum of those costs plus 5%. Your dashboard shows every call, its cost, and the running total in real time.' },
                { q: 'What does BYOK mean?', a: 'Bring Your Own Key. Add your OpenAI, Anthropic, or Google API key in account settings. Vigil uses your key for all LLM calls. You pay your provider directly. Vigil charges nothing.' },
                { q: 'Is there a free tier?', a: '50 emails free to start, no credit card required. After that, add billing or bring your own API key.' },
                { q: 'What model do you use?', a: 'GPT-4.1-mini by default. You can switch models per watcher. Costs vary by model. The dashboard shows exact costs per call.' },
                { q: 'Can costs spike unexpectedly?', a: 'Costs scale linearly with usage. A typical watcher processing 500 emails/month with hourly checks runs about $15. Your dashboard shows real-time usage so there are no surprises.' },
                { q: 'Do I pay for scheduled checks?', a: 'No. Scheduled checks (ticks) and digests are free. We absorb that cost. You only pay for email processing and chat messages.' },
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
            <p className="text-sm text-gray-500 mt-3">50 free emails. No credit card required. BYOK = free forever.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
