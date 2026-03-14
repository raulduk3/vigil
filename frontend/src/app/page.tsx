'use client';
import Link from 'next/link';
import { PublicHeader } from '@/components/layout';
import { useEffect, useRef, useState } from 'react';

const heroPromptSamples = [
  'Watch my work emails and text me when a client is waiting.',
  'Track invoices and alert me before anything goes overdue.',
  'Monitor support requests and send urgent ones to Slack.',
];

// Hook for scroll reveal animations
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

function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'left',
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: 'left' | 'center';
}) {
  const alignmentClass = align === 'center' ? 'text-center items-center mx-auto' : 'text-left items-start';

  return (
    <div className={`landing-section-header ${alignmentClass}`}>
      <div className="landing-section-kicker">{eyebrow}</div>
      <h2 className="landing-section-title" style={{ wordSpacing: '0.08em' }}>
        {title}
      </h2>
      <p className="landing-section-copy">{description}</p>
    </div>
  );
}

export default function HomePage() {
  const isRevealed = useScrollReveal();
  const [intent, setIntent] = useState('');
  const [heroPromptIndex, setHeroPromptIndex] = useState(0);

  useEffect(() => {
    if (intent) {
      return;
    }

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
        <div
          aria-hidden="true"
          className="hero-texture absolute inset-0 z-0"
          style={{
            backgroundImage: 'url(/hero-texture.png)',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            opacity: 0.19,
          }}
        />
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
            <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-3xl mx-auto">
              Forward an email. Your agent reads it, remembers what matters, and does
              whatever you told it to do. Send a text. Fire a webhook. Connect to another system.
              Prompt it like you'd prompt anything else. It works for you.
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
                  const encodedIntent = encodeURIComponent(intent.trim());
                  if (encodedIntent) {
                    window.location.href = `/auth/register?intent=${encodedIntent}`;
                  }
                }}
                className="hero-prompt-shell panel p-2 flex flex-col gap-2 md:flex-row md:items-stretch"
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={intent}
                    onChange={(event) => setIntent(event.target.value)}
                    placeholder="What do you want Vigil to watch?"
                    aria-label="Describe what you want Vigil to watch"
                    className="hero-prompt-input w-full bg-transparent px-4 py-4 text-base md:text-lg text-gray-900 outline-none"
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary py-4 px-8 text-base md:min-w-[12rem] shrink-0">
                  Start watching →
                </button>
              </form>
              <p className="text-sm text-gray-400 mt-3 text-center">Free to start. 50 emails on us. No credit card needed.</p>
            </div>

            <div className="flex items-center justify-center gap-4 mt-5">
              <a href="#how-it-works" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                How it works ↓
              </a>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-12 md:mt-16 mb-8 mx-auto w-full max-w-[96rem] px-3 sm:px-5 lg:px-8">
          <div className="panel hero-demo-stage w-full overflow-hidden p-1.5">
            <div className="hero-demo-surface relative aspect-[16/10] md:aspect-[16/8.8] overflow-hidden rounded-md">
              <div className="hero-demo-grid absolute inset-0" />
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/55 via-white/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#d4dde0]/85 via-[#d4dde0]/25 to-transparent" />

              <div className="relative z-10 flex h-full flex-col justify-between p-5 md:p-8 lg:p-10">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.24em] text-vigil-700/80">Live product demo</p>
                    <p className="text-sm md:text-base text-gray-600 mt-1">Full workflow view: ingest, analyze, remember, alert.</p>
                  </div>
                  <div className="hero-demo-pill rounded-full px-3 py-1.5 text-[11px] md:text-xs font-medium text-vigil-800">
                    Coming soon
                  </div>
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

      {/* How It Works */}
      <Section id="how-it-works" className="landing-section py-14 md:py-20">
        <div className="mb-8 md:mb-12" data-reveal id="hiw-header" style={{ opacity: 0, animation: isRevealed('hiw-header') ? 'slideUpIn 0.6s ease-out forwards' : 'none' }}>
          <SectionHeader
            eyebrow="How it works"
            title="Analyze. Remember. Act."
            description="Set up a forwarding rule. Your agent reads each email, builds context across conversations, and alerts you only when something needs action."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <div data-reveal id="hiw-1" className="landing-step-card panel p-7 flex flex-col opacity-0" style={{ animation: isRevealed('hiw-1') ? 'slideUpIn 0.6s ease-out 0.1s forwards' : 'none' }}>
            <div className="flex items-center gap-4 mb-5">
              <span className="landing-step-index">1</span>
              <h3 className="text-lg font-semibold text-gray-900">Forward emails</h3>
            </div>
            <p className="text-base text-gray-600 leading-relaxed mb-5 flex-grow">
              Create a forwarding rule in Gmail or Outlook. Important emails go to your
              Vigil watcher address. You control exactly what the agent sees.
            </p>
            <div className="panel-inset p-5 rounded-md">
              <p className="font-mono text-sm text-gray-500 mb-1">Forward to:</p>
              <p className="font-mono text-base text-vigil-700">work-a7f3k9@vigil.run</p>
            </div>
          </div>

          <div data-reveal id="hiw-2" className="landing-step-card panel p-7 flex flex-col opacity-0" style={{ animation: isRevealed('hiw-2') ? 'slideUpIn 0.6s ease-out 0.2s forwards' : 'none' }}>
            <div className="flex items-center gap-4 mb-5">
              <span className="landing-step-index">2</span>
              <h3 className="text-lg font-semibold text-gray-900">Agent analyzes</h3>
            </div>
            <p className="text-base text-gray-600 leading-relaxed mb-5 flex-grow">
              The AI agent reads the email, groups it into a conversation thread,
              extracts what matters, and stores relevant context in its memory.
              The email body is then discarded.
            </p>
            <div className="panel-inset p-5 rounded-md space-y-2">
              <div className="flex items-center gap-2">
                <span className="badge badge-sm badge-ok">analyzed</span>
                <span className="text-sm text-gray-600">Invoice #4521 — $5,000 due Mar 10</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge badge-sm badge-neutral">memory</span>
                <span className="text-sm text-gray-500">Vendor payment pattern noted</span>
              </div>
            </div>
          </div>

          <div data-reveal id="hiw-3" className="landing-step-card panel p-7 flex flex-col opacity-0" style={{ animation: isRevealed('hiw-3') ? 'slideUpIn 0.6s ease-out 0.3s forwards' : 'none' }}>
            <div className="flex items-center gap-4 mb-5">
              <span className="landing-step-index">3</span>
              <h3 className="text-lg font-semibold text-gray-900">You get alerted</h3>
            </div>
            <p className="text-base text-gray-600 leading-relaxed mb-5 flex-grow">
              When something needs your attention, the agent sends an alert to your inbox.
              Urgent requests, stale threads, payment deadlines. No noise. Only signal.
            </p>
            <div className="panel-inset p-4 rounded-md">
              <p className="text-sm text-gray-500 mb-1">From: Vigil &lt;notifications@vigil.run&gt;</p>
              <p className="text-sm font-medium text-gray-900">Payment of $5,000 due tomorrow</p>
              <p className="text-sm text-gray-600 mt-1">Invoice #4521 from vendor@example.com requires immediate payment...</p>
            </div>
          </div>
        </div>
      </Section>

      {/* What makes it different */}
      <Section id="features" className="landing-section landing-section-banded border-y border-gray-200 py-14 md:py-20">
        <div className="mb-8 md:mb-12" data-reveal id="feat-header" style={{ opacity: 0, animation: isRevealed('feat-header') ? 'slideUpIn 0.6s ease-out forwards' : 'none' }}>
          <SectionHeader
            eyebrow="Why Vigil"
            title="Your agent. Your rules. Your data stays yours."
            description="Google and Microsoft help you read email. Vigil makes sure you never drop an obligation. Privacy by architecture, not policy. Configurable by design, not as an afterthought."
          />
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              icon: 'PI',
              title: 'No inbox access',
              description: 'You forward what you want watched — Vigil never connects to your email account.',
            },
            {
              icon: 'MEM',
              title: 'Persistent memory',
              description: 'The agent builds context across emails: sender patterns, recurring topics, your preferences.',
            },
            {
              icon: 'SHA',
              title: 'Bodies discarded',
              description: 'Email content is processed in memory and never stored — only a SHA-256 hash proves receipt.',
            },
            {
              icon: 'THR',
              title: 'Thread tracking',
              description: 'Conversations are grouped automatically; the agent tracks which threads are active, stale, or resolved.',
            },
            {
              icon: 'EXT',
              title: 'Extensible',
              description: 'Webhooks, APIs, external systems. The agent triggers whatever you connect. Prompt it to act on your behalf.',
            },
            {
              icon: 'CFG',
              title: 'Your agent',
              description: 'Your prompt, your rules, your model. Not a feature someone else shipped. An agent you control completely.',
            },
          ].map((feature, idx) => (
            <div
              key={feature.title}
              data-reveal
              id={`feature-${idx}`}
              className="landing-feature-card panel p-5 opacity-0"
              style={{
                animation: isRevealed(`feature-${idx}`) ? `slideUpIn 0.6s ease-out ${0.1 + idx * 0.05}s forwards` : 'none',
              }}
            >
              <div className="landing-feature-icon">{feature.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Agent capabilities */}
      <Section id="agent" className="landing-section py-14 md:py-20">
        <div className="mb-8 md:mb-12" data-reveal id="agent-header" style={{ opacity: 0, animation: isRevealed('agent-header') ? 'slideUpIn 0.6s ease-out forwards' : 'none' }}>
          <SectionHeader
            eyebrow="The agent"
            title="More than a filter. An actual agent."
            description="Not a rules engine. Not a keyword matcher. Each watcher runs an AI agent with its own prompt, memory, and tools — your agent, configured your way."
          />
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div
            data-reveal id="cap-analyze"
            className="landing-capability-card panel p-6 opacity-0"
            style={{ animation: isRevealed('cap-analyze') ? 'slideUpIn 0.6s ease-out 0.1s forwards' : 'none' }}
          >
            <h3 className="font-semibold text-gray-900 mb-3">Analyze</h3>
            <p className="text-base text-gray-600 leading-relaxed mb-4">
              Every email gets a structured analysis: summary, sender intent, urgency, and key entities.
            </p>
            <div className="panel-inset p-4 rounded-md text-sm space-y-1.5">
              <p><span className="text-gray-500">Summary:</span> <span className="text-gray-800">Request for deployment config</span></p>
              <p><span className="text-gray-500">Intent:</span> <span className="text-gray-800">Needs config file by Wednesday</span></p>
              <p><span className="text-gray-500">Urgency:</span> <span className="badge badge-sm badge-warning">high</span></p>
              <p><span className="text-gray-500">Entities:</span> <span className="text-gray-800">Cory, Wednesday, staging</span></p>
            </div>
          </div>

          <div
            data-reveal id="cap-remember"
            className="landing-capability-card panel p-6 opacity-0"
            style={{ animation: isRevealed('cap-remember') ? 'slideUpIn 0.6s ease-out 0.2s forwards' : 'none' }}
          >
            <h3 className="font-semibold text-gray-900 mb-3">Remember</h3>
            <p className="text-base text-gray-600 leading-relaxed mb-4">
              The agent builds memory over time — relevant context surfaces automatically for each new email.
            </p>
            <div className="panel-inset p-4 rounded-md text-sm space-y-1.5">
              <p className="text-gray-600">• Cory usually follows up within 24h</p>
              <p className="text-gray-600">• Vendor invoices average $2,400/mo</p>
              <p className="text-gray-600">• Client prefers Tuesday meetings</p>
              <p className="text-gray-400 text-xs mt-2">3 of 47 memories surfaced for this email</p>
            </div>
          </div>

          <div
            data-reveal id="cap-act"
            className="landing-capability-card panel p-6 opacity-0"
            style={{ animation: isRevealed('cap-act') ? 'slideUpIn 0.6s ease-out 0.3s forwards' : 'none' }}
          >
            <h3 className="font-semibold text-gray-900 mb-3">Act</h3>
            <p className="text-base text-gray-600 leading-relaxed mb-4">
              The agent doesn't just alert you. It does what you told it to do.
              Send an email. Fire a webhook. Connect to external systems.
              Anything you can reach with an API, the agent can trigger.
            </p>
            <div className="panel-inset p-4 rounded-md text-sm space-y-1.5">
              <p><span className="badge badge-sm badge-critical">alert</span> <span className="text-gray-600 ml-1">Payment overdue — notify immediately</span></p>
              <p><span className="badge badge-sm badge-warning">webhook</span> <span className="text-gray-600 ml-1">POST to Slack, Discord, or your own API</span></p>
              <p><span className="badge badge-sm badge-ok">integrate</span> <span className="text-gray-600 ml-1">Trigger a workflow in any connected system</span></p>
            </div>
          </div>
        </div>
      </Section>

      {/* Use Cases */}
      <Section id="use-cases" className="landing-section landing-section-banded border-y border-gray-200 py-14 md:py-18">
        <div className="mb-8 md:mb-10">
          <SectionHeader
            eyebrow="Use cases"
            title="Set up a watcher. Forward what matters."
            description="Each watcher is a separate agent with its own prompt, memory, and behavior. Create one per context — each learns independently."
          />
        </div>

        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            { id: 'uc-vendor', role: 'Vendor follow-up', text: 'Track invoices, flag overdue payments. Webhook to your accounting system when a payment is due.' },
            { id: 'uc-client', role: 'Client communications', text: 'Know when conversations go cold. Trigger a Slack message when a client is waiting.' },
            { id: 'uc-ops', role: 'Ops and alerts', text: 'Connect to PagerDuty, Discord, or any API. The agent reads the email and triggers the right action.' },
            { id: 'uc-billing', role: 'Bills and deadlines', text: 'The agent remembers payment patterns and fires webhooks before deadlines slip.' },
            { id: 'uc-freelance', role: 'Freelancers', text: 'One watcher per client. Each tracks obligations independently. Connect to your CRM or project tool.' },
            { id: 'uc-custom', role: 'Anything you can prompt', text: 'Write the prompt. Connect the tools. If it has an API, the agent can reach it.' },
          ].map((item, idx) => (
            <li
              key={item.id}
              data-reveal
              id={item.id}
              className="opacity-0"
              style={{ animation: isRevealed(item.id) ? `slideUpIn 0.5s ease-out ${0.1 + idx * 0.05}s forwards` : 'none' }}
            >
              <div className="landing-use-case-card panel p-5 md:p-6 h-full">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <p className="text-base md:text-lg font-semibold text-gray-900">{item.role}</p>
                  <span className="landing-use-case-arrow" aria-hidden>→</span>
                </div>
                <p className="text-sm md:text-base text-gray-700 leading-relaxed">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="text-center mt-8 md:mt-10">
          <Link href="/auth/register" className="btn btn-primary btn-lg">
            Create your first watcher
          </Link>
        </div>
      </Section>

      {/* Architecture / How it works technically */}
      <Section id="architecture" className="landing-section py-14 md:py-20">
        <div className="mb-8 md:mb-6">
          <SectionHeader
            eyebrow="Architecture"
            title="Simple by design."
            description="No OAuth. No inbox connection. No email bodies stored. Vigil works through forwarding rules you already know how to set up. The privacy model isn't a feature. It's the architecture."
          />
        </div>

        <div className="text-left mb-8 md:mb-10">
          <Link href="/learn/architecture" className="text-sm text-vigil-700 hover:text-vigil-800 font-medium">
            Read the full technical design →
          </Link>
        </div>

        <div
          data-reveal id="arch-flow"
          className="landing-architecture-shell panel p-6 md:p-8 mb-2 opacity-0"
          style={{ animation: isRevealed('arch-flow') ? 'scaleIn 0.6s ease-out forwards' : 'none' }}
        >
          <div className="landing-architecture-grid flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0">
            {[
              { icon: '01', label: 'Your email', sub: 'forwarding rule' },
              { icon: '02', label: 'Cloudflare', sub: 'receives at MX' },
              { icon: '03', label: 'Agent', sub: 'reads + decides' },
              { icon: '04', label: 'Memory', sub: 'learns patterns' },
              { icon: '05', label: 'Alert', sub: 'notifies you' },
            ].map((step, idx, steps) => (
              <div key={step.label} className="flex items-center md:items-start">
                <div className="landing-architecture-node text-center min-w-[8.5rem]">
                  <div className="landing-architecture-index">{step.icon}</div>
                  <p className="font-semibold text-gray-900">{step.label}</p>
                  <p className="text-xs text-gray-500">{step.sub}</p>
                </div>
                {idx < steps.length - 1 && (
                  <span
                    aria-hidden
                    className="hidden md:flex w-10 h-10 items-center justify-center text-2xl leading-none text-gray-400 font-light mt-0.5"
                  >
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Documentation */}
      <Section id="learn-more" className="landing-section landing-section-banded border-y border-gray-200 py-14 md:py-20">
        <div className="mb-8 md:mb-12">
          <SectionHeader
            eyebrow="Documentation"
            title="Understand what it does."
            description="Vigil is not magic. Every decision is logged. Every action is traceable. Read how it works, what it stores, and why you can trust it."
          />
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
          {[
            { href: '/learn/watchers', title: 'Watchers', description: 'Create agents that monitor email streams. Configure prompts, tools, and alert thresholds.' },
            { href: '/learn/email-ingestion', title: 'Email Ingestion', description: 'How to forward emails to Vigil, what gets processed, and how threads are detected.' },
            { href: '/learn/agent', title: 'The Agent', description: 'How the AI agent analyzes email, builds memory, and decides when to act.' },
            { href: '/learn/memory', title: 'Memory System', description: 'How the agent remembers context across emails and surfaces relevant memories.' },
            { href: '/learn/architecture', title: 'Architecture', description: 'Data flow, privacy model, and why no email bodies are stored.' },
            { href: '/learn/security', title: 'Security & Privacy', description: 'What Vigil stores, what it discards, and how data flows through the system.' },
          ].map((item, idx) => (
            <Link
              key={item.href}
              href={item.href}
              data-reveal
              id={`learn-${idx}`}
              className="landing-doc-card panel p-5 opacity-0 hover:-translate-y-0.5 transition-all duration-150 group cursor-pointer"
              style={{ animation: isRevealed(`learn-${idx}`) ? `slideUpIn 0.6s ease-out ${0.1 + idx * 0.05}s forwards` : 'none' }}
            >
              <span className="landing-doc-label">Guide</span>
              <h3 className="font-semibold text-gray-900 mb-1.5 group-hover:text-vigil-800 transition-colors">{item.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
              <span className="mt-3 flex items-center gap-1.5 text-sm font-medium text-vigil-700">
                Read more <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section id="cta" className="landing-section py-14 md:py-20">
        <div className="landing-cta-shell panel overflow-hidden max-w-4xl mx-auto">
          <div className="grid gap-0 md:grid-cols-[1.15fr_0.85fr]">
            <div className="px-6 py-8 md:px-10 md:py-10 text-left">
              <SectionHeader
                eyebrow="Start now"
                title="Start watching in 2 minutes."
                description="Create a watcher. Set up a forwarding rule. That's it. Your agent starts learning from the first email."
              />
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/auth/register" className="btn btn-primary btn-lg">
                  Start for free
                </Link>
                <Link href="/pricing" className="btn btn-secondary btn-lg">
                  View pricing
                </Link>
              </div>
              <p className="mt-4 text-sm text-gray-500 max-w-none">No credit card required. Pay only when the agent actually runs.</p>
            </div>

            <div className="landing-cta-pricing px-6 py-8 md:px-8 md:py-10 text-white">
              <p className="text-vigil-200 text-sm uppercase tracking-[0.22em] mb-4">Pay per use</p>
              <ul className="text-sm space-y-2 text-vigil-100 text-left">
                {['$0.001 per invocation + model token usage', '$0.005 per alert sent', 'Unlimited watchers and memory', '9 AI models, 3 providers', 'Full audit trail'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-vigil-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="landing-cta-footnote mt-6">
                <p className="text-vigil-100 text-sm font-medium">Already have an account?</p>
                <Link href="/auth/login" className="inline-flex mt-2 text-sm text-white/85 hover:text-white font-medium">
                  Sign in →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-surface-page">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-10">
          <div className="grid md:grid-cols-4 gap-6">
            <div>
              <p className="font-display font-semibold text-gray-900 mb-3">Vigil</p>
              <p className="text-sm text-gray-500">An AI agent that reads your email and acts on it.</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Product</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#how-it-works" className="hover:text-gray-700">How it works</a></li>
                <li><a href="#features" className="hover:text-gray-700">Features</a></li>
                <li><Link href="/pricing" className="hover:text-gray-700">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Documentation</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/learn/watchers" className="hover:text-gray-700">Watchers</Link></li>
                <li><Link href="/learn/agent" className="hover:text-gray-700">The Agent</Link></li>
                <li><Link href="/learn/architecture" className="hover:text-gray-700">Architecture</Link></li>
                <li><Link href="/learn/security" className="hover:text-gray-700">Security</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Account</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/auth/register" className="hover:text-gray-700">Sign up</Link></li>
                <li><Link href="/auth/login" className="hover:text-gray-700">Sign in</Link></li>
              </ul>
            </div>
          </div>
          <div className="divider my-8" />
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
            <p>© {new Date().getFullYear()} Vigil. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
