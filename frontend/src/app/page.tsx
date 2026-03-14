'use client';
import Link from 'next/link';
import { PublicHeader, Footer } from '@/components/layout';
import { useEffect, useRef, useState } from 'react';

const heroPromptSamples = [
  'Watch my work emails and text me when a client is waiting.',
  'Track invoices and alert me before anything goes overdue.',
  'Monitor support requests and send urgent ones to Slack.',
];

function useScrollReveal() {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = (entry.target as HTMLElement).id;
          if (!id) return;
          if (entry.isIntersecting) {
            setRevealed((prev) => new Set(prev).add(id));
            observerRef.current?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px -50px 0px' }
    );
    const elements = document.querySelectorAll('[data-reveal]');
    elements.forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);
  return (id: string) => revealed.has(id);
}

function Section({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={className}>
      <div className="max-w-6xl mx-auto px-6 lg:px-8">{children}</div>
    </section>
  );
}

function SectionHeader({ eyebrow, title, description, align = 'left' }: { eyebrow: string; title: string; description: string; align?: 'left' | 'center' }) {
  const cls = align === 'center' ? 'text-center items-center mx-auto' : 'text-left items-start';
  return (
    <div className={`landing-section-header ${cls}`}>
      <div className="landing-section-kicker">{eyebrow}</div>
      <h2 className="landing-section-title" style={{ wordSpacing: '0.08em' }}>{title}</h2>
      <p className="landing-section-copy">{description}</p>
    </div>
  );
}

