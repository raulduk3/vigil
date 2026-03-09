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
  const [eyeOffset, setEyeOffset] = useState(0);
  const eyeRafRef = useRef<number | null>(null);
  const isRevealed = useScrollReveal();

  useEffect(() => {
    const handleScroll = () => {
      if (eyeRafRef.current) cancelAnimationFrame(eyeRafRef.current);
      eyeRafRef.current = requestAnimationFrame(() => {
        setEyeOffset(Math.max(0, Math.min(520, window.scrollY * 0.9)));
      });
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (eyeRafRef.current) cancelAnimationFrame(eyeRafRef.current);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

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
      <header className="py-52 md:pb-20 relative overflow-hidden bg-surface-page z-[2]">
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
              AI email agent · No inbox access required
            </p>
            <h1 className="text-5xl md:text-6xl font-display font-semibold text-gray-900 tracking-tight mb-7 text-balance leading-[1.1]">
              An email agent that<br />
              never sees your inbox.
            </h1>
            <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-2xl">
              Forward emails to Vigil. An AI agent reads each one, tracks conversations, builds memory,
              and alerts you when something needs attention. Email bodies are processed and discarded.
              Nothing is stored. Nothing is accessed.
            </p>
            <div className="flex items-center gap-5">
              <Link href="/auth/register" className="btn btn-primary btn-lg">
                Get started free
              </Link>
              <a href="#how-it-works" className="btn btn-secondary btn-lg">
                How it works
              </a>
            </div>
          </div>
        </div>

        <div
          className="hidden md:block pointer-events-none select-none absolute bottom-[1rem] right-[48%] md:bottom-[1rem] md:right-[42%] lg:bottom-[1.25rem] lg:right-[38%] text-[9rem] md:text-[11rem] lg:text-[13rem] leading-[0.9] text-gray-900/80 drop-shadow-[0_10px_22px_rgba(0,0,0,0.12)] z-[5]"
          style={{
            transform: `translate3d(0px, ${Math.min(80, Math.max(25, 80 - eyeOffset * 0.12))}px, 0)`,
            fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
          }}
          aria-hidden
        >
          <span className="block">👀</span>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
      </header>

      {/* How It Works */}
      <Section id="how-it-works" className="py-12 md:py-16">
        <div className="mb-8 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">How it works</p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Forward. Watch. Alert.
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Set up a forwarding rule. Vigil's agent reads each email, decides what matters,
            remembers context across conversations, and alerts you only when action is needed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
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
            <div className="panel-inset p-5 rounded-md">
              <p className="text-sm text-gray-500 mb-1">From: Vigil &lt;notifications@vigil.run&gt;</p>
              <p className="text-sm font-medium text-gray-900">⚡ Payment of $5,000 due tomorrow</p>
              <p className="text-sm text-gray-600 mt-1">Invoice #4521 from vendor@example.com requires immediate payment...</p>
            </div>
          </div>
        </div>
      </Section>

      {/* What makes it different */}
      <Section id="features" className="bg-surface-sunken border-y border-gray-200 py-12 md:py-16">
        <div className="mb-8 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Why Vigil</p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Privacy you don't have to trust.
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Most email tools ask for inbox access. Vigil never touches your inbox.
            You forward what matters. The agent processes it in memory and discards the content.
            What remains: metadata, the agent's analysis, and its growing memory of your email patterns.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: '🔒',
              title: 'No inbox access',
              description: 'Vigil never connects to your email. You forward what you want watched. Nothing else is visible.',
            },
            {
              icon: '🧠',
              title: 'Persistent memory',
              description: 'The agent remembers context across emails. Who sends what, patterns, preferences. It gets smarter over time.',
            },
            {
              icon: '🗑️',
              title: 'Bodies discarded',
              description: 'Email content is processed in memory and never stored. Only a SHA-256 hash proves receipt. No full-text archive.',
            },
            {
              icon: '🧵',
              title: 'Thread tracking',
              description: 'Emails are grouped into conversations automatically. The agent tracks which threads are active, resolved, or going cold.',
            },
            {
              icon: '⚙️',
              title: 'Configurable agent',
              description: 'Write your own system prompt. Enable the tools you want. Set silence thresholds. Each watcher is a custom agent.',
            },
            {
              icon: '📋',
              title: 'Full audit trail',
              description: 'Every agent decision is logged: what tool was called, why, what it cost, how long it took. Complete transparency.',
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
              <div className="text-2xl mb-4">{feature.icon}</div>
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
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            More than a filter. An actual agent.
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Vigil isn't a rules engine or keyword matcher. Each watcher runs an AI agent with its own
            prompt, memory, and tools. It reads email like a person would, builds context over time,
            and takes action when something needs your attention.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div
            data-reveal id="cap-analyze"
            className="panel p-6 opacity-0"
            style={{ animation: isRevealed('cap-analyze') ? 'slideUpIn 0.6s ease-out 0.1s forwards' : 'none' }}
          >
            <h3 className="font-semibold text-gray-900 mb-3">Analyze</h3>
            <p className="text-base text-gray-600 leading-relaxed mb-4">
              Every email gets a structured analysis: one-sentence summary, sender intent,
              urgency level, and key entities (names, amounts, dates).
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
              The agent builds memory over time. Sender patterns, recurring topics,
              your preferences. Relevant memories surface automatically for each new email.
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
              When something needs attention, the agent uses its tools: send an alert,
              update a thread, fire a webhook. Each action is logged with full reasoning.
            </p>
            <div className="panel-inset p-4 rounded-md text-sm space-y-1.5">
              <p><span className="badge badge-sm badge-critical">send_alert</span> <span className="text-gray-600 ml-1">Payment overdue, service at risk</span></p>
              <p><span className="badge badge-sm badge-ok">update_thread</span> <span className="text-gray-600 ml-1">Marked as urgent, summary updated</span></p>
              <p><span className="badge badge-sm badge-neutral">memory</span> <span className="text-gray-600 ml-1">Noted: vendor escalation pattern</span></p>
            </div>
          </div>
        </div>
      </Section>

      {/* Use Cases */}
      <Section id="use-cases" className="bg-surface-sunken border-y border-gray-200 py-12 md:pt-8 md:pb-8">
        <div className="mb-2 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Use cases</p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Set up a watcher. Forward what matters.
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Each watcher is a separate agent with its own prompt, memory, and behavior.
            Create one for work, one for billing, one for client comms. Each learns independently.
          </p>
        </div>

        <ul className="space-y-5 md:space-y-7">
          {[
            { id: 'uc-vendor', role: 'Vendor follow-up', text: 'Forward vendor emails. The agent tracks invoices, flags overdue payments, and alerts when requests go unanswered.' },
            { id: 'uc-client', role: 'Client communications', text: 'Monitor client threads. Get alerted when conversations go cold or when action items surface in long email chains.' },
            { id: 'uc-billing', role: 'Bills and renewals', text: 'Forward invoices and confirmations. The agent remembers payment patterns and alerts before deadlines.' },
            { id: 'uc-legal', role: 'Sensitive correspondence', text: 'Track legal, HR, or compliance threads. Full audit trail of every agent decision. Nothing stored, everything logged.' },
            { id: 'uc-freelance', role: 'Freelancers', text: 'Manage multiple clients. Each watcher handles a different client, remembers their patterns, and keeps you on top of deliverables.' },
            { id: 'uc-custom', role: 'Build your own', text: 'Write a custom prompt. Enable the tools you need. The agent does what you tell it to do.' },
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
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
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
          className="panel p-8 mb-2 opacity-0"
          style={{ animation: isRevealed('arch-flow') ? 'scaleIn 0.6s ease-out forwards' : 'none' }}
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-3">
            {[
              { icon: '📧', label: 'Your email', sub: 'forwarding rule' },
              { icon: '☁️', label: 'Cloudflare', sub: 'receives at MX' },
              { icon: '🤖', label: 'Agent', sub: 'reads + decides' },
              { icon: '🧠', label: 'Memory', sub: 'learns patterns' },
              { icon: '🔔', label: 'Alert', sub: 'notifies you' },
            ].map((step, idx) => (
              <div key={step.label} className="flex items-center gap-3 md:gap-0 md:flex-col">
                {idx > 0 && (
                  <span aria-hidden className="hidden md:block text-3xl leading-none text-gray-400 font-light mb-3">→</span>
                )}
                <div className="text-center">
                  <div className="text-3xl mb-2">{step.icon}</div>
                  <p className="font-semibold text-gray-900">{step.label}</p>
                  <p className="text-xs text-gray-500">{step.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Documentation */}
      <Section id="learn-more" className="bg-surface-sunken border-y border-gray-200 py-12 md:py-16">
        <div className="mb-8 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Documentation</p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Understand what it does.
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Vigil is not magic. Every decision is logged. Every action is traceable.
            Read how it works, what it stores, and why you can trust it.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
          {[
            { href: '/learn/watchers', title: 'Watchers', description: 'Create agents that monitor email streams. Configure prompts, tools, and alert thresholds.', delay: 0.1 },
            { href: '/learn/email-ingestion', title: 'Email forwarding', description: 'How to forward emails to Vigil, what gets processed, and how threads are detected.', delay: 0.2 },
            { href: '/learn/agent', title: 'The agent', description: 'How the AI agent analyzes email, builds memory, and decides when to alert you.', delay: 0.3 },
            { href: '/learn/memory', title: 'Memory system', description: 'How the agent remembers context across emails and surfaces relevant memories.', delay: 0.1 },
            { href: '/learn/architecture', title: 'Architecture', description: 'The full technical design: data flow, privacy model, and why no email bodies are stored.', delay: 0.2 },
            { href: '/learn/security', title: 'Security & privacy', description: 'What Vigil stores, what it discards, and how data flows through the system.', delay: 0.3 },
          ].map((item, idx) => (
            <Link
              key={item.href}
              data-reveal
              id={`learn-${idx}`}
              href={item.href}
              className="panel p-5 hover:shadow-raised transition-all duration-150 group opacity-0"
              style={{ animation: isRevealed(`learn-${idx}`) ? `slideUpIn 0.6s ease-out ${item.delay}s forwards` : 'none' }}
            >
              <h3 className="font-semibold text-gray-900 mb-1.5 group-hover:text-vigil-800 transition-colors">{item.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
            </Link>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section id="cta" className="py-12 md:py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Start watching in 2 minutes.
          </h2>
          <p className="text-lg text-gray-600 mb-8 leading-relaxed">
            Create a watcher. Set up a forwarding rule. That's it.
            Your agent starts learning from the first email.
          </p>
          <div className="panel p-6 bg-vigil-900 text-white inline-block w-full max-w-sm">
            <div className="mb-6">
              <p className="text-vigil-200 text-sm mb-3">Free plan:</p>
              <ul className="text-sm space-y-1.5 text-vigil-100 text-left">
                {['2 watchers', '50 emails per week', 'Full audit trail', 'Email alerts'].map((item) => (
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
              Create free account
            </Link>
            <p className="text-center text-vigil-300 text-xs mt-3">No credit card required</p>
          </div>
          <div className="mt-4">
            <span className="text-sm text-gray-500">Already have an account? </span>
            <Link href="/auth/login" className="text-sm text-vigil-700 hover:text-vigil-800 font-medium">Sign in</Link>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-surface-page">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <p className="font-display font-semibold text-gray-900 mb-3">Vigil</p>
              <p className="text-sm text-gray-500">An email agent that never sees your inbox.</p>
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
                <li><Link href="/learn/agent" className="hover:text-gray-700">The agent</Link></li>
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
