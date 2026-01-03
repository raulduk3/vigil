
'use client';
import Link from 'next/link';
import { PublicHeader } from '@/components/layout';
import { ConnectionIndicator } from '@/components/system/connection-indicator';
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
            // Element is entering viewport - reveal it
            setRevealed((prev) => {
              const newSet = new Set(prev);
              newSet.add(id);
              return newSet;
            });
          } else {
            // Element is leaving viewport - hide it so it can animate again
            setRevealed((prev) => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
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

// Section component - simple and clean
function Section({ 
  children, 
  className = '',
  id,
}: { 
  children: React.ReactNode; 
  className?: string;
  id?: string;
}) {
  return (
    <section 
      id={id} 
      className={`py-6 md:py-[4.5rem] ${className}`}
    >
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        {children}
      </div>
    </section>
  );
}

// Tell Your Team Form Component
function TellYourTeamForm() {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail || !senderName) return;
    
    setIsSending(true);
    
    // Generate mailto link with pre-filled content
    const subject = encodeURIComponent(`${senderName} thinks you should check out Vigil`);
    const body = encodeURIComponent(`Hey,

I came across Vigil and thought it might be useful for our team.

It's an email monitoring tool that helps track deadlines and follow-ups. You forward important emails to it, and it alerts you when things need attention—like approaching deadlines or threads that have gone silent.

Key features:
• Automatic deadline extraction from emails
• Silence detection for threads that go quiet
• Configurable alert thresholds
• Complete audit trail of all events

Check it out: https://vigil.run

Let me know what you think!

${senderName}`);
    
    window.open(`mailto:${recipientEmail}?subject=${subject}&body=${body}`, '_blank');
    
    setIsSending(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  return (
    <form onSubmit={handleSend} className="space-y-5">
      <div>
        <label htmlFor="recipient" className="block text-base font-medium text-gray-700 mb-2">
          TO:
        </label>
        <input
          type="email"
          id="recipient"
          placeholder="colleague@company.com"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          className="w-full px-4 py-3.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-base placeholder-gray-400 focus:ring-2 focus:ring-vigil-500 focus:border-vigil-500 transition-colors"
          required
        />
      </div>
      <div>
        <label htmlFor="senderName" className="block text-base font-medium text-gray-700 mb-2">
          YOUR NAME:
        </label>
        <input
          type="text"
          id="senderName"
          placeholder="Your name"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          className="w-full px-4 py-3.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-base placeholder-gray-400 focus:ring-2 focus:ring-vigil-500 focus:border-vigil-500 transition-colors"
          required
        />
      </div>
      <button
        type="submit"
        disabled={isSending || !recipientEmail || !senderName}
        className="w-full btn btn-primary btn-lg justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSending ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Opening email...
          </span>
        ) : sent ? (
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Email opened!
          </span>
        ) : (
          'Send Email'
        )}
      </button>
    </form>
  );
}