export default function HomePage() {
  const isRevealed = useScrollReveal();
  const [intent, setIntent] = useState('');
  const [heroPromptIndex, setHeroPromptIndex] = useState(0);

  useEffect(() => {
    if (intent) return;
    const interval = window.setInterval(() => {
      setHeroPromptIndex((current) => (current + 1) % heroPromptSamples.length);
    }, 2600);
    return () => window.clearInterval(interval);
  }, [intent]);

  return (
    <div className="min-h-screen bg-surface-page">
      <svg aria-hidden="true" className="absolute w-0 h-0">
        <defs>
          <filter id="noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="discrete" tableValues="0 0 0 0.05 0" />
            </feComponentTransfer>
            <feBlend mode="multiply" in="SourceGraphic" />
          </filter>
        </defs>
      </svg>

      <PublicHeader />

      {/* Hero */}
      <header className="pt-36 pb-14 md:pt-44 md:pb-16 relative overflow-hidden bg-surface-page z-[2]">
        <div aria-hidden="true" className="hero-texture absolute inset-0 z-0" style={{ backgroundImage: 'url(/hero-texture.png)', backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', opacity: 0.19 }} />
        <div className="absolute inset-0 z-0 bg-[#E5E5E6]/10" />
        <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-[#E5E5E6]/35 via-[#E5E5E6]/20 to-transparent" />

        <div className="max-w-6xl mx-auto px-6 lg:px-8 relative z-10">
          <div className="relative max-w-5xl mx-auto text-center">
            <p className="text-base font-medium text-vigil-700 mb-5 uppercase tracking-wider">
              AI email agent · Pay per use · No inbox access
            </p>
            <h1 className="text-5xl md:text-6xl font-display font-semibold text-gray-900 tracking-tight mb-7 text-balance leading-[1.1]" style={{ wordSpacing: '0.08em' }}>
              An AI agent that reads<br />
              your email and acts on it.
            </h1>
            <p className="landing-hero-copy text-xl text-gray-600 mb-8 leading-relaxed mx-auto">
              Forward an email. Your agent reads it, remembers what matters, and does
              whatever you told it to do. Send a text. Fire a webhook. Connect to another system.
              Prompt it like you&apos;d prompt anything else. It works for you.
            </p>
            <div className="mt-10 w-full max-w-4xl mx-auto">
              <div className="hero-prompt-suggestion mb-3 min-h-12 md:min-h-10">
                <span className="text-[11px] md:text-xs uppercase tracking-[0.24em] text-vigil-700/70">Try this</span>
                <p key={heroPromptIndex} className="hero-prompt-copy mt-2 text-sm md:text-base text-gray-500">
                  {heroPromptSamples[heroPromptIndex]}
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const encoded = encodeURIComponent(intent.trim());
                  window.location.href = encoded ? `/auth/register?intent=${encoded}` : '/auth/register';
                }}
                className="hero-prompt-shell panel p-2 flex flex-col gap-2 md:flex-row md:items-stretch"
              >
                <div className="relative flex-1">
                  <input type="text" value={intent} onChange={(e) => setIntent(e.target.value)}
                    placeholder="What do you want Vigil to watch?"
                    className="hero-prompt-input w-full bg-transparent px-4 py-4 text-base md:text-lg text-gray-900 outline-none" />
                </div>
                <button type="submit" className="btn btn-primary py-4 px-8 text-base md:min-w-[12rem] shrink-0">
                  Get started free
                </button>
              </form>
              <p className="text-sm text-gray-400 mt-3 text-center">50 emails free every month. No credit card needed.</p>
            </div>

            {/* Quick-start steps under the hero */}
            <div className="mt-8 grid gap-3 sm:grid-cols-3 text-left max-w-3xl mx-auto">
              <Link href="/auth/register" className="panel p-4 group hover:-translate-y-0.5 transition-transform">
                <p className="text-[11px] uppercase tracking-[0.2em] text-vigil-700/70 font-medium">Step 1</p>
                <p className="text-sm font-semibold text-gray-900 mt-1.5">Create an account</p>
                <p className="text-xs text-gray-500 mt-1">Name a watcher. Get a forwarding address.</p>
              </Link>
              <Link href="/extension" className="panel p-4 group hover:-translate-y-0.5 transition-transform">
                <p className="text-[11px] uppercase tracking-[0.2em] text-vigil-700/70 font-medium">Step 2</p>
                <p className="text-sm font-semibold text-gray-900 mt-1.5">Connect your email</p>
                <p className="text-xs text-gray-500 mt-1">Chrome extension or manual forwarding.</p>
              </Link>
              <div className="panel p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-vigil-700/70 font-medium">Step 3</p>
                <p className="text-sm font-semibold text-gray-900 mt-1.5">Done</p>
                <p className="text-xs text-gray-500 mt-1">Vigil reads quietly. Alerts are the exception.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Hero demo */}
        <div className="relative z-10 mt-12 md:mt-16 mb-8 mx-auto w-full max-w-[96rem] px-3 sm:px-5 lg:px-8">
          <div className="panel hero-demo-stage w-full overflow-hidden p-1.5">
            <div className="hero-demo-surface relative aspect-[16/10] md:aspect-[16/8.8] overflow-hidden rounded-md">
              <div className="hero-demo-grid absolute inset-0" />
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/55 via-white/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#d4dde0]/85 via-[#d4dde0]/25 to-transparent" />
              <div className="relative z-10 flex h-full flex-col justify-between p-5 md:p-8 lg:p-10">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.24em] text-vigil-700/80">What it looks like</p>
                    <p className="text-sm md:text-base text-gray-600 mt-1">Forward, analyze, remember, decide.</p>
                  </div>
                  <div className="hero-demo-pill rounded-full px-3 py-1.5 text-[11px] md:text-xs font-medium text-vigil-800">No inbox access</div>
                </div>
                <div className="grid gap-4 md:grid-cols-[1.45fr_0.85fr] md:gap-6 lg:gap-8 items-end">
                  <div className="hero-demo-window rounded-[1.1rem] p-3 md:p-4 lg:p-5">
                    <div className="flex items-center gap-2 mb-3 md:mb-4">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#c96e61]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#d7b45d]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#7faa73]" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-[0.95fr_1.3fr]">
                      <div className="rounded-xl bg-white/72 p-3 md:p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500 mb-2">Watcher</p>
                        <p className="text-sm md:text-base font-semibold text-gray-900">Vendor follow-up</p>
                        <p className="text-xs md:text-sm text-gray-600 mt-2">Prompts, webhooks, and memory all configured per watcher.</p>
                      </div>
                      <div className="rounded-xl bg-[#0d202c] p-4 md:p-5 text-left shadow-[0_12px_40px_rgba(11,31,42,0.18)]">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-vigil-300 mb-2">Email analysis</p>
                        <p className="text-sm md:text-base text-white font-medium">Invoice 4521 is due tomorrow. Alert Richard and POST to accounting webhook.</p>
                        <div className="mt-4 space-y-2 text-xs md:text-sm text-vigil-200/90">
                          <p>Summary: Vendor invoice requires immediate attention.</p>
                          <p>Memory surfaced: Payment normally lands on the 14th.</p>
                          <p>Action: Send alert + trigger overdue prevention workflow.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 md:space-y-4">
                    <div className="hero-float-card hero-float-card-delay-1 rounded-2xl p-4 md:p-5">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500 mb-2">Thread state</p>
                      <p className="text-sm md:text-base text-gray-900 font-medium">3 emails grouped, 1 new obligation detected.</p>
                    </div>
                    <div className="hero-float-card hero-float-card-delay-2 rounded-2xl p-4 md:p-5">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500 mb-2">Agent output</p>
                      <p className="text-sm md:text-base text-gray-900 font-medium">Text notification queued. Webhook payload prepared.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
      </header>

      {/* What you get */}
      <Section id="what-you-get" className="landing-section py-16 md:py-20">
        <div className="mb-10" data-reveal id="wyg-header" style={{ opacity: 0, animation: isRevealed('wyg-header') ? 'slideUpIn 0.6s ease-out forwards' : 'none' }}>
          <div className="landing-section-header text-left items-start">
            <div className="landing-section-kicker">What you get</div>
            <h2 className="landing-section-title" style={{ wordSpacing: '0.08em' }}>An agent that earns its keep on the first email.</h2>
            <p className="landing-section-copy">Every email is analyzed, threaded, and remembered. Most stay quiet. The ones that matter surface.</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: 'Reads and summarizes', desc: 'Every forwarded email gets a structured analysis. Summary, sender intent, urgency, key entities. Stored as a thread update, not a notification.' },
            { title: 'Remembers across emails', desc: 'The agent builds memory over time. Vendor payment patterns, response times, recurring topics. Context surfaces automatically for future decisions.' },
            { title: 'Alerts only when it matters', desc: 'Most emails end as quiet updates. When a deadline is inside 24 hours or a thread has gone cold, Vigil sends one email or fires one webhook.' },
          ].map((item, idx) => (
            <div key={item.title} data-reveal id={`wyg-${idx}`} className="panel p-6 opacity-0" style={{ animation: isRevealed(`wyg-${idx}`) ? `slideUpIn 0.6s ease-out ${0.1 + idx * 0.06}s forwards` : 'none' }}>
              <h3 className="font-semibold text-gray-900 mb-3">{item.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Privacy */}
      <Section className="landing-section landing-section-banded border-y border-gray-200 py-14 md:py-18">
        <div className="max-w-3xl">
          <div className="landing-section-kicker">Privacy</div>
          <h2 className="landing-section-title mt-3" style={{ wordSpacing: '0.08em' }}>No inbox access. No stored bodies. No OAuth.</h2>
          <p className="text-base text-gray-600 mt-4 leading-relaxed">
            Vigil works through forwarding rules you set up yourself. It never connects to your email account.
            Email bodies are processed in memory and discarded. Only a SHA-256 hash proves receipt.
            If you delete the forwarding rule, Vigil sees nothing more.
          </p>
          <div className="mt-6 flex gap-4">
            <Link href="/privacy" className="text-sm text-vigil-700 font-medium hover:text-vigil-800">Privacy policy →</Link>
            <Link href="/learn/security" className="text-sm text-vigil-700 font-medium hover:text-vigil-800">Security details →</Link>
          </div>
        </div>
      </Section>

      {/* Use cases */}
      <Section id="use-cases" className="landing-section py-14 md:py-20">
        <div className="mb-8">
          <div className="landing-section-header text-left items-start">
            <div className="landing-section-kicker">Use cases</div>
            <h2 className="landing-section-title" style={{ wordSpacing: '0.08em' }}>One watcher per context. Each learns independently.</h2>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { title: 'Vendor follow-up', desc: 'Track invoices. Flag overdue payments. Webhook to accounting.' },
            { title: 'Client communications', desc: 'Know when conversations go cold. Slack when a client is waiting.' },
            { title: 'Ops and alerts', desc: 'Read ops email. Only escalate what clears your bar.' },
            { title: 'Bills and deadlines', desc: 'Remember payment patterns. Fire before deadlines slip.' },
            { title: 'Freelancers', desc: 'One watcher per client. Each tracks obligations independently.' },
            { title: 'Your own prompt', desc: 'Write the instructions. Connect the tools. Your agent.' },
          ].map((item) => (
            <div key={item.title} className="panel-inset rounded-md p-4">
              <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Link href="/auth/register" className="btn btn-primary">Create your first watcher</Link>
        </div>
      </Section>

      {/* Pricing */}
      <Section className="landing-section landing-section-banded border-y border-gray-200 py-14 md:py-18">
        <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-8 items-center">
          <div>
            <div className="landing-section-kicker">Pricing</div>
            <h2 className="landing-section-title mt-3" style={{ wordSpacing: '0.08em' }}>Half a cent per email. That&apos;s it.</h2>
            <p className="text-base text-gray-600 mt-4 leading-relaxed">
              50 emails free every month. After that, half a cent per email Vigil processes.
              No tiers. No seat pricing. No annual contracts. No token math.
            </p>
            <div className="mt-6 flex gap-4">
              <Link href="/auth/register" className="btn btn-primary">Start free</Link>
              <Link href="/pricing" className="text-sm text-vigil-700 font-medium hover:text-vigil-800 flex items-center">Full pricing details →</Link>
            </div>
          </div>
          <div className="panel p-6 space-y-3">
            {[
              ['50 free emails', 'Every month, no card needed'],
              ['$0.005 per email', 'Half a cent per processed email'],
              ['Alerts included', 'No extra charge for notifications'],
              ['Unlimited watchers', 'As many email streams as you need'],
            ].map(([label, desc]) => (
              <div key={label} className="flex items-start gap-3">
                <svg className="w-4 h-4 text-status-ok flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Docs */}
      <Section id="docs" className="landing-section py-14 md:py-18">
        <div className="mb-8">
          <div className="landing-section-kicker">Documentation</div>
          <h2 className="landing-section-title mt-3" style={{ wordSpacing: '0.08em' }}>Dig deeper when you want to.</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { href: '/extension', title: 'Chrome Extension', desc: '30-second setup for Gmail and Outlook.' },
            { href: '/learn/watchers', title: 'Watchers', desc: 'Prompts, tools, and alert thresholds.' },
            { href: '/learn/agent', title: 'The Agent', desc: 'Analysis, memory, and decision logic.' },
            { href: '/learn/integrations', title: 'Integrations', desc: 'REST API, webhooks, agent frameworks.' },
            { href: '/learn/memory', title: 'Memory', desc: 'How context builds across emails.' },
            { href: '/learn/email-ingestion', title: 'Email Setup', desc: 'Forwarding rules and filter setup.' },
            { href: '/learn/architecture', title: 'Architecture', desc: 'Data flow and privacy model.' },
            { href: '/learn/security', title: 'Security', desc: 'What gets stored. What gets discarded.' },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="panel p-4 hover:-translate-y-0.5 transition-transform group">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-vigil-800">{item.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
            </Link>
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <Section className="landing-section py-14 md:py-20">
        <div className="panel max-w-2xl mx-auto p-8 md:p-10 text-center">
          <h2 className="text-2xl md:text-3xl font-display font-semibold text-gray-900">Start with one email.</h2>
          <p className="text-base text-gray-600 mt-4 leading-relaxed">
            Create an account. Forward one email. See what Vigil does with it. If it&apos;s useful, forward more.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/register" className="btn btn-primary btn-lg">Create free account</Link>
            <Link href="/extension" className="btn btn-secondary btn-lg">Chrome extension</Link>
          </div>
          <p className="text-xs text-gray-400 mt-4">No credit card. No inbox access. Cancel by deleting the forwarding rule.</p>
        </div>
      </Section>

      <Footer />
    </div>
  );
}
