'use client';

import Link from 'next/link';
import { PublicHeader } from '@/components/layout';
import { ConnectionIndicator } from '@/components/system/connection-indicator';

const plans = [
  {
    name: 'Free',
    price: 0,
    period: 'forever',
    description: 'Get started with basic email monitoring',
    features: [
      '50 emails per week',
      '2 watchers',
      '2 notification channels',
    ],
    notIncluded: [
      'Advanced reporting',
      'Webhook notifications',
    ],
    cta: 'Get started',
    ctaHref: '/auth/register',
    highlight: false,
  },
  {
    name: 'Starter',
    price: 9.99,
    period: '/month',
    description: 'For individuals and small teams',
    features: [
      '200 emails per week',
      '5 watchers',
      '5 notification channels',
      'Webhook notifications',
      'Email support',
    ],
    notIncluded: [
      'Advanced reporting',
    ],
    cta: 'Start free trial',
    ctaHref: '/auth/register?plan=starter',
    highlight: false,
  },
  {
    name: 'Professional',
    price: 29.99,
    period: '/month',
    description: 'For professionals and growing teams',
    features: [
      '1,000 emails per week',
      '20 watchers',
      '10 notification channels',
      'Advanced reporting',
      'Webhook notifications',
      'Priority support',
    ],
    notIncluded: [],
    cta: 'Start free trial',
    ctaHref: '/auth/register?plan=pro',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: null,
    period: '',
    description: 'Unlimited usage for large organizations',
    features: [
      'Unlimited emails',
      'Unlimited watchers',
      'Unlimited notification channels',
      'Advanced reporting',
      'Webhook notifications',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
    ],
    notIncluded: [],
    cta: 'Contact sales',
    ctaHref: 'mailto:sales@vigil.run',
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader />

      <main className="pt-28 pb-20">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">
              Pricing
            </p>
            <h1 className="text-4xl md:text-5xl font-display font-semibold text-gray-900 tracking-tight mb-5">
              Simple, transparent pricing
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Start free. Upgrade when you need more capacity. 
              No hidden fees. Cancel anytime.
            </p>
          </div>

          {/* Pricing cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`panel p-6 flex flex-col ${
                  plan.highlight 
                    ? 'ring-2 ring-vigil-500 relative' 
                    : ''
                }`}
              >
                <div className="mb-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {plan.description}
                  </p>
                </div>

                <div className="mb-6">
                  {plan.price !== null ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-display font-semibold text-gray-900">
                        ${plan.price}
                      </span>
                      <span className="text-gray-500">{plan.period}</span>
                    </div>
                  ) : (
                    <div className="text-4xl font-display font-semibold text-gray-900">
                      Custom
                    </div>
                  )}
                </div>

                <ul className="space-y-3 mb-6 flex-grow">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <svg 
                        className="w-5 h-5 text-vigil-600 flex-shrink-0 mt-0.5" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M5 13l4 4L19 7" 
                        />
                      </svg>
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                  {plan.notIncluded.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <svg 
                        className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M6 18L18 6M6 6l12 12" 
                        />
                      </svg>
                      <span className="text-gray-400">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.ctaHref}
                  className={`btn w-full justify-center ${
                    plan.highlight ? 'btn-primary' : 'btn-secondary'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          {/* FAQ Section */}
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-display font-semibold text-gray-900 text-center mb-8">
              Frequently asked questions
            </h2>
            
            <div className="space-y-6">
              <div className="panel p-5">
                <h3 className="font-medium text-gray-900 mb-2">
                  What counts as an email?
                </h3>
                <p className="text-sm text-gray-600">
                  Each email forwarded to your watcher address counts as one email. 
                  Follow-up messages in the same thread each count separately since 
                  they may contain new deadlines or obligations.
                </p>
              </div>

              <div className="panel p-5">
                <h3 className="font-medium text-gray-900 mb-2">
                  When does my usage reset?
                </h3>
                <p className="text-sm text-gray-600">
                  Email limits reset every Monday at 00:00 UTC. You can track your 
                  current usage in the dashboard.
                </p>
              </div>

              <div className="panel p-5">
                <h3 className="font-medium text-gray-900 mb-2">
                  Can I change plans anytime?
                </h3>
                <p className="text-sm text-gray-600">
                  Yes. Upgrades take effect immediately with prorated billing. 
                  Downgrades take effect at the end of your current billing period.
                </p>
              </div>

              <div className="panel p-5">
                <h3 className="font-medium text-gray-900 mb-2">
                  What happens if I exceed my limits?
                </h3>
                <p className="text-sm text-gray-600">
                  You'll receive a notification when approaching your limit. 
                  Once reached, new emails won't be processed until the next period 
                  or you upgrade. Existing reminders and alerts continue working.
                </p>
              </div>

              <div className="panel p-5">
                <h3 className="font-medium text-gray-900 mb-2">
                  Do you offer refunds?
                </h3>
                <p className="text-sm text-gray-600">
                  Yes. If you're not satisfied within the first 14 days, contact us 
                  for a full refund. No questions asked.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-surface-page">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <p className="font-display font-semibold text-gray-900 mb-3">Vigil</p>
              <p className="text-sm text-gray-500">
                Email oversight.<br />
                Powered by GPT-4o-mini.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Product</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/#how-it-works" className="hover:text-gray-700">How it works</Link></li>
                <li><Link href="/#features" className="hover:text-gray-700">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-gray-700">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Documentation</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/learn/watchers" className="hover:text-gray-700">Watchers</Link></li>
                <li><Link href="/learn/email-ingestion" className="hover:text-gray-700">Email ingestion</Link></li>
                <li><Link href="/learn/reminders" className="hover:text-gray-700">Reminders</Link></li>
                <li><Link href="/learn/architecture" className="hover:text-gray-700">Architecture</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Company</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/blog" className="hover:text-gray-700">Blog</Link></li>
                <li><Link href="/support" className="hover:text-gray-700">Support</Link></li>
                <li><Link href="/privacy" className="hover:text-gray-700">Privacy policy</Link></li>
                <li><Link href="/terms" className="hover:text-gray-700">Terms of service</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
            <p>© {new Date().getFullYear()} Vigil. All rights reserved.</p>
            <div className="flex items-center gap-2">
              <ConnectionIndicator />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
