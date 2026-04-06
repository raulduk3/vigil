'use client';

import Link from 'next/link';
import { PublicHeader, Footer } from '@/components/layout';

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="site-shell">{children}</div>
    </section>
  );
}

const tiers = [
  { tier: 'Nano', models: 'GPT-4.1 Nano', cost: '~$0.0001', desc: 'Pre-screening and scheduled checks' },
  { tier: 'Mini', models: 'GPT-4.1 Mini, GPT-4o Mini, Gemini 2.5 Flash, Claude Haiku 4', cost: '~$0.0025', desc: 'Good balance of cost and quality' },
  { tier: 'Standard', models: 'GPT-4.1, GPT-4o, Gemini 2.5 Pro', cost: '~$0.01', desc: 'Best triage accuracy' },
  { tier: 'Pro', models: 'Claude Sonnet 4', cost: '~$0.03', desc: 'Top reasoning quality' },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader />

      <main className="pt-32 pb-20">
        <Section>
          <div className="max-w-3xl mx-auto text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-vigil-700 mb-5">Pricing</p>
            <h1 className="text-4xl md:text-5xl font-display font-semibold text-gray-900 tracking-tight mb-6">
              Free and open source.
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              Vigil is free software. Bring your own API keys and pay your provider directly. No platform fees, no markup, no metering.
            </p>
          </div>

          <div className="max-w-3xl mx-auto mb-12">
            <div className="panel overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Tier</th>
                    <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Models</th>
                    <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Cost/email</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t) => (
                    <tr key={t.tier} className="border-b border-gray-100 last:border-0">
                      <td className="px-5 py-4">
                        <span className="text-sm font-semibold text-gray-900">{t.tier}</span>
                        <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600">{t.models}</td>
                      <td className="px-5 py-4 text-sm font-mono text-gray-900 text-right">{t.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Estimates based on ~4,000 input tokens per email. Actual cost depends on email length and provider rates.
            </p>
          </div>

          <div className="text-center">
            <Link href="/account/keys" className="btn btn-primary">Set up your API keys →</Link>
          </div>
        </Section>
      </main>

      <Footer />
    </div>
  );
}
