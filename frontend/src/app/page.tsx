'use client';
import Link from 'next/link';
import { PublicHeader, Footer } from '@/components/layout';
import { useEffect, useRef, useState } from 'react';

const heroPromptSamples = [
  'Alert me when a client hasn\'t heard back in 48 hours.',
  'Track every invoice and warn me before deadlines.',
  'Watch support emails and escalate the urgent ones to Slack.',
  'Monitor vendor emails and fire a webhook when payment is due.',
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

export default function HomePage() {
  const isRevealed = useScrollReveal();
  const [intent, setIntent] = useState('');
  const [heroPromptIndex, setHeroPromptIndex] = useState(0);

  useEffect(() => {
    if (intent) return;
    const interval = window.setInterval(() => {
      setHeroPromptIndex((current) => (current + 1) % heroPromptSamples.length);
    }, 3200);
    return () => window.clearInterval(interval);
  }, [intent]);

  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader />

      {/* Hero — pain + solution + action */}
      <header className="pt-36 pb-14 md:pt-44 md:pb-16 relative overflow-hidden bg-surface-page z-[2]">
        <div aria-hidden="true" className="hero-texture absolute inset-0 z-0" style={{ backgroundImage: 'url(/hero-texture.png)', backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', opacity: 0.19 }} />
        <div className="absolute inset-0 z-0 bg-[#E5E5E6]/10" />
        <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-[#E5E5E6]/35 via-[#E5E5E6]/20 to-transparent" />

        <div className="max-w-6xl mx-auto px-6 lg:px-8 relative z-10">
          <div className="relative max-w-5xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl font-display font-semibold text-gray-900 tracking-tight mb-7 text-balance leading-[1.1]" style={{ wordSpacing: '0.08em' }}>
              Stop checking email.<br />
              Let an agent do it.
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed mx-auto max-w-2xl">
              Vigil reads your email 24/7, remembers every conversation, and only interrupts you when something
              actually needs your attention. No inbox access required. Forward what you want watched.
            </p>

            {/* CTA */}
            <div className="w-full max-w-3xl mx-auto">
              <div className="hero-prompt-suggestion mb-3 min-h-10">
                <p key={heroPromptIndex} className="hero-prompt-copy text-sm text-gray-400 italic">
                  &ldquo;{heroPromptSamples[heroPromptIndex]}&rdquo;
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const encoded = encodeURIComponent(intent.trim());
                  window.location.href = encoded ? `/auth/register?intent=${encoded}` : '/auth/register';
                }}
                className="panel p-2 flex flex-col gap-2 md:flex-row md:items-stretch"
              >
                <input type="text" value={intent} onChange={(e) => setIntent(e.target.value)}
                  placeholder="Tell Vigil what to watch for..."
                  className="hero-prompt-input flex-1 bg-transparent px-4 py-4 text-base md:text-lg text-gray-900 outline-none" />
                <button type="submit" className="btn btn-primary py-4 px-8 text-base md:min-w-[11rem] shrink-0">
                  Start free
                </button>
              </form>
              <p className="text-sm text-gray-400 mt-3 text-center">50 emails free every month. No credit card. Set up in 30 seconds.</p>
            </div>
          </div>
        </div>

        {/* Demo */}
        <div className="relative z-10 mt-14 md:mt-18 mb-8 mx-auto w-full max-w-[96rem] px-3 sm:px-5 lg:px-8">
          <div className="panel hero-demo-stage w-full overflow-hidden p-1.5">
            <div className="hero-demo-surface relative aspect-[16/10] md:aspect-[16/8.8] overflow-hidden rounded-md">
              <div className="hero-demo-grid absolute inset-0" />
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/55 via-white/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#d4dde0]/85 via-[#d4dde0]/25 to-transparent" />
              <div className="relative z-10 flex h-full flex-col justify-between p-5 md:p-8 lg:p-10">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] md:text-xs font-bold uppercase tracking-[0.24em] text-vigil-900">How it works</p>
                    <p className="text-sm md:text-base text-gray-700 mt-1 font-medium">Email arrives. Agent reads. Decision made. You keep working.</p>
                  </div>
                  <div className="hero-demo-pill rounded-full px-3 py-1.5 text-[11px] md:text-xs font-bold text-vigil-900">No inbox access</div>
                </div>
                <div className="grid gap-4 md:grid-cols-[1.45fr_0.85fr] md:gap-6 lg:gap-8 items-end">
                  <div className="hero-demo-window rounded-[1.1rem] p-3 md:p-4 lg:p-5">
                    <div className="flex items-center gap-2 mb-3 md:mb-4">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#c96e61]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#d7b45d]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#7faa73]" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-[0.95fr_1.3fr]">
                      <div className="rounded-xl bg-white/85 p-3 md:p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-gray-600 font-bold mb-2">Your watcher</p>
                        <p className="text-sm md:text-base font-bold text-gray-900">Vendor follow-up</p>
                        <p className="text-xs md:text-sm text-gray-700 mt-2">Your prompt, your tools, your rules. Each watcher learns independently.</p>
                      </div>
                      <div className="rounded-xl bg-[#0B1F2A] p-4 md:p-5 text-left shadow-[0_12px_40px_rgba(11,31,42,0.18)]">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-[#8ec5d6] font-bold mb-2">Agent decision</p>
                        <p className="text-sm md:text-base text-white font-semibold">Invoice #4521 is due tomorrow. This vendor expects payment by the 14th. Alerting you now.</p>
                        <div className="mt-4 space-y-2 text-xs md:text-sm text-[#c8dce4]">
                          <p>Thread: 3 emails grouped. Obligation detected.</p>
                          <p>Memory: Payment pattern recognized from 4 prior invoices.</p>
                          <p>Action: Email alert sent. Webhook fired to accounting.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 md:space-y-4">
                    <div className="hero-float-card hero-float-card-delay-1 rounded-2xl p-4 md:p-5">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-gray-600 font-bold mb-2">Most emails</p>
                      <p className="text-sm md:text-base text-gray-900 font-semibold">Read, threaded, remembered. No interruption. Agent stays quiet.</p>
                    </div>
                    <div className="hero-float-card hero-float-card-delay-2 rounded-2xl p-4 md:p-5">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-gray-600 font-bold mb-2">The exceptions</p>
                      <p className="text-sm md:text-base text-gray-900 font-semibold">Deadline in 24h. Client waiting 3 days. Payment overdue. You hear about these.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
      </header>

      {/* The problem → solution */}
      <Section className="landing-section py-16 md:py-20">
        <div className="max-w-3xl mx-auto text-center mb-12" data-reveal id="problem" style={{ opacity: 0, animation: isRevealed('problem') ? 'slideUpIn 0.6s ease-out forwards' : 'none' }}>
          <p className="landing-section-kicker text-center">The problem</p>
          <h2 className="landing-section-title text-center mt-3" style={{ wordSpacing: '0.08em' }}>Email doesn&apos;t stop. You shouldn&apos;t have to keep up.</h2>
          <p className="text-base text-gray-600 mt-4 leading-relaxed">
            You already know what matters in your inbox. The problem is that it takes 2 hours a day to find it buried under
            newsletters, automated notifications, and threads that don&apos;t need you yet. Vigil does the reading for you
            and only surfaces what actually requires action.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: 'Reads everything', desc: 'Every forwarded email gets analyzed: who sent it, what they want, how urgent it is, and what you should know. The body is discarded after processing.' },
            { title: 'Remembers everything', desc: 'The agent builds a memory across all your emails. Vendor patterns, client response times, recurring deadlines. Context that makes every future decision smarter.' },
            { title: 'Interrupts almost never', desc: 'Most emails become quiet thread updates and memory notes. You only hear from Vigil when a deadline is approaching, a conversation has gone cold, or something genuinely needs you.' },
          ].map((item, idx) => (
            <div key={item.title} data-reveal id={`sol-${idx}`} className="panel p-6 opacity-0" style={{ animation: isRevealed(`sol-${idx}`) ? `slideUpIn 0.6s ease-out ${0.1 + idx * 0.06}s forwards` : 'none' }}>
              <h3 className="font-semibold text-gray-900 mb-3">{item.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* How to start — 3 steps, prominent */}
      <Section className="landing-section landing-section-banded border-y border-gray-200 py-14 md:py-20">
        <div className="max-w-3xl mx-auto text-center mb-10">
          <p className="landing-section-kicker text-center">Get started</p>
          <h2 className="landing-section-title text-center mt-3" style={{ wordSpacing: '0.08em' }}>Running in 30 seconds. Seriously.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <Link href="/auth/register" data-reveal id="gs-1" className="panel p-6 text-center opacity-0 group hover:-translate-y-0.5 transition-transform" style={{ animation: isRevealed('gs-1') ? 'slideUpIn 0.6s ease-out 0.1s forwards' : 'none' }}>
            <div className="w-10 h-10 rounded-full bg-accent text-gray-50 flex items-center justify-center text-base font-bold mx-auto mb-4">1</div>
            <h3 className="font-semibold text-gray-900 mb-2">Create an account</h3>
            <p className="text-sm text-gray-600">Pick a name for your watcher. Tell it what to focus on. Vigil generates a unique forwarding address.</p>
          </Link>
          <Link href="/extension" data-reveal id="gs-2" className="panel p-6 text-center opacity-0 group hover:-translate-y-0.5 transition-transform" style={{ animation: isRevealed('gs-2') ? 'slideUpIn 0.6s ease-out 0.2s forwards' : 'none' }}>
            <div className="w-10 h-10 rounded-full bg-accent text-gray-50 flex items-center justify-center text-base font-bold mx-auto mb-4">2</div>
            <h3 className="font-semibold text-gray-900 mb-2">Connect your email</h3>
            <p className="text-sm text-gray-600">Use the Chrome extension for a guided setup, or add a forwarding rule in Gmail or Outlook manually.</p>
          </Link>
          <div data-reveal id="gs-3" className="panel p-6 text-center opacity-0" style={{ animation: isRevealed('gs-3') ? 'slideUpIn 0.6s ease-out 0.3s forwards' : 'none' }}>
            <div className="w-10 h-10 rounded-full bg-accent text-gray-50 flex items-center justify-center text-base font-bold mx-auto mb-4">3</div>
            <h3 className="font-semibold text-gray-900 mb-2">That&apos;s it</h3>
            <p className="text-sm text-gray-600">Vigil starts reading immediately. Check your dashboard anytime, or just wait for it to reach out when something matters.</p>
          </div>
        </div>
        <div className="text-center mt-10">
          <Link href="/auth/register" className="btn btn-primary btn-lg">Create your first watcher</Link>
        </div>
      </Section>

      {/* Trust — why it's safe */}
      <Section className="landing-section py-14 md:py-18">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="landing-section-kicker">Trust</p>
            <h2 className="landing-section-title mt-3" style={{ wordSpacing: '0.08em' }}>Your email never leaves your provider.</h2>
            <p className="text-base text-gray-600 mt-4 leading-relaxed">
              Vigil never connects to your inbox. No OAuth. No passwords. No API tokens to your email account.
              You set up a standard forwarding rule and Vigil receives a copy. The email body is processed in memory
              and discarded. If you want to stop, delete the forwarding rule. Vigil sees nothing more.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <Link href="/privacy" className="text-sm text-vigil-700 font-medium hover:text-vigil-800">Privacy policy →</Link>
              <Link href="/learn/security" className="text-sm text-vigil-700 font-medium hover:text-vigil-800">Security details →</Link>
              <Link href="/learn/architecture" className="text-sm text-vigil-700 font-medium hover:text-vigil-800">Architecture →</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['No inbox access', 'Forwarding rules only'],
              ['No stored bodies', 'SHA-256 hash proves receipt'],
              ['No OAuth', 'No passwords or API tokens'],
              ['You control it', 'Delete the rule to stop'],
            ].map(([title, desc]) => (
              <div key={title} className="panel-inset rounded-md p-4">
                <p className="font-semibold text-gray-900 text-sm">{title}</p>
                <p className="text-xs text-gray-500 mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Use cases — who this is for */}
      <Section id="use-cases" className="landing-section landing-section-banded border-y border-gray-200 py-14 md:py-18">
        <div className="mb-8 text-center">
          <p className="landing-section-kicker text-center">Who it&apos;s for</p>
          <h2 className="landing-section-title text-center mt-3" style={{ wordSpacing: '0.08em' }}>Anyone who can&apos;t afford to miss what matters.</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { title: 'Freelancers', desc: 'One watcher per client. Never lose track of who\'s waiting on what. Get alerted before a thread goes cold.' },
            { title: 'Small teams', desc: 'Ops mailbox, support inbox, vendor communications. Each one gets its own agent with its own memory.' },
            { title: 'Finance and billing', desc: 'Track invoices across vendors. The agent remembers payment patterns and warns you before deadlines.' },
            { title: 'Sales and account management', desc: 'Know the moment a prospect goes quiet. Trigger a follow-up in Slack, CRM, or any system with an API.' },
            { title: 'IT and ops', desc: 'Pipe alerts through Vigil. It reads the noise, groups the threads, and only escalates what clears your bar.' },
            { title: 'Anyone with a prompt', desc: 'Write the instructions. Connect your tools. If you can describe what matters, Vigil can watch for it.' },
          ].map((item) => (
            <div key={item.title} className="panel p-5">
              <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/auth/register" className="btn btn-primary">Start free</Link>
        </div>
      </Section>

      {/* Pricing */}
      <Section className="landing-section py-14 md:py-20">
        <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-10 items-center">
          <div>
            <p className="landing-section-kicker">Pricing</p>
            <h2 className="landing-section-title mt-3" style={{ wordSpacing: '0.08em' }}>Half a cent per email. No surprises.</h2>
            <p className="text-base text-gray-600 mt-4 leading-relaxed">
              50 emails free every month. After that, $0.005 per email Vigil processes.
              That&apos;s it. No tiers. No per-seat pricing. No annual contracts. No hidden token costs.
              A thousand emails costs five dollars.
            </p>
            <div className="mt-6 flex gap-4">
              <Link href="/auth/register" className="btn btn-primary">Start free</Link>
              <Link href="/pricing" className="text-sm text-vigil-700 font-medium hover:text-vigil-800 flex items-center">Full pricing details →</Link>
            </div>
          </div>
          <div className="panel p-6 space-y-3">
            {[
              ['50 free emails', 'Every month, forever, no card needed'],
              ['$0.005 per email', 'Half a cent. A thousand emails = $5'],
              ['Alerts included', 'No extra charge when the agent reaches out'],
              ['Unlimited watchers', 'As many email streams as you need'],
              ['Full audit trail', 'Every agent decision logged and visible'],
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
      <Section id="docs" className="landing-section landing-section-banded border-y border-gray-200 py-14 md:py-18">
        <div className="mb-8 text-center">
          <p className="landing-section-kicker text-center">Learn more</p>
          <h2 className="landing-section-title text-center mt-3" style={{ wordSpacing: '0.08em' }}>Everything is documented. Nothing is hidden.</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { href: '/extension', title: 'Chrome Extension', desc: '30-second guided setup for Gmail and Outlook.' },
            { href: '/learn/watchers', title: 'Watchers', desc: 'Create agents with custom prompts and tools.' },
            { href: '/learn/agent', title: 'The Agent', desc: 'How it analyzes, remembers, and decides.' },
            { href: '/learn/integrations', title: 'API and Integrations', desc: 'REST API, webhooks, any framework.' },
            { href: '/learn/memory', title: 'Memory System', desc: 'How context builds across all emails.' },
            { href: '/learn/email-ingestion', title: 'Email Setup', desc: 'Forwarding rules and filter configuration.' },
            { href: '/learn/architecture', title: 'Architecture', desc: 'Data flow, privacy model, what gets stored.' },
            { href: '/learn/security', title: 'Security', desc: 'What is discarded. What is kept. Why.' },
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
          <h2 className="text-2xl md:text-3xl font-display font-semibold text-gray-900">Forward one email. See what happens.</h2>
          <p className="text-base text-gray-600 mt-4 leading-relaxed">
            Create an account. Forward a single email. Watch the agent analyze it, remember the context, and decide
            whether you need to know. If it&apos;s useful, forward more. If not, delete the rule and walk away.
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
