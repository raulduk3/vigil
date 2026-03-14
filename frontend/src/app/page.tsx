'use client';
import Link from 'next/link';
import { PublicHeader } from '@/components/layout';
import { useEffect, useRef, useState } from 'react';

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
          } else {
            setRevealed((prev) => {
              const s = new Set(prev);
              s.delete(id);
              return s;
            });
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
    <section id={id} className={`py-6 md:py-[4.5rem] ${className}`}>
      <div className="max-w-6xl mx-auto px-6 lg:px-8">{children}</div>
    </section>
  );
}

export default function HomePage() {
  const isRevealed = useScrollReveal();

  return (
    <div className="min-h-screen bg-surface-page">
      <svg className="absolute w-0 h-0">
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
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: 'url(/hero-texture.png)',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            filter: 'blur(1px) brightness(0.9)',
            transform: 'scale(1.03)',
            opacity: 0.19,
          }}
        />
        <div className="absolute inset-0 z-0 bg-[#E5E5E6]/10" />
        <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-[#E5E5E6]/35 via-[#E5E5E6]/20 to-transparent" />

        <div className="max-w-6xl mx-auto px-6 lg:px-8 relative z-10">
          <div className="relative max-w-4xl">
            <p className="text-base font-medium text-vigil-700 mb-5 uppercase tracking-wider">
              AI email agent · Pay per use · No inbox access
            </p>
            <h1 className="text-5xl md:text-6xl font-display font-semibold text-gray-900 tracking-tight mb-7 text-balance leading-[1.1]" style={{ wordSpacing: '0.08em' }}>
              An AI agent that reads<br />
              your email and acts on it.
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-2xl">
              Forward an email. Your agent reads it, remembers what matters, and does
              whatever you told it to do. Send a text. Fire a webhook. Connect to another system.
              Prompt it like you'd prompt anything else. It works for you.
            </p>
            <div className="flex items-center gap-4">
              <Link href="/auth/register" className="btn btn-primary btn-lg">
                Get started free
              </Link>
              <a href="#how-it-works" className="btn btn-secondary btn-lg">
                How it works
              </a>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
      </header>

      {/* How It Works */}
      <Section id="how-it-works" className="py-12 md:py-16">
        <div className="mb-8 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">How it works</p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4" style={{ wordSpacing: '0.08em' }}>
            Analyze. Remember. Act.
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Set up a forwarding rule. Your agent reads each email, builds context across conversations,
            and alerts you only when something needs action.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <div className="panel p-7 flex flex-col animate-float-in delay-100">
            <div className="flex items-center gap-4 mb-5">
              <span className="w-12 h-12 rounded-full bg-vigil-100 text-vigil-700 text-base font-semibold flex items-center justify-center flex-shrink-0">1</span>
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

          <div className="panel p-7 flex flex-col animate-float-in delay-200">
            <div className="flex items-center gap-4 mb-5">
              <span className="w-12 h-12 rounded-full bg-vigil-100 text-vigil-700 text-base font-semibold flex items-center justify-center flex-shrink-0">2</span>
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

          <div className="panel p-7 flex flex-col animate-float-in delay-300">
            <div className="flex items-center gap-4 mb-5">
              <span className="w-12 h-12 rounded-full bg-vigil-100 text-vigil-700 text-base font-semibold flex items-center justify-center flex-shrink-0">3</span>
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
      <Section id="features" className="bg-surface-sunken border-y border-gray-200 py-12 md:py-16">
        <div className="mb-8 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Why Vigil</p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4" style={{ wordSpacing: '0.08em' }}>
            Your agent. Your rules. Your data stays yours.
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Google and Microsoft help you read email. Vigil makes sure you never drop an obligation.
            Privacy by architecture, not policy. Configurable by design, not as an afterthought.
          </p>
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
              className="panel p-5 opacity-0"
              style={{
                animation: isRevealed(`feature-${idx}`) ? `slideUpIn 0.6s ease-out ${0.1 + idx * 0.05}s forwards` : 'none',
              }}
            >
              <div className="inline-flex items-center justify-center h-7 px-2.5 rounded-full bg-vigil-100 text-vigil-700 text-[11px] font-semibold tracking-wide mb-3">{feature.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Agent capabilities */}
      <Section id="agent" className="py-12 md:py-16">
        <div className="mb-8 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">The agent</p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4" style={{ wordSpacing: '0.08em' }}>
            More than a filter. An actual agent.
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Not a rules engine. Not a keyword matcher. Each watcher runs an AI agent with its own prompt, memory, and tools — your agent, configured your way.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div
            data-reveal id="cap-analyze"
            className="panel p-6 opacity-0"
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
            className="panel p-6 opacity-0"
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
            className="panel p-6 opacity-0"
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
      <Section id="use-cases" className="bg-surface-sunken border-y border-gray-200 py-10 md:pt-8 md:pb-8">
        <div className="mb-2 md:mb-8">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Use cases</p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4" style={{ wordSpacing: '0.08em' }}>
            Set up a watcher. Forward what matters.
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Each watcher is a separate agent with its own prompt, memory, and behavior. Create one per context — each learns independently.
          </p>
        </div>

        <ul className="space-y-4 md:space-y-6">
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
              <div className="flex items-start gap-3 md:gap-4">
                <span className="text-gray-500 text-lg md:text-xl pt-0.5 flex-shrink-0">→</span>
                <div className="space-y-0.5 md:space-y-1">
                  <p className="text-base md:text-lg font-semibold text-gray-900">{item.role}</p>
                  <p className="text-sm md:text-base text-gray-700 leading-relaxed">{item.text}</p>
                </div>
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
      <Section id="architecture" className="py-12 md:py-16">
        <div className="mb-8 md:mb-2">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Architecture</p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4" style={{ wordSpacing: '0.08em' }}>
            Simple by design.
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            No OAuth. No inbox connection. No email bodies stored. Vigil works through forwarding rules
            you already know how to set up. The privacy model isn't a feature. It's the architecture.
          </p>
        </div>

        <div className="text-left mb-8">
          <Link href="/learn/architecture" className="text-sm text-vigil-700 hover:text-vigil-800 font-medium">
            Read the full technical design →
          </Link>
        </div>

        <div
          data-reveal id="arch-flow"
          className="panel p-6 mb-2 opacity-0"
          style={{ animation: isRevealed('arch-flow') ? 'scaleIn 0.6s ease-out forwards' : 'none' }}
        >
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0">
            {[
              { icon: '01', label: 'Your email', sub: 'forwarding rule' },
              { icon: '02', label: 'Cloudflare', sub: 'receives at MX' },
              { icon: '03', label: 'Agent', sub: 'reads + decides' },
              { icon: '04', label: 'Memory', sub: 'learns patterns' },
              { icon: '05', label: 'Alert', sub: 'notifies you' },
            ].map((step, idx, steps) => (
              <div key={step.label} className="flex items-center md:items-start">
                <div className="text-center min-w-[8.5rem]">
                  <div className="h-10 w-10 mx-auto mb-2 rounded-full bg-vigil-100 text-vigil-700 text-xs font-semibold flex items-center justify-center">{step.icon}</div>
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
      <Section id="learn-more" className="bg-surface-sunken border-y border-gray-200 py-12 md:py-16">
        <div className="mb-8 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Documentation</p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4" style={{ wordSpacing: '0.08em' }}>
            Understand what it does.
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Vigil is not magic. Every decision is logged. Every action is traceable.
            Read how it works, what it stores, and why you can trust it.
          </p>
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
              className="panel p-5 opacity-0 hover:shadow-raised hover:-translate-y-0.5 transition-all duration-150 group cursor-pointer"
              style={{ animation: isRevealed(`learn-${idx}`) ? `slideUpIn 0.6s ease-out ${0.1 + idx * 0.05}s forwards` : 'none' }}
            >
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
      <Section id="cta" className="py-12 md:py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4" style={{ wordSpacing: '0.08em' }}>
            Start watching in 2 minutes.
          </h2>
          <p className="text-lg text-gray-600 mb-8 leading-relaxed">
            Create a watcher. Set up a forwarding rule. That's it.
            Your agent starts learning from the first email.
          </p>
          <div className="panel p-6 bg-vigil-900 text-white inline-block w-full max-w-sm">
            <div className="mb-6">
              <p className="text-vigil-200 text-sm mb-3">Pay per use:</p>
              <ul className="text-sm space-y-1.5 text-vigil-100 text-left">
                {['~$0.0004 per email processed', '$0.005 per alert sent', 'Unlimited watchers and memory', '9 AI models, 3 providers', 'Full audit trail'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-vigil-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/auth/register" className="btn bg-white text-vigil-900 hover:bg-gray-100 w-full justify-center py-3 font-medium">
              Start for free
            </Link>
            <p className="text-center text-vigil-300 text-xs mt-3">No credit card required · Pay only when you use it</p>
          </div>
          <div className="mt-4">
            <span className="text-sm text-gray-500">Already have an account? </span>
            <Link href="/auth/login" className="text-sm text-vigil-700 hover:text-vigil-800 font-medium">Sign in</Link>
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
