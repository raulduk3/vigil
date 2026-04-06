'use client';

import Link from 'next/link';
import { PublicHeader, Footer } from '@/components/layout';
import { StepList } from '@/components/learn';

const extensionSourceUrl = 'https://github.com/raulduk3/vigil/tree/main/chrome-extension';

const setupSteps = [
  {
    title: 'Sign in and pick a watcher',
    description: 'Open the extension, sign in with your Vigil account or API key, then choose the watcher that should receive forwarded mail.',
  },
  {
    title: 'Open your provider settings',
    description: 'The extension detects Gmail or Outlook and sends you straight to the forwarding screen instead of making you hunt for it.',
  },
  {
    title: 'Paste the forwarding address',
    description: 'Copy the Vigil forwarding address into your provider settings. If Gmail asks for confirmation, Vigil pulls the code for you.',
  },
  {
    title: 'You are done',
    description: 'Once forwarding is saved, your provider handles delivery natively. The extension is out of the path.',
  },
];

const installSteps = [
  {
    title: 'Download and unzip the extension',
    description: 'Grab the ZIP and extract it somewhere easy to find on your computer.',
  },
  {
    title: 'Open chrome://extensions and enable Developer mode',
    description: 'Chrome only allows local extension installs through the extensions page.',
  },
  {
    title: 'Click Load unpacked and pick the folder',
    description: 'Once Chrome loads it, the Vigil icon appears in your toolbar and setup starts from there.',
  },
];

const guarantees = [
  'No inbox OAuth or inbox access',
  'No email body storage',
  'No background monitoring after setup',
  'No analytics or tracking',
];

const essentials = [
  'Works with Gmail and Outlook today.',
  'Gmail confirmation retrieval is handled for you.',
  'Forwarding happens at the provider level, not through the extension.',
];

export default function ExtensionPage() {
  return (
    <div className="min-h-screen bg-surface-page text-gray-700">
      <PublicHeader />

      <main className="pt-24 md:pt-28 pb-20">
        <section className="px-6 lg:px-8">
          <div className="site-shell">
            <div className="max-w-3xl mx-auto text-center mb-8 md:mb-10">
              <div className="landing-section-header text-center items-center mx-auto gap-3 md:gap-4">
                <div className="landing-section-kicker">Chrome Extension</div>
                <h1 className="text-4xl md:text-6xl font-display font-semibold text-gray-900 tracking-tight leading-[1.05] text-balance">
                  Set up forwarding without touching email OAuth.
                </h1>
                <p className="landing-hero-copy text-lg md:text-xl text-gray-700 leading-relaxed">
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
                Vigil does not connect to your inbox. The extension just gets forwarding configured in Gmail or Outlook, then your provider sends mail to Vigil normally.
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr,0.8fr]">
                <div className="panel-inset rounded-lg p-5">
                  <p className="text-sm font-semibold text-gray-900 mb-3">What actually happens</p>
                  <ul className="space-y-3 text-sm text-gray-700">
                    {essentials.map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <span className="mt-0.5 text-vigil-700">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="panel-inset rounded-lg p-5">
                  <p className="text-sm font-semibold text-gray-900 mb-3">What it does not do</p>
                  <ul className="space-y-3 text-sm text-gray-700">
                    {guarantees.map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <span className="mt-0.5 text-vigil-700">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
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
          <div className="site-shell">
            <div className="landing-section-header text-center items-center mx-auto mb-10">
              <div className="landing-section-kicker">Setup Flow</div>
              <h2 className="landing-section-title max-w-none">Four clean steps.</h2>
              <p className="landing-section-copy">
                This page should read like instructions, not marketing copy. Install it, sign in, turn on forwarding, done.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
              <div className="panel p-6 md:p-7">
                <StepList steps={setupSteps} />
              </div>

              <div className="panel p-6 md:p-7">
                <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80">Before you start</p>
                <h3 className="mt-3 text-xl font-display font-semibold text-gray-900">You only need three things.</h3>
                <ul className="mt-5 space-y-3 text-sm text-gray-700 leading-relaxed">
                  <li className="flex items-start gap-2.5"><span className="mt-0.5 text-vigil-700">•</span><span>A Vigil account or API key</span></li>
                  <li className="flex items-start gap-2.5"><span className="mt-0.5 text-vigil-700">•</span><span>A watcher to receive forwarded mail</span></li>
                  <li className="flex items-start gap-2.5"><span className="mt-0.5 text-vigil-700">•</span><span>Gmail or Outlook open in Chrome</span></li>
                </ul>

                <div className="mt-6 panel-inset rounded-lg p-4">
                  <p className="font-semibold text-gray-900 text-sm">Expected time</p>
                  <p className="text-sm text-gray-600 mt-1">Usually under 30 seconds once the extension is installed.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="local-install" className="landing-section px-6 lg:px-8 mt-18 scroll-mt-28">
          <div className="site-shell flex flex-col gap-6 items-stretch">
            <div className="panel p-6 md:p-7">
              <p className="text-[11px] uppercase tracking-[0.22em] text-vigil-700/80 mb-3">Install in Chrome</p>
              <h2 className="text-2xl font-display font-semibold text-gray-900 mb-3">Three steps. Under a minute.</h2>
              <p className="text-sm md:text-base text-gray-600 leading-relaxed mb-6 max-w-none">
                Chrome local installs are simple once you know the path.
              </p>

              <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
                <div className="panel-inset rounded-lg p-5">
                  <StepList steps={installSteps} />
                </div>

                <div className="space-y-4">
                  <div className="panel-inset rounded-lg p-5">
                    <p className="font-semibold text-gray-900 text-sm">1. Download the ZIP</p>
                    <p className="text-sm text-gray-600 mt-1">Unzip it somewhere easy to find before you open Chrome extensions.</p>
                    <a href="/vigil-chrome-extension.zip" download className="btn btn-primary btn-sm mt-3 inline-flex gap-2">
                      <ChromeIcon /> Download ZIP
                    </a>
                  </div>

                  <div className="panel-inset rounded-lg p-5">
                    <p className="font-semibold text-gray-900 text-sm">2. Copy the Chrome URL</p>
                    <p className="text-sm text-gray-600 mt-1">Paste this into your address bar. Chrome does not let websites open it directly.</p>
                    <a href="chrome://extensions" onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText('chrome://extensions'); }} className="btn btn-secondary btn-sm mt-3 inline-flex gap-2">
                      Copy chrome://extensions
                    </a>
                  </div>

                  <div className="panel rounded-lg p-5">
                    <p className="font-semibold text-gray-900 text-sm mb-2">You&apos;re installed.</p>
                    <p className="text-sm text-gray-600 leading-relaxed max-w-none">
                      Click the Vigil icon in your toolbar, sign in, and let the extension walk you through forwarding setup.
                      If you don&apos;t have an account yet, <Link href="/auth/register" className="text-vigil-700 hover:underline">create one free</Link> first.
                    </p>
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