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

const setupHighlights = [
  {
    label: 'Works with',
    value: 'Gmail + Outlook',
    detail: 'Provider detection routes you into the right forwarding flow automatically.',
  },
  {
    label: 'Typical setup',
    value: 'About 30 sec',
    detail: 'Fastest path is: create a watcher first, then open the extension inside your mail provider.',
  },
  {
    label: 'Permissions',
    value: '0 inbox scopes',
    detail: 'Forwarding is configured in your provider. Vigil never requests inbox OAuth access.',
  },
];

const setupFacts = [
  {
    eyebrow: 'Works with',
    title: 'Gmail and Outlook',
    detail: 'The extension detects which provider is open and routes you to the correct forwarding settings.',
  },
  {
    eyebrow: 'Bring first',
    title: 'A watcher and forwarding address',
    detail: 'Create the watcher in Vigil first so setup has a destination ready to paste into your provider.',
  },
  {
    eyebrow: 'Handles for you',
    title: 'Forwarding steps and Gmail confirmation',
    detail: 'The awkward parts are automated so you do not have to hunt for Gmail verification messages manually.',
  },
  {
    eyebrow: 'After setup',
    title: 'Your provider forwards natively',
    detail: 'Once the rule is saved, the extension is out of the path and your mail provider handles delivery to Vigil.',
  },
];

const setupChecklist = [
  'Create your Vigil account if you do not already have one.',
  'Create the watcher first so the forwarding destination already exists.',
  'Open Gmail or Outlook in Chrome before starting the guided flow.',
  'Use developer-mode install for now while the Chrome Web Store listing is pending.',
];

const setupBoundaries = {
  does: [
    'Detects whether you are in Gmail or Outlook and opens the correct setup path.',
    'Walks you through where the forwarding address belongs in your provider settings.',
    'Retrieves Gmail forwarding confirmation codes so you do not need to hunt through email manually.',
  ],
  doesNot: guarantees,
};

