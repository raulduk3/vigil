'use client';
import Link from 'next/link';
import { PublicHeader, Footer } from '@/components/layout';

function Section({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={className}>
      <div className="site-shell">{children}</div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader />

      {/* Hero */}
      <header className="pt-36 pb-14 md:pt-44 md:pb-16 relative overflow-hidden bg-surface-page z-[2]">
        <div aria-hidden="true" className="hero-texture absolute inset-0 z-0" style={{ backgroundImage: 'url(/hero-texture.png)', backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', opacity: 0.19 }} />
        <div className="absolute inset-0 z-0 bg-[#E5E5E6]/10" />
        <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-[#E5E5E6]/35 via-[#E5E5E6]/20 to-transparent" />

        <div className="site-shell relative z-10">
          <div className="relative max-w-3xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-vigil-700 mb-5">Open source · Self-hosted · BYOK</p>
            <h1 className="text-5xl md:text-6xl font-display font-semibold text-gray-900 tracking-tight mb-7 text-balance leading-[1.1]" style={{ wordSpacing: '0.08em' }}>
              AI email triage.<br />
              Multi-model pipeline.
            </h1>
            <p className="text-lg md:text-xl text-gray-700 mb-8 leading-relaxed max-w-3xl">
              Vigil is an open source email agent. Forward emails to it and the agent reads each one, tracks
              conversation threads, builds persistent memory, and decides what to do. Usually nothing.
              No inbox access. No stored bodies. Bring your own API key.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/learn/architecture" className="btn btn-primary">Architecture</Link>
              <Link href="/learn/agent" className="text-sm text-vigil-700 font-medium hover:text-vigil-800 flex items-center">How the agent works →</Link>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
      </header>

      {/* What it does */}
      <Section className="landing-section py-16 md:py-20">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <p className="landing-section-kicker text-center">What it does</p>
          <h2 className="landing-section-title text-center mt-3">Reads email. Remembers context. Acts only when needed.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: 'Reads everything', desc: 'Every forwarded email gets analyzed: sender, intent, urgency, entities. The body is discarded after processing. Only a SHA-256 hash is retained.' },
            { title: 'Remembers across emails', desc: 'The agent writes structured memory after each email. Vendor patterns, deadlines, response habits. BM25 + time-decay retrieval without embeddings.' },
            { title: 'Acts sparingly', desc: 'Most emails result in a quiet memory update. The agent fires tools — alerts, webhooks — only when its judgment says something actually requires attention.' },
          ].map((item) => (
            <div key={item.title} className="panel p-6">
              <h3 className="font-semibold text-gray-900 mb-3">{item.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Pipeline */}
      <Section className="landing-section landing-section-banded border-y border-gray-200 py-14 md:py-20">
        <div className="max-w-3xl mx-auto text-center mb-10">
          <p className="landing-section-kicker text-center">Pipeline</p>
          <h2 className="landing-section-title text-center mt-3">Multi-model classification pipeline</h2>
          <p className="text-base text-gray-600 mt-4 leading-relaxed">
            A nano model pre-screens every email before full triage, eliminating roughly 40% of LLM spend
            on clearly ignorable mail. The full triage model only runs when pre-screening deems it necessary.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl mx-auto">
          {[
            { stage: '1. Pre-screen', detail: 'gpt-4.1-nano classifies urgency. ~$0.0001/email.' },
            { stage: '2. Context load', detail: 'Relevant memories retrieved via BM25 + time decay.' },
            { stage: '3. Full triage', detail: 'gpt-4.1-mini analyzes, extracts entities, decides.' },
            { stage: '4. Tool execution', detail: 'Alert, webhook, thread update — or nothing.' },
          ].map((item) => (
            <div key={item.stage} className="panel p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-vigil-700 mb-2">{item.stage}</p>
              <p className="text-sm text-gray-600 leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* BYOK - Bring Your Own Key */}
      <Section className="landing-section py-14 md:py-20">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <p className="landing-section-kicker text-center">Bring Your Own Key</p>
          <h2 className="landing-section-title text-center mt-3">Your keys. Your models. Your cost.</h2>
          <p className="text-base text-gray-600 mt-4 leading-relaxed">
            Vigil is free software. Connect your own OpenAI, Anthropic, or Google API key and pay your provider directly at their published rates. No platform fees, no markup.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { title: 'Any provider', desc: 'Bring your own OpenAI, Anthropic, or Google API key. Switch anytime.' },
            { title: 'Pick per watcher', desc: 'Nano models for cheap triage, pro models for complex analysis. Mix and match.' },
            { title: 'No markup', desc: 'You pay your provider directly at their API rates. Vigil adds nothing.' },
            { title: 'Encrypted at rest', desc: 'Keys are stored with AES-256-GCM encryption. Never logged, never exposed.' },
          ].map((item) => (
            <div key={item.title} className="panel p-6">
              <h3 className="font-semibold text-gray-900 mb-3">{item.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link href="/pricing" className="text-sm text-vigil-700 font-medium hover:text-vigil-800">See model costs per email →</Link>
        </div>
      </Section>

      {/* Privacy model */}
      <Section className="landing-section py-14 md:py-18">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="landing-section-kicker">Privacy model</p>
            <h2 className="landing-section-title mt-3">Your email never leaves your provider.</h2>
            <p className="text-base text-gray-600 mt-4 leading-relaxed">
              Vigil never connects to your inbox. No OAuth, no passwords, no API tokens to your email account.
              A standard forwarding rule sends a copy. The email body is processed in memory and discarded.
              Stop by deleting the forwarding rule.
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

      {/* Docs */}
      <Section id="docs" className="landing-section landing-section-banded border-y border-gray-200 py-14 md:py-18">
        <div className="mb-8 text-center">
          <p className="landing-section-kicker text-center">Documentation</p>
          <h2 className="landing-section-title text-center mt-3">Everything is documented.</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { href: '/learn/watchers', title: 'Watchers', desc: 'Agents with custom prompts and tools.' },
            { href: '/learn/agent', title: 'The Agent', desc: 'How it analyzes, remembers, and decides.' },
            { href: '/learn/memory', title: 'Memory System', desc: 'How context builds across all emails.' },
            { href: '/learn/email-ingestion', title: 'Email Setup', desc: 'Forwarding rules and filter configuration.' },
            { href: '/learn/architecture', title: 'Architecture', desc: 'Data flow, privacy model, what gets stored.' },
            { href: '/learn/security', title: 'Security', desc: 'What is discarded. What is kept. Why.' },
            { href: '/learn/integrations', title: 'API and Integrations', desc: 'REST API, webhooks, any framework.' },
            { href: '/extension', title: 'Chrome Extension', desc: 'Guided setup for Gmail and Outlook.' },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="panel p-4 hover:-translate-y-0.5 transition-transform group">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-vigil-800">{item.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Footer />
    </div>
  );
}
