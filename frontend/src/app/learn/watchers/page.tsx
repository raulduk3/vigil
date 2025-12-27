import Link from 'next/link';
import { InfoCard } from '@/components/learn/InfoCard';
import { FeatureGrid } from '@/components/learn/FeatureGrid';
import { StatusList } from '@/components/learn/StatusList';
import { ExampleBox } from '@/components/learn/ExampleBox';

export default function WatchersPage() {
  return (
    <article className="py-8 lg:py-12">
      <div className="mx-auto px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm">
          <Link href="/" className="text-gray-500 hover:text-gray-700">Home</Link>
          <span className="mx-2 text-gray-400">/</span>
          <Link href="/#learn-more" className="text-gray-500 hover:text-gray-700">Documentation</Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-900">Watchers</span>
        </nav>

        {/* Header */}
        <header className="mb-10">
          <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">
            Core Concepts
          </p>
          <h1 className="text-3xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Watchers
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed max-w-2xl">
            A watcher monitors emails for a specific project or category. It tracks conversations and alerts you when something needs attention.
          </p>
        </header>

        {/* Content */}
        <div className="space-y-14 lg:space-y-16">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">What is a watcher?</h2>
            <p className="text-gray-600 leading-relaxed mb-6 text-[15px]">
              Think of a watcher like a folder for tracking important conversations. Each watcher has its own email address, and when you forward messages to that address, Vigil starts monitoring them.
            </p>

            <ExampleBox title="Example">
              <p>You might create watchers for:</p>
              <ul className="list-disc pl-5 mt-3 space-y-2">
                <li>Client projects</li>
                <li>Personal bills and invoices</li>
                <li>Legal correspondence</li>
                <li>Team coordination</li>
              </ul>
            </ExampleBox>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">How watchers track conversations</h2>
            <StatusList
              items={[
                {
                  label: 'Active',
                  description: 'Conversations where you\'re waiting for a response or something needs to be done.',
                  status: 'ok'
                },
                {
                  label: 'Needs attention',
                  description: 'Conversations with approaching deadlines or important updates.',
                  status: 'warning'
                },
                {
                  label: 'Urgent',
                  description: 'Conversations that require immediate action or have passed their deadline.',
                  status: 'critical'
                },
                {
                  label: 'Complete',
                  description: 'Conversations that are resolved or no longer need tracking.',
                  status: 'neutral'
                }
              ]}
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Key features</h2>
            <FeatureGrid
              features={[
                {
                  title: 'Unique email address',
                  description: 'Each watcher gets its own forwarding address. Set up forwarding rules in your email to automatically monitor specific conversations.'
                },
                {
                  title: 'Independent settings',
                  description: 'Customize notification preferences, urgency rules, and timing for each watcher separately.'
                },
                {
                  title: 'Thread grouping',
                  description: 'Related emails are automatically grouped together so you see the full conversation history.'
                },
                {
                  title: 'Smart notifications',
                  description: 'Get notified only when action is needed—not for every email received.'
                }
              ]}
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">What gets tracked</h2>
            <div className="space-y-4">
              <InfoCard
                title="Deadlines"
                description="When someone mentions a due date or response timeframe, Vigil tracks it and reminds you before it's too late."
                variant="primary"
              />
              <InfoCard
                title="Urgency signals"
                description="Keywords like 'urgent', 'ASAP', or 'time-sensitive' automatically increase the priority of that conversation."
                variant="warning"
              />
              <InfoCard
                title="Conversation status"
                description="Vigil detects when conversations are resolved (like 'thanks, all set') and stops sending notifications."
                variant="success"
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Setting up a watcher</h2>
            <ExampleBox>
              <p className="font-semibold mb-3">Creating a watcher named "Client Work":</p>
              <ol className="list-decimal pl-5 space-y-3">
                <li>Click "New Watcher" in your dashboard</li>
                <li>Name it "Client Work"</li>
                <li>Copy the unique email address (e.g., <code className="text-sm bg-gray-100 px-1.5 py-0.5 rounded">client-work-a7f3k9@ingest.email.vigil.run</code>)</li>
                <li>Set up a forwarding rule in Gmail or Outlook to forward client emails to this address</li>
                <li>Vigil starts monitoring those conversations automatically</li>
              </ol>
            </ExampleBox>
          </section>
        </div>

        {/* Navigation */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex justify-between">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to home
          </Link>
          <Link href="/learn/email-ingestion" className="text-sm link">
            Email ingestion →
          </Link>
        </div>
      </div>
    </article>
  );
}