const installChoices = [
  {
    title: 'Fastest path',
    description: 'Create a watcher, open Gmail or Outlook, and let the extension guide the forwarding steps.',
    href: '#setup-flow',
    cta: 'See setup flow',
  },
  {
    title: 'Need a watcher first',
    description: 'If you have not created an account yet, start there so the extension has an address to wire in.',
    href: '/auth/register',
    cta: 'Create account',
  },
  {
    title: 'Installing locally',
    description: 'The Chrome Web Store listing is still pending, so local developer-mode install is the current path.',
    href: '#local-install',
    cta: 'Local install steps',
  },
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
                  <Link href="#setup-flow" className="btn btn-primary btn-lg w-full sm:w-auto gap-2.5">
                  <ChromeIcon />
                    View setup flow
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

            <div className="grid gap-4 md:grid-cols-3 mb-6">
              {installChoices.map((choice) => (
                <Link key={choice.title} href={choice.href} className="landing-start-card panel p-5">
                  <p className="landing-start-kicker">Extension</p>
                  <h2 className="text-lg font-display font-semibold text-gray-900 mt-3">{choice.title}</h2>
                  <p className="text-sm text-gray-600 leading-relaxed mt-3 max-w-none">{choice.description}</p>
                  <span className="mt-5 inline-flex text-sm font-medium text-vigil-700">{choice.cta} →</span>
                </Link>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] items-stretch">
              <div className="panel p-6 md:p-7">
                <div className="rounded-[28px] border border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(246,242,236,0.88))] p-5 md:p-6 text-left shadow-[0_18px_50px_rgba(31,41,55,0.08)]">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80">Setup facts</p>
                      <h2 className="mt-3 text-2xl font-display font-semibold text-gray-900">Everything the extension changes, and everything it does not.</h2>
                    </div>
                    <p className="max-w-xl text-sm text-gray-600 leading-relaxed">
                      This flow is intentionally narrow. The extension helps you wire forwarding into Gmail or Outlook, then your provider takes over delivery to Vigil.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-3">
                    {setupHighlights.map((highlight) => (
                      <SetupHighlightCard
                        key={highlight.label}
                        label={highlight.label}
                        value={highlight.value}
                        detail={highlight.detail}
                      />
                    ))}
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
                    <div className="panel-inset rounded-2xl p-5 md:p-6">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-vigil-700/80">How setup works</p>
                        <span className="badge">Forwarding only</span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {setupFacts.map((fact) => (
                          <SetupFactCard
                            key={fact.eyebrow}
                            eyebrow={fact.eyebrow}
                            title={fact.title}
                            detail={fact.detail}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="panel-inset rounded-2xl p-5 md:p-6">
                      <p className="text-xs uppercase tracking-[0.18em] text-vigil-700/80">Before you start</p>
                      <ul className="mt-4 space-y-3">
                        {setupChecklist.map((item, index) => (
                          <li key={item} className="flex items-start gap-3">
                            <StepBadge className="h-7 w-7 text-xs shrink-0">{index + 1}</StepBadge>
                            <span className="pt-1 text-sm text-gray-700 leading-relaxed">{item}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-5 rounded-2xl border border-black/5 bg-white/75 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-vigil-700/80">Best order</p>
                        <p className="mt-2 text-sm text-gray-700 leading-relaxed max-w-none">
                          Create account, make a watcher, then open the extension and let it wire forwarding into Gmail or Outlook.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <BoundaryCard
                      title="What it does"
                      items={setupBoundaries.does}
                      summary="It is a guided setup assistant for forwarding. Nothing more, and that is the point."
                    />
                    <BoundaryCard
                      title="What it does not do"
                      items={setupBoundaries.doesNot}
                      summary="Vigil processes forwarded email server-side. The extension only helps you configure the forwarding rule."
                    />
                  </div>
                </div>
              </div>

              <div className="panel p-6 md:p-7 flex flex-col justify-between gap-6">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80 mb-3">Before you install</p>
                  <h2 className="text-2xl font-display font-semibold text-gray-900 mb-3">This is a setup helper, not an inbox integration.</h2>
                  <p className="text-sm md:text-base text-gray-600 leading-relaxed max-w-none">
                    Vigil does not connect to your inbox. Forwarding keeps the architecture simple: your provider sends mail to Vigil,
                    Vigil reads it, remembers what matters, and alerts you only when something needs attention.
                  </p>
                </div>

                <div className="grid gap-3">
                  <MiniStat value="1" label="Create one watcher before opening the extension" />
                  <MiniStat value="30 sec" label="Typical setup time once the watcher exists" />
                  <MiniStat value="0" label="Inbox permissions requested" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="setup-flow" className="landing-section px-6 lg:px-8 mt-18 scroll-mt-28">
          <div className="max-w-6xl mx-auto">
            <div className="landing-section-header text-center items-center mx-auto mb-10">
              <div className="landing-section-kicker">Setup Flow</div>
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

        <section id="local-install" className="landing-section px-6 lg:px-8 mt-18 scroll-mt-28">
          <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[0.95fr_1.05fr] items-start">
            <div className="panel p-6 md:p-7">
              <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80 mb-3">Local Install</p>
              <h2 className="text-2xl font-display font-semibold text-gray-900 mb-3">Load it in Chrome while the Web Store listing is pending.</h2>
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
                    <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80 mb-3">Start Order</p>
                    <h2 className="text-2xl font-display font-semibold text-gray-900 mb-3">Create the watcher first, then use the extension.</h2>
                    <p className="text-sm md:text-base text-gray-600 leading-relaxed max-w-none">
                      The setup flow is faster when your watcher already exists. Create one first, then use the extension to wire forwarding in.
                    </p>
                  </div>
                  <div className="panel-inset rounded-md p-5 md:p-6 flex flex-col justify-center">
                    <p className="text-sm uppercase tracking-[0.2em] text-vigil-700/80 mb-2">Start free</p>
                    <p className="text-3xl font-display font-semibold text-gray-900 mb-2">50 emails free each month</p>
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

function SetupFactCard({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/78 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
      <p className="text-[11px] uppercase tracking-[0.18em] text-vigil-700/80">{eyebrow}</p>
      <p className="text-sm font-semibold text-gray-900 mt-2 max-w-none">{title}</p>
      <p className="text-sm text-gray-600 mt-2 leading-relaxed max-w-none">{detail}</p>
    </div>
  );
}

function SetupHighlightCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/82 px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-vigil-700/80">{label}</p>
      <p className="mt-2 text-xl font-display font-semibold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-600 leading-relaxed max-w-none">{detail}</p>
    </div>
  );
}

function BoundaryCard({
  title,
  items,
  summary,
}: {
  title: string;
  items: string[];
  summary: string;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-[rgba(255,255,255,0.72)] px-5 py-5">
      <p className="text-xs uppercase tracking-[0.18em] text-vigil-700/80">{title}</p>
      <ul className="mt-4 space-y-3 text-sm text-gray-600">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <span className="mt-0.5 text-vigil-700">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm leading-relaxed text-gray-600 max-w-none">{summary}</p>
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="panel-inset rounded-md px-4 py-4">
      <div className="text-xs uppercase tracking-[0.18em] text-vigil-700/80">{value}</div>
      <div className="text-sm text-gray-700 mt-2 max-w-none">{label}</div>
    </div>
  );
}

function StepCard({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="panel p-6 flex flex-col gap-4 h-full">
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
  const detail = tone === 'ok' ? 'Ready in the extension today' : 'Manual forwarding still works';

  return (
    <div className="panel-inset rounded-md p-5 text-center h-full">
      <div className="text-base font-display font-semibold text-gray-900">{name}</div>
      <div className="mt-3">
        <span className={badgeClass}>{status}</span>
      </div>
      <p className="text-sm text-gray-500 mt-3 max-w-none">{detail}</p>
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