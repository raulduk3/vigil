'use client';

import Link from 'next/link';
import { PublicHeader, Footer } from '@/components/layout';
import { PRICE_PER_EMAIL, calculateMonthlyEstimate, formatUsd } from '@/lib/pricing';

const scenarios = [
  { label: 'Light', emailsPerMonth: 100, summary: 'One watcher for the few streams that really matter.' },
  { label: 'Normal', emailsPerMonth: 500, summary: 'Work plus bills, client mail, or vendor follow-up.' },
  { label: 'Heavy', emailsPerMonth: 2000, summary: 'Several active watchers handling real operational flow.' },
  { label: 'Power', emailsPerMonth: 5000, summary: 'High-volume teams routing lots of mail through Vigil.' },
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
              Half a cent per email.
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              No plans. No alert fees. No token math in the UI. 50 emails free each month,
              then {formatUsd(PRICE_PER_EMAIL)} per email Vigil processes.
            </p>
          </div>

          <div className="panel p-8 mb-8">
            <div className="grid gap-6 text-center md:grid-cols-3">
              <div>
                <div className="text-4xl font-display font-semibold text-gray-900 mb-1">0.5¢</div>
                <div className="text-sm text-gray-500">per email processed</div>
              </div>
              <div>
                <div className="text-4xl font-display font-semibold text-gray-900 mb-1">50</div>
                <div className="text-sm text-gray-500">free emails each month</div>
              </div>
              <div>
                <div className="text-4xl font-display font-semibold text-gray-900 mb-1">$0</div>
                <div className="text-sm text-gray-500">for ticks and weekly digests</div>
              </div>
            </div>
          </div>

          <div className="panel p-6 mb-8 bg-vigil-900 text-white">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-vigil-200 mb-4">What is included</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                'Unlimited watchers',
                'Unlimited email forwarding rules',
                'Agent memory and thread tracking',
                'Full audit trail',
                'Weekly digests included',
                'Scheduled ticks included',
                'Custom tools and webhooks',
                'Developer API access',
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
            <p className="text-sm text-gray-500 mb-4">You do not forward your whole inbox. You forward the streams that matter.</p>
            <div className="grid grid-cols-2 gap-4">
              {scenarios.map((s) => {
                const monthly = calculateMonthlyEstimate(s.emailsPerMonth);
                return (
                  <div key={s.label} className="panel p-5">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-medium text-gray-900">{s.label}</div>
                      <div className="text-xl font-display font-semibold text-gray-900">
                        {formatUsd(monthly)}<span className="text-sm font-normal text-gray-400">/mo</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">{s.emailsPerMonth.toLocaleString()} emails/month</div>
                    <p className="text-sm text-gray-600 mt-3 max-w-none">{s.summary}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel p-6 mb-14">
            <h2 className="text-xl font-display font-semibold text-gray-900 mb-2">How to start cheap</h2>
            <p className="text-sm text-gray-600 leading-relaxed max-w-none mb-5">
              Start with one watcher and one live stream, then add more only if Vigil earns the right to stay in the loop.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <Link href="/auth/register" className="panel-inset rounded-md p-4 hover:bg-white transition-colors">
                <p className="text-xs uppercase tracking-[0.18em] text-vigil-700">Step 1</p>
                <p className="text-base font-semibold text-gray-900 mt-2">Create your account</p>
              </Link>
              <Link href="/extension" className="panel-inset rounded-md p-4 hover:bg-white transition-colors">
                <p className="text-xs uppercase tracking-[0.18em] text-vigil-700">Step 2</p>
                <p className="text-base font-semibold text-gray-900 mt-2">Use the extension</p>
              </Link>
              <Link href="/learn/email-ingestion" className="panel-inset rounded-md p-4 hover:bg-white transition-colors">
                <p className="text-xs uppercase tracking-[0.18em] text-vigil-700">Alternative</p>
                <p className="text-base font-semibold text-gray-900 mt-2">Manual forwarding docs</p>
              </Link>
            </div>
          </div>

          <div className="mb-14">
            <h2 className="text-2xl font-display font-semibold text-gray-900 text-center mb-8">Questions</h2>
            <div className="space-y-4">
              {[
                { q: 'What counts as an email processed?', a: 'Each email that arrives at your watcher address. The agent reads it, analyzes it, and decides what to do. That\'s one email processed.' },
                { q: 'Do alerts cost extra?', a: 'No. The unit is one processed email. Alerts are just one of the tools Vigil may choose to use.' },
                { q: 'Is there a free tier?', a: 'Yes. You get 50 processed emails each month with no credit card required.' },
                { q: 'Are there any limits?', a: 'No tiers and no watcher limits. You pay only for processed emails above the free allowance.' },
                { q: 'What AI model do you use?', a: 'GPT-4.1-mini is the default. The model cost is already built into the per-email price.' },
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
            <p className="text-sm text-gray-500 mt-3">50 free emails each month. No credit card required.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
