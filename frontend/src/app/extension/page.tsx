'use client';

import Link from 'next/link';
import { PublicHeader, Footer } from '@/components/layout';

const extensionSourceUrl = 'https://github.com/raulduk3/vigil/tree/main/chrome-extension';

const setupSteps = [
  {
    num: 1,
    title: 'Sign in',
    desc: 'Use your Vigil account or API key. Setup starts immediately and stays scoped to your account.',
  },
  {
    num: 2,
    title: 'Open Gmail or Outlook',
    desc: 'The extension detects the provider automatically and walks you to the correct forwarding settings.',
  },
  {
    num: 3,
    title: 'Choose a watcher',
    desc: 'Pick an existing watcher or create a new one for the stream you want Vigil to monitor.',
  },
  {
    num: 4,
    title: 'Complete forwarding',
    desc: 'Vigil shows you where to paste the forwarding address and handles Gmail confirmation code retrieval.',
  },
  {
    num: 5,
    title: 'Let the agent run',
    desc: 'After forwarding is enabled, your provider handles delivery natively and Vigil starts processing mail.',
  },
];

const guarantees = [
  'No inbox access or OAuth scopes',
  'No email body storage',
  'No background monitoring after setup',
  'No analytics, cookies, or tracking',
];

const manualInstallSteps = [
  <>
    Download the extension from{' '}
    <a
      href={extensionSourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-vigil-700 hover:text-vigil-800 hover:underline"
    >
      GitHub
    </a>
  </>,
  <>
    Open <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-2xs font-mono">chrome://extensions</code>
  </>,
  'Enable Developer mode in the top-right corner.',
  <>
    Click Load unpacked and select the <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-2xs font-mono">chrome-extension</code> folder.
  </>,
  'Pin the Vigil icon and start setup from the toolbar.',
];

const providers = [
  { name: 'Gmail', status: 'Full support', tone: 'ok' as const },
  { name: 'Outlook', status: 'Full support', tone: 'ok' as const },
  { name: 'Yahoo', status: 'Coming soon', tone: 'warning' as const },
];

export default function ExtensionPage() {
  return (
    <div className="min-h-screen bg-surface-page text-gray-700">
      <PublicHeader />

      <main className="pt-24 md:pt-28 pb-20">
        <section className="px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="max-w-4xl mx-auto text-center mb-8 md:mb-10">
              <div className="landing-section-header text-center items-center mx-auto gap-3 md:gap-4">
                <div className="landing-section-kicker">Chrome Extension</div>
                <h1 className="text-4xl md:text-6xl font-display font-semibold text-gray-900 tracking-tight leading-[1.05] text-balance">
                  Set up forwarding without touching email OAuth.
                </h1>
                <p className="landing-hero-copy max-w-3xl text-lg md:text-xl text-gray-600 leading-relaxed">
                  The extension is a setup wizard for Gmail and Outlook. It gets forwarding configured in under 30 seconds,
                  retrieves Gmail confirmation codes, and then gets out of the way.
                </p>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="#manual-install" className="btn btn-primary btn-lg w-full sm:w-auto gap-2.5">
                  <ChromeIcon />
                  Install in Chrome
                </Link>
                <Link href="/auth/register" className="btn btn-secondary btn-lg w-full sm:w-auto">
                  Create free account
                </Link>
              </div>

              <p className="mt-3 text-sm text-gray-500">
                Chrome Web Store listing pending. Use the developer-mode install steps below for now.
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 text-xs sm:text-sm text-gray-500">
                <span className="badge badge-ok">Gmail</span>
                <span className="badge badge-ok">Outlook</span>
                <span className="badge">Manifest V3</span>
                <span className="badge">Zero inbox access</span>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] items-stretch">
              <div className="panel p-6 md:p-7">
                <div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
                  <div className="panel-inset rounded-md p-5 md:p-6 text-left">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80 mb-3">What it does</p>
                    <div className="space-y-3">
                      <FlowRow label="Provider detection" value="Gmail or Outlook" />
                      <FlowRow label="Forwarding address" value="Generated per watcher" />
                      <FlowRow label="Gmail confirmation" value="Retrieved automatically" />
                      <FlowRow label="After setup" value="Provider forwards natively" />
                    </div>
                  </div>

                  <div className="panel-inset rounded-md p-5 md:p-6 text-left">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80 mb-3">What it does not do</p>
                    <ul className="space-y-3 text-sm text-gray-600">
                      {guarantees.map((item) => (
                        <li key={item} className="flex items-start gap-2.5">
                          <span className="mt-0.5 text-vigil-700">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-5 text-sm leading-relaxed text-gray-600">
                      Vigil processes forwarded email server-side. The extension only helps you configure the forwarding rule.
                    </p>
                  </div>
                </div>
              </div>

              <div className="panel p-6 md:p-7 flex flex-col justify-between gap-6">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80 mb-3">Why this exists</p>
                  <h2 className="text-2xl font-display font-semibold text-gray-900 mb-3">Fast setup, same privacy model.</h2>
                  <p className="text-sm md:text-base text-gray-600 leading-relaxed max-w-none">
                    Vigil does not connect to your inbox. Forwarding keeps the architecture simple: your provider sends mail to Vigil,
                    Vigil reads it, remembers what matters, and alerts you only when something needs attention.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <MiniStat value="30 sec" label="Typical setup time" />
                  <MiniStat value="0" label="Inbox permissions requested" />
                  <MiniStat value="Native" label="Forwarding handled by provider" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="manual-install" className="landing-section px-6 lg:px-8 mt-18 scroll-mt-28">
          <div className="max-w-6xl mx-auto">
            <div className="landing-section-header text-center items-center mx-auto mb-10">
              <div className="landing-section-kicker">How It Works</div>
              <h2 className="landing-section-title max-w-none">Five steps from install to active watcher.</h2>
              <p className="landing-section-copy">
                The extension handles the awkward parts of forwarding setup so you can get straight to the agent behavior you care about.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {setupSteps.map((step) => (
                <StepCard key={step.num} num={step.num} title={step.title} desc={step.desc} />
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section px-6 lg:px-8 mt-18">
          <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[0.95fr_1.05fr] items-start">
            <div className="panel p-6 md:p-7">
              <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80 mb-3">Manual Install</p>
              <h2 className="text-2xl font-display font-semibold text-gray-900 mb-3">Developer mode still works.</h2>
              <p className="text-sm md:text-base text-gray-600 leading-relaxed mb-5 max-w-none">
                If the Chrome Web Store listing is not live yet, you can load the extension locally in a few steps.
              </p>
              <ol className="space-y-3 text-sm text-gray-600">
                {manualInstallSteps.map((step, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <StepBadge className="h-8 w-8 text-sm">{index + 1}</StepBadge>
                    <span className="pt-1">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid gap-6">
              <div className="panel p-6 md:p-7">
                <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80 mb-3">Supported Providers</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {providers.map((provider) => (
                    <ProviderCard key={provider.name} {...provider} />
                  ))}
                </div>
              </div>

              <div className="panel p-6 md:p-7">
                <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80 mb-3">Account Required</p>
                    <h2 className="text-2xl font-display font-semibold text-gray-900 mb-3">Install the extension after you have a watcher.</h2>
                    <p className="text-sm md:text-base text-gray-600 leading-relaxed max-w-none">
                      The setup flow is faster when your watcher already exists. Create one first, then use the extension to wire forwarding in.
                    </p>
                  </div>
                  <div className="panel-inset rounded-md p-5 md:p-6 flex flex-col justify-center">
                    <p className="text-sm uppercase tracking-[0.2em] text-vigil-700/80 mb-2">Start free</p>
                    <p className="text-3xl font-display font-semibold text-gray-900 mb-2">50 emails included</p>
                    <p className="text-sm text-gray-600 leading-relaxed mb-5 max-w-none">
                      No credit card required. Set up a watcher, install the extension, and let the agent start learning from the first thread.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Link href="/auth/register" className="btn btn-secondary">
                        Create account
                      </Link>
                      <Link href="/learn/email-ingestion" className="btn btn-ghost">
                        Read setup docs
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function FlowRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/5 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="panel-inset rounded-md px-4 py-4">
      <div className="text-2xl font-display font-semibold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function StepCard({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="panel p-6 flex flex-col gap-4">
      <StepBadge>{num}</StepBadge>
      <div>
        <h3 className="text-lg font-display font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 leading-relaxed max-w-none">{desc}</p>
      </div>
    </div>
  );
}

function StepBadge({ children, className = 'h-10 w-10' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold text-vigil-700 ${className}`.trim()}>
      {children}
    </span>
  );
}

function ProviderCard({
  name,
  status,
  tone,
}: {
  name: string;
  status: string;
  tone: 'ok' | 'warning';
}) {
  const badgeClass = tone === 'ok' ? 'badge badge-ok' : 'badge badge-warning';

  return (
    <div className="panel-inset rounded-md p-5 text-center">
      <div className="text-base font-display font-semibold text-gray-900">{name}</div>
      <div className="mt-3">
        <span className={badgeClass}>{status}</span>
      </div>
    </div>
  );
}

function ChromeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="21.17" y1="8" x2="12" y2="8" />
      <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
      <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
    </svg>
  );
}