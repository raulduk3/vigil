'use client';

import Link from 'next/link';
import { PublicHeader, Footer } from '@/components/layout';

const posts = [
  {
    slug: 'the-650-billion-email-problem',
    title: 'The $650 Billion Email Problem Nobody Is Actually Solving',
    date: 'March 15, 2026',
    excerpt: 'Email costs the US economy $650 billion a year in lost productivity. AI tools help you read faster, but nobody tracks what you owe people and what they owe you.',
    tag: 'industry',
  },
  {
    slug: 'why-vigil-exists',
    title: 'Why Vigil Exists',
    date: 'March 14, 2026',
    excerpt: 'Email is the last unautomated channel. Google and Microsoft help you read it faster. Nobody helps you track what you owe people and what they owe you.',
    tag: 'company',
  },
  {
    slug: 'no-inbox-access',
    title: 'Why We Never Touch Your Inbox',
    date: 'March 14, 2026',
    excerpt: 'Most email tools ask for OAuth access. Vigil works through forwarding. This isn\'t a limitation — it\'s the architecture. Here\'s why that matters.',
    tag: 'privacy',
  },
  {
    slug: 'email-agents-vs-email-clients',
    title: 'Email Agents vs Email Clients',
    date: 'March 14, 2026',
    excerpt: 'Superhuman, Shortwave, and Spark make you faster at reading email. Vigil is different. It reads email for you and acts on what it finds.',
    tag: 'product',
  },
  {
    slug: 'obligation-tracking',
    title: 'What is Email Obligation Tracking?',
    date: 'March 14, 2026',
    excerpt: 'Every email thread carries implicit obligations. Someone is waiting. A deadline is approaching. A confirmation never arrived. Vigil watches for these gaps.',
    tag: 'product',
  },
  {
    slug: 'vigil-for-developers',
    title: 'Vigil for Developers: Email Awareness for Any Agent',
    date: 'March 14, 2026',
    excerpt: 'Give your AI agent email awareness in 5 minutes. Vigil is the email sense organ for autonomous systems — an API that reads, remembers, and acts.',
    tag: 'developers',
  },
  {
    slug: 'pay-per-use',
    title: 'Why Pay-Per-Use Beats Subscriptions for Email Tools',
    date: 'March 14, 2026',
    excerpt: 'You shouldn\'t pay $30/month for an email tool you use 10 times a day. Vigil charges fractions of a penny per email. Here\'s the math.',
    tag: 'pricing',
  },
];

const tagColors: Record<string, string> = {
  company: 'badge-neutral',
  privacy: 'badge-ok',
  product: 'badge-warning',
  developers: 'badge-created',
  pricing: 'badge-neutral',
  industry: 'badge-neutral',
};

export default function BlogIndex() {
  return (
    <div className="min-h-screen bg-surface-page">
      <PublicHeader />
      <main className="pt-28 pb-20">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="text-3xl md:text-4xl font-display font-semibold text-gray-900 tracking-tight mb-3">Blog</h1>
          <p className="text-lg text-gray-600 mb-10">Thoughts on email, AI agents, privacy, and building Vigil.</p>

          <div className="space-y-6">
            {posts.map(post => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="panel p-6 block hover:shadow-raised transition-shadow group">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`badge badge-sm ${tagColors[post.tag] || 'badge-neutral'}`}>{post.tag}</span>
                  <span className="text-xs text-gray-400">{post.date}</span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 group-hover:text-vigil-800 transition-colors mb-2">{post.title}</h2>
                <p className="text-sm text-gray-600 leading-relaxed">{post.excerpt}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