// Demo placeholder component
function DemoPlaceholder({ 
  title, 
  description 
}: { 
  title: string; 
  description: string;
}) {
  return (
    <div className="panel-inset aspect-video flex flex-col items-center justify-center p-6 md:p-10">
      <div className="w-14 h-14 rounded-lg bg-gray-200 mb-5 flex items-center justify-center">
        <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-base font-medium text-gray-700 mb-1.5">{title}</p>
      <p className="text-sm text-gray-500 text-center">{description}</p>
    </div>
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
        const scrollY = window.scrollY;
        const offset = Math.max(0, Math.min(520, scrollY * 0.9));
        setEyeOffset(offset);
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
      {/* SVG Filters */}
      <svg className="absolute w-0 h-0">
        <defs>
          <filter id="noise">
            <feTurbulence 
              type="fractalNoise" 
              baseFrequency="0.8" 
              numOctaves="4" 
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0"/>
            <feComponentTransfer>
              <feFuncA type="discrete" tableValues="0 0 0 0.05 0"/>
            </feComponentTransfer>
            <feBlend mode="multiply" in="SourceGraphic"/>
          </filter>
        </defs>
      </svg>

      {/* Navigation */}
      <PublicHeader />

      {/* Hero Section - z-[2] to sit above texture overlay */}
      <header className="py-52 md:pb-20 relative overflow-hidden bg-surface-page z-[2]">
        {/* Background texture layer, blurred and slightly scaled for depth */}
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: 'url(/hero-texture.png)',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
              filter: 'blur(1px) brightness(0.9), contrast(0.2), saturate(0.8)',
              transform: 'scale(1.03)',
              opacity: 0.19,
          }}
        />
        {/* Subtle tint overlay, no backdrop blur to avoid affecting text */}
          <div className="absolute inset-0 z-0 bg-[#E5E5E6]/10" />
          {/* Gradient separation to reduce texture contrast under text */}
          <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-[#E5E5E6]/35 via-[#E5E5E6]/20 to-transparent" />
        
        <div className="max-w-6xl mx-auto px-6 lg:px-8 relative z-10">
          <div className="relative max-w-4xl">
            <p className="text-base font-medium text-vigil-700 mb-5 uppercase tracking-wider">
              Email oversight · Powered by GPT-4o-mini
            </p>
            <h1 className="text-5xl md:text-6xl font-display font-semibold text-gray-900 tracking-tight mb-7 text-balance leading-[1.1]">
              Catch what almost<br />
              slipped.<br />
              Before it costs you.
            </h1>
            <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-2xl">
              A deadline buried in a reply chain. A confirmation you thought you sent. Silence becomes risk
              without warning. Vigil watches only what you forward—time, silence, and closure—with deterministic precision.
              No inbox access. No automation making decisions. Just proof nothing critical is being ignored.
            </p>
            <div className="flex items-center gap-5">
              <Link href="/auth/register" className="btn btn-primary btn-lg">
                Start watching
              </Link>
              <a href="#how-it-works" className="btn btn-secondary btn-lg">
                How it works
              </a>
            </div>
          </div>
        </div>

        {/* Peeking eyes with subtle parallax, clipped by next section */}
        <div
          className="hidden md:block pointer-events-none select-none absolute bottom-[1rem] right-[48%] md:bottom-[1rem] md:right-[42%] lg:bottom-[1.25rem] lg:right-[38%] text-[9rem] md:text-[11rem] lg:text-[13rem] leading-[0.9] text-gray-900/80 drop-shadow-[0_10px_22px_rgba(0,0,0,0.12)] z-[5]"
          style={{
            transform: `translate3d(0px, ${ Math.min(80, Math.max(25, 80 - eyeOffset * 0.12)) }px, 0)`,
            filter: 'none',
            fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
          }}
          aria-hidden
        >
          <span className="block">👀</span>
        </div>
        
        {/* Architectural accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
      </header>

      {/* How It Works */}
      <Section id="how-it-works" className="py-12 md:py-16">
        <div className="mb-8 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Observe, extract, alert
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            You forward emails. GPT-4o-mini extracts deadlines and obligations. Email content is then discarded—only
            the extracted facts remain. The system tracks time and alerts you when something needs attention.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {/* Step 1 */}
          <div
            className="panel p-7 flex flex-col animate-float-in delay-100"
          >
            <div className="flex items-center gap-4 mb-5">
              <span className="w-12 h-12 rounded-full bg-vigil-100 text-vigil-700 text-base font-semibold flex items-center justify-center flex-shrink-0">
                1
              </span>
              <h3 className="text-lg font-semibold text-gray-900">Forward emails</h3>
            </div>
            <p className="text-base text-gray-600 leading-relaxed mb-5 flex-grow">
              Set up forwarding rules in Gmail or Outlook to send important emails to your
              Vigil watcher address. You control exactly what Vigil sees.
            </p>
            <DemoPlaceholder
              title="Email forwarding setup"
              description="Configure Gmail rules to automatically forward to Vigil"
            />
            <Link href="/learn/email-ingestion" className="inline-block text-base text-vigil-700 hover:text-vigil-800 font-medium mt-5">
              Learn about email ingestion
            </Link>
          </div>

          {/* Step 2 */}
          <div
            className="panel p-7 flex flex-col animate-float-in delay-200"
          >
            <div className="flex items-center gap-4 mb-5">
              <span className="w-12 h-12 rounded-full bg-vigil-100 text-vigil-700 text-base font-semibold flex items-center justify-center flex-shrink-0">
                2
              </span>
              <h3 className="text-lg font-semibold text-gray-900">Create reminders</h3>
            </div>
            <p className="text-base text-gray-600 leading-relaxed mb-5 flex-grow">
              Vigil reads each email and creates reminders for deadlines it finds. "Send by Friday"
              and "ASAP" become separate reminders—each with preserved context and urgency tracking.
            </p>
            <DemoPlaceholder
              title="Reminder extraction"
              description="See how Vigil creates reminders from email text"
            />
            <Link href="/learn/reminders" className="inline-block text-base text-vigil-700 hover:text-vigil-800 font-medium mt-5">
              Learn about reminders
            </Link>
          </div>

          {/* Step 3 */}
          <div
            className="panel p-7 flex flex-col animate-float-in delay-300"
          >
            <div className="flex items-center gap-4 mb-5">
              <span className="w-12 h-12 rounded-full bg-vigil-100 text-vigil-700 text-base font-semibold flex items-center justify-center flex-shrink-0">
                3
              </span>
              <h3 className="text-lg font-semibold text-gray-900">Get alerted</h3>
            </div>
            <p className="text-base text-gray-600 leading-relaxed mb-5 flex-grow">
              Reminders escalate as deadlines approach—OK to Warning to Critical.
              You get notified only when urgency changes. No alert fatigue.
            </p>
            <DemoPlaceholder
              title="Alert dashboard"
              description="Review reminder status, urgency levels, and timelines"
            />
            <Link href="/learn/alerts" className="inline-block text-base text-vigil-700 hover:text-vigil-800 font-medium mt-5">
              Learn about notifications
            </Link>
          </div>
        </div>
      </Section>

      {/* Use Cases */}
      <Section id="use-cases" className="bg-surface-sunken border-y border-gray-200 py-12 md:pt-8 md:pb-8">
        <div className="mb-2 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Use cases
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            When silence has real cost
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            You look for Vigil when something important almost slipped. A filing, approval, or obligation
            that went quiet and could have cost you real money or professional damage. Vigil exists for that exact
            moment—before consequences arrive.
          </p>
        </div>

        <ul className="space-y-5 md:space-y-7">
          {[ 
            {
              id: 'usecase-pm',
              role: 'Project managers',
              text: 'Track client response times and get alerted before delivery deadlines slip.',
            },
            {
              id: 'usecase-bills',
              role: 'Bills and renewals',
              text: 'Forward invoices and confirmations; get reminded before anything is due.',
            },
            {
              id: 'usecase-compliance',
              role: 'SLA and compliance',
              text: 'Log response times with an audit trail so you can prove SLA adherence.',
            },
            {
              id: 'usecase-cs',
              role: 'Customer success',
              text: 'Catch stalled threads with silence alerts before customers feel ignored.',
            },
            {
              id: 'usecase-freelance',
              role: 'Freelancers',
              text: 'Keep invoices and project milestones on track across multiple clients.',
            },
            {
              id: 'usecase-legal',
              role: 'Legal and HR',
              text: 'Track sensitive correspondence with clear deadlines and full auditability.',
            },
          ].map((item, idx) => (
            <li
              key={item.id}
              data-reveal
              id={item.id}
              className="opacity-0"
              style={{
                animation: isRevealed(item.id) ? `slideUpIn 0.5s ease-out ${0.1 + idx * 0.05}s forwards` : 'none',
              }}
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
            Sign up to start
          </Link>
        </div>
      </Section>

      {/* Features - moved after use cases */}
      <Section id="features" className="py-12 md:py-16">
        <div className="mb-8 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Features
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Built for confidence
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            GPT-4o-mini handles natural language extraction. After that, everything is deterministic—events,
            state, alerts. You can edit or dismiss anything the model extracts. Full audit trail.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
              title: "Multiple reminders per email",
              description: "\"Send by Friday and let me know about Monday\" creates two separate reminders. Each tracked independently.",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              ),
              title: "Silence detection",
              description: "Get alerted when a conversation goes quiet for too long. No response in 3 days? Vigil notices.",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              ),
              title: "Full audit trail",
              description: "Every action is logged. Know exactly when a reminder was created, from which email, and who was notified.",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ),
              title: "Privacy by design",
              description: "Email bodies are processed by LLM, then discarded. Only extracted facts are stored. No full-text archive.",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ),
              title: "Event-sourced",
              description: "All state can be replayed from events. If there's ever a question, the complete history is available.",
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              ),
              title: "Smart notifications",
              description: "Alerts fire on transitions only. Warning → Critical triggers a notification. Staying at Warning doesn't.",
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
              <div className="w-10 h-10 rounded-lg bg-vigil-100 text-vigil-700 flex items-center justify-center mb-4">
                {feature.icon}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Reminders, Alerts & Reports */}
      <Section id="reminders" className="bg-surface-sunken border-y border-gray-200 py-12 md:py-16">
        <div className="mb-8 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Tracking & Notifications
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Track obligations, not noise
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Each obligation becomes its own reminder. Alerts fire only on meaningful transitions—OK
            to Warning, Warning to Critical. No fatigue. Only signal.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 ">
          {/* Reminders */}
          <div
            data-reveal
            id="reminder-card"
            className="panel p-6 opacity-0"
            style={{
              animation: isRevealed('reminder-card') ? 'slideUpIn 0.6s ease-out 0.1s forwards' : 'none',
            }}
          >
            <div className="w-10 h-10 rounded-lg bg-vigil-100 text-vigil-700 flex items-center justify-center mb-4">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Reminders</h3>
            <p className="text-base text-gray-600 mb-4 leading-relaxed">
              Each obligation in an email becomes its own reminder with preserved context.
              "Send budget by Friday" and "meeting next week" are tracked separately.
            </p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• Hard deadlines (explicit dates)</li>
              <li>• Soft deadlines (fuzzy timing)</li>
              <li>• Urgency signals (ASAP, urgent)</li>
              <li>• Silence-based (no activity)</li>
            </ul>
          </div>

          {/* Alerts */}
          <div
            data-reveal
            id="alert-card"
            className="panel p-6 opacity-0"
            style={{
              animation: isRevealed('alert-card') ? 'slideUpIn 0.6s ease-out 0.2s forwards' : 'none',
            }}
          >
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Alerts</h3>
            <p className="text-base text-gray-600 mb-4 leading-relaxed">
              Notifications fire only when urgency transitions—OK to Warning,
              Warning to Critical. No repeated alerts for the same state.
            </p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• Transition-based (prevents fatigue)</li>
              <li>• Multi-channel (email, webhook)</li>
              <li>• Configurable thresholds</li>
              <li>• Full traceability to source</li>
            </ul>
          </div>

          {/* Reports */}
          <div
            data-reveal
            id="report-card"
            className="panel p-6 opacity-0"
            style={{
              animation: isRevealed('report-card') ? 'slideUpIn 0.6s ease-out 0.3s forwards' : 'none',
            }}
          >
            <div className="w-10 h-10 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center mb-4">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Reports</h3>
            <p className="text-base text-gray-600 mb-4 leading-relaxed">
              Periodic summaries of watcher activity. Threads opened,
              closed, alerts sent, messages received—delivered on schedule.
            </p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• Daily or weekly digest</li>
              <li>• On-demand generation</li>
              <li>• Activity metrics</li>
              <li>• Delivered via email</li>
            </ul>
          </div>
        </div>

        <div className="text-center mt-8">
          <Link href="/learn/reminders" className="text-sm text-vigil-700 hover:text-vigil-800 font-medium">
            Learn about reminders
          </Link>
        </div>
      </Section>

      {/* Architecture */}
      <Section id="architecture" className="py-12 md:py-16">
        <div className="mb-8 md:mb-2">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Architecture
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Auditable by design
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Every action is logged. Every decision can be traced. If there's ever a question about
            what happened or why, the complete history is available. Zero trust required.
          </p>
        </div>

        <div className="text-left mb-8">
          <Link href="/learn/architecture" className="text-sm text-vigil-700 hover:text-vigil-800 font-medium">
            Explore system design
          </Link>
        </div>

        {/* Simple horizontal flow */}
        <div 
          data-reveal 
          id="arch-flow"
          className="panel p-8 mb-2 opacity-0"
          style={{
            animation: isRevealed('arch-flow') ? 'scaleIn 0.6s ease-out forwards' : 'none',
          }}
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-3">
            <div className="text-center flex-1">
              <div className="w-12 h-12 rounded-lg bg-vigil-100 text-vigil-700 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Email</p>
              <p className="text-xs text-gray-500">via Cloudflare</p>
            </div>
            
            <span aria-hidden className="text-3xl leading-none text-gray-400 font-light rotate-90 md:rotate-0">→</span>
            
            <div className="text-center flex-1">
              <div className="w-12 h-12 rounded-lg bg-vigil-100 text-vigil-700 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Watcher</p>
              <p className="text-xs text-gray-500">monitors inbox</p>
            </div>
            
            <span aria-hidden className="text-3xl leading-none text-gray-400 font-light rotate-90 md:rotate-0">→</span>
            
            <div className="text-center flex-1">
              <div className="w-12 h-12 rounded-lg bg-vigil-100 text-vigil-700 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Thread</p>
              <p className="text-xs text-gray-500">groups messages</p>
            </div>
            
            <span aria-hidden className="text-3xl leading-none text-gray-400 font-light rotate-90 md:rotate-0">→</span>
            
            <div className="text-center flex-1">
              <div className="w-12 h-12 rounded-lg bg-vigil-100 text-vigil-700 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Reminder</p>
              <p className="text-xs text-gray-500">tracks deadlines</p>
            </div>
            
            <span aria-hidden className="text-3xl leading-none text-gray-400 font-light rotate-90 md:rotate-0">→</span>
            
            <div className="text-center flex-1">
              <div className="w-12 h-12 rounded-lg bg-vigil-100 text-vigil-700 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Alert</p>
              <p className="text-xs text-gray-500">notifies you</p>
            </div>
          </div>
        </div>

      </Section>

      {/* Learn More */}
      <Section id="learn-more" className="bg-surface-sunken border-y border-gray-200 py-12 md:py-16">
        <div className="mb-8 md:mb-12">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Documentation
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Understand what it does
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-none">
            Vigil is not magic. Every decision is explainable. Read how it works, what it stores,
            and why you can trust it.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
          {[
            {
              href: '/learn/watchers',
              title: 'Watchers',
              description: 'Monitor emails for specific projects. Track conversations and get alerted when attention is needed.',
              delay: 0.1,
            },
            {
              href: '/learn/email-ingestion',
              title: 'Email forwarding',
              description: 'How to forward emails to Vigil, what gets tracked, and how duplicates are handled.',
              delay: 0.2,
            },
            {
              href: '/learn/event-extraction',
              title: 'Smart extraction',
              description: 'How Vigil finds deadlines, urgency signals, and completion indicators in your emails.',
              delay: 0.3,
            },
            {
              href: '/learn/reminders',
              title: 'Reminders',
              description: 'How one email creates multiple reminders, each with distinct context and traceability.',
              delay: 0.1,
            },
            {
              href: '/learn/architecture',
              title: 'How Vigil works',
              description: 'A complete history of everything that happens, making Vigil reliable and auditable.',
              delay: 0.2,
            },
            {
              href: '/learn/security',
              title: 'Security and data handling',
              description: 'What Vigil stores, what it discards, and how data flows through the system.',
              delay: 0.3,
            },
          ].map((item, idx) => (
            <Link 
              key={item.href}
              data-reveal
              id={`learn-${idx}`}
              href={item.href}
              className="panel p-5 hover:shadow-raised transition-all duration-150 group opacity-0"
              style={{
                animation: isRevealed(`learn-${idx}`) ? `slideUpIn 0.6s ease-out ${item.delay}s forwards` : 'none',
              }}
            >
              <h3 className="font-semibold text-gray-900 mb-1.5 group-hover:text-vigil-800 transition-colors">
                {item.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
            </Link>
          ))}
        </div>
      </Section>

      {/* Tell Your Team + CTA Combined */}
      <Section id="tell-your-team" className="py-12 md:py-16">
        <div className="grid lg:grid-cols-2 gap-6 lg:gap-14 items-start max-w-6xl mx-auto px-6 lg:px-8">
          {/* Left: Tell your team form */}
          <div
            data-reveal 
            id="tell-team"
            className="opacity-0"
            style={{
              animation: isRevealed('tell-team') ? 'slideInLeft 0.6s ease-out forwards' : 'none',
            }}
          >
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
              Need convincing?
            </p>
            <h2 className="text-2xl font-display font-semibold text-gray-900 tracking-tight mb-3">
              Share with your team
            </h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed max-w-none">
              When obligations fail quietly, entire teams pay the cost. Send them this.
            </p>
            <div className="panel p-6">
              <TellYourTeamForm />
            </div>
          </div>
          
          {/* Right: Direct CTA */}
          <div
            data-reveal 
            id="cta-ready"
            className="opacity-0"
            style={{
              animation: isRevealed('cta-ready') ? 'slideInRight 0.6s ease-out forwards' : 'none',
            }}
          >
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
              Ready to start?
            </p>
            <h2 className="text-2xl font-display font-semibold text-gray-900 tracking-tight mb-3">
              Start with confidence
            </h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed max-w-none">
              Create your first watcher. Forward emails that matter. Know what's being watched,
              what's resolved, and where attention is required—before silence becomes loss.
            </p>
            <div className="panel p-6 bg-vigil-900 text-white">
              <div className="mb-6">
                <p className="text-vigil-200 text-sm mb-1">Free plan includes:</p>
                <ul className="text-sm space-y-1.5 text-vigil-100">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-vigil-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    2 watchers
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-vigil-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    50 emails per week
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-vigil-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Full event archive
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-vigil-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Email notifications
                  </li>
                </ul>
              </div>
              <Link href="/auth/register" className="btn bg-white text-vigil-900 hover:bg-gray-100 w-full justify-center py-3 font-medium">
                Create free account
              </Link>
              <p className="text-center text-vigil-300 text-xs mt-3">
                No credit card required
              </p>
            </div>
            <div className="mt-4 text-center">
              <span className="text-sm text-gray-500">Already have an account? </span>
              <Link href="/auth/login" className="text-sm text-vigil-700 hover:text-vigil-800 font-medium">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-surface-page">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <p className="font-display font-semibold text-gray-900 mb-3">Vigil</p>
              <p className="text-sm text-gray-500">
                LLM-assisted email vigilance.
                Event-sourced oversight.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Product</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#how-it-works" className="hover:text-gray-700">How it works</a></li>
                <li><a href="#features" className="hover:text-gray-700">Features</a></li>
                <li><Link href="/auth/register" className="hover:text-gray-700">Get started</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Documentation</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/learn/watchers" className="hover:text-gray-700">Watchers</Link></li>
                <li><Link href="/learn/email-ingestion" className="hover:text-gray-700">Email ingestion</Link></li>
                <li><Link href="/learn/reminders" className="hover:text-gray-700">Reminders</Link></li>
                <li><Link href="/learn/architecture" className="hover:text-gray-700">Architecture</Link></li>
                <li><Link href="/learn/security" className="hover:text-gray-700">Security</Link></li>
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
          <div className="divider my-8" />
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
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
