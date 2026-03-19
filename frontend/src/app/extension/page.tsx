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

const essentials = [
  'Works with Gmail and Outlook today. Yahoo is not in the guided flow yet.',
  'Create the watcher first so the forwarding address already exists before setup starts.',
  'Open Gmail or Outlook in Chrome and the extension routes you to the correct forwarding settings.',
  'Gmail confirmation retrieval is handled for you, so you do not need to hunt through messages manually.',
  'Once forwarding is saved, your provider forwards natively and the extension is out of the path.',
];

const manualInstallSteps = [
  <>
    <a href="/vigil-chrome-extension.zip" download className="text-vigil-700 hover:text-vigil-800 hover:underline font-medium">Download the extension ZIP</a> and unzip it to a folder on your computer.
  </>,
  <>
    Open <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-2xs font-mono">chrome://extensions</code> in Chrome.
  </>,
  'Enable "Developer mode" (toggle in the top-right corner).',
  'Click "Load unpacked" and select the unzipped folder.',
  'The Vigil icon appears in your toolbar. Click it to sign in and start setup.',
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
                <a href="/vigil-chrome-extension.zip" download className="btn btn-primary btn-lg w-full sm:w-auto gap-2.5">
                  <ChromeIcon />
                  Download extension (.zip)
                </a>
                <Link href="/auth/register" className="btn btn-secondary btn-lg w-full sm:w-auto">
                  Create free account
                </Link>
              </div>

              <p className="mt-3 text-sm text-gray-500">
                Download the ZIP, unpack it, and load it in Chrome. <a href="#local-install" className="text-vigil-700 hover:underline">See install steps below.</a>
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 text-xs sm:text-sm text-gray-500">
                <span className="badge badge-ok">Gmail</span>
                <span className="badge badge-ok">Outlook</span>
                <span className="badge">Chrome compatible</span>
                <span className="badge">Zero inbox access</span>
              </div>
            </div>

            <div className="panel p-6 md:p-7 text-left">
              <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80">Essentials</p>
              <h2 className="mt-3 text-2xl font-display font-semibold text-gray-900">Simple forwarding setup, no inbox integration.</h2>
              <p className="mt-3 text-sm md:text-base text-gray-600 leading-relaxed max-w-none">
                Vigil does not connect to your inbox. The extension only helps configure forwarding in Gmail or Outlook, then your provider sends mail to Vigil normally.
              </p>

              <ul className="mt-6 space-y-4">
                {essentials.map((item) => (
                  <li key={item} className="border-l-2 border-vigil-200 pl-4 text-sm text-gray-700 leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-6 border-t border-black/5 pt-6">
                <p className="text-sm font-semibold text-gray-900">What it does not do</p>
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  {guarantees.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <span className="mt-0.5 text-vigil-700">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/auth/register" className="btn btn-secondary">
                  Create account
                </Link>
                <Link href="/learn/email-ingestion" className="btn btn-ghost">
                  Read setup docs
                </Link>
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

            <div className="flex flex-col gap-4">
              {setupSteps.map((step) => (
                <StepCard key={step.num} num={step.num} title={step.title} desc={step.desc} />
              ))}
            </div>
          </div>
        </section>

        <section id="local-install" className="landing-section px-6 lg:px-8 mt-18 scroll-mt-28">
          <div className="max-w-6xl mx-auto flex flex-col gap-6 items-stretch">
            <div className="panel p-6 md:p-7">
              <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80 mb-3">Install in Chrome</p>
              <h2 className="text-2xl font-display font-semibold text-gray-900 mb-3">Three steps. Under a minute.</h2>
              <p className="text-sm md:text-base text-gray-600 leading-relaxed mb-6 max-w-none">
                Chrome extensions can be installed locally in developer mode. No Web Store required.
              </p>

              <div className="panel-inset rounded-lg p-5 mb-6">
                <div className="flex items-start gap-4">
                  <StepBadge className="h-8 w-8 text-sm shrink-0">1</StepBadge>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Download and unzip</p>
                    <p className="text-sm text-gray-600 mt-1">Download the extension and unzip it to a folder on your computer.</p>
                    <a href="/vigil-chrome-extension.zip" download className="btn btn-primary btn-sm mt-3 inline-flex gap-2">
                      <ChromeIcon /> Download ZIP
                    </a>
                  </div>
                </div>
              </div>

              <div className="panel-inset rounded-lg p-5 mb-6">
                <div className="flex items-start gap-4">
                  <StepBadge className="h-8 w-8 text-sm shrink-0">2</StepBadge>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Open Chrome Extensions</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Open the extensions page and enable <strong>Developer mode</strong> using the toggle in the top-right corner.
                    </p>
                    <a href="chrome://extensions" onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText('chrome://extensions'); }} className="btn btn-secondary btn-sm mt-3 inline-flex gap-2">
                      Copy chrome://extensions
                    </a>
                    <p className="text-xs text-gray-400 mt-2">Paste this into your Chrome address bar. Links to chrome:// pages cannot be opened directly.</p>
                  </div>
                </div>
              </div>

              <div className="panel-inset rounded-lg p-5 mb-6">
                <div className="flex items-start gap-4">
                  <StepBadge className="h-8 w-8 text-sm shrink-0">3</StepBadge>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Load the extension</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Click <strong>&ldquo;Load unpacked&rdquo;</strong> in the top-left of the extensions page. Select the unzipped folder. The Vigil icon appears in your toolbar.
                    </p>
                  </div>
                </div>
              </div>

              <div className="panel p-5">
                <p className="font-semibold text-gray-900 text-sm mb-2">You&apos;re installed.</p>
                <p className="text-sm text-gray-600 leading-relaxed max-w-none">
                  Click the Vigil icon in your toolbar to open the side panel. Sign in with your Vigil account or API key. 
                  If you don&apos;t have an account yet, <Link href="/auth/register" className="text-vigil-700 hover:underline">create one free</Link> first.
                  The extension walks you through creating a watcher and connecting your email automatically.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
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