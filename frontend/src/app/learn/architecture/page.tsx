import Link from 'next/link';
import { InfoCard } from '@/components/learn/InfoCard';
import { FeatureGrid } from '@/components/learn/FeatureGrid';
import { StepList } from '@/components/learn/StepList';
import { ExampleBox } from '@/components/learn/ExampleBox';

export default function ArchitecturePage() {
  return (
    <article className="py-8 lg:py-12">
      <div className="mx-auto px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm">
          <Link href="/" className="text-gray-500 hover:text-gray-700">Home</Link>
          <span className="mx-2 text-gray-400">/</span>
          <Link href="/#learn-more" className="text-gray-500 hover:text-gray-700">Documentation</Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-900">How Vigil Works</span>
        </nav>

        {/* Header */}
        <header className="mb-8">
          <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-2">
            System Design
          </p>
          <h1 className="text-3xl font-display font-semibold text-gray-900 tracking-tight mb-3">
            How Vigil works
          </h1>
          <p className="text-base text-gray-600 leading-relaxed">
            Vigil keeps a complete history of everything that happens. This design makes it 
            reliable, auditable, and easy to understand why you receive each alert.
          </p>
        </header>

        {/* Content */}
        <div className="space-y-10 lg:space-y-12">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">The basic flow</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Here's what happens from the moment you forward an email to when you get notified:
            </p>

            <StepList
              steps={[
                {
                  title: "You forward an email",
                  description: "You set up a forwarding rule, and emails automatically go to your watcher's address.",
                },
                {
                  title: "Vigil reads and extracts",
                  description: "The email is analyzed to find deadlines, requests, and completion signals.",
                },
                {
                  title: "Information is saved",
                  description: "The extracted facts and metadata are stored. The full email content is deleted.",
                },
                {
                  title: "Urgency is tracked",
                  description: "As deadlines approach, Vigil monitors how urgent each item becomes.",
                },
                {
                  title: "You get notified",
                  description: "When urgency changes (like going from OK to Warning), you receive an alert.",
                },
              ]}
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Complete history</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Unlike traditional apps that just save the current state, Vigil saves every change 
              as it happens. This means you can always see the full history of any conversation.
            </p>

            <div className="grid md:grid-cols-2 gap-4 mt-6">
              <InfoCard
                variant="warning"
                title="Traditional approach"
                description="Single status like 'Waiting for response' with a last-updated timestamp. Changes overwrite history, so you can't tell what happened before."
              />
              <InfoCard
                variant="success"
                title="Vigil's approach"
                description="Email received → Deadline found → Alert sent → Reply received. Every step is recorded, so the full story stays available."
              />
            </div>

            <ExampleBox title="Why this matters" className="mt-6">
              <p>
                If you ever wonder "Why did I get this alert?", you can trace it back to the 
                exact email and extracted information that triggered it. Nothing is hidden or lost.
              </p>
            </ExampleBox>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Key principles</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Vigil follows several important principles to ensure it works reliably:
            </p>

            <div className="space-y-3 mt-6">
              <InfoCard
                variant="primary"
                title="Predictable behavior"
                description="The same email will always produce the same results. No randomness or variability."
              />
              <InfoCard
                variant="primary"
                title="Everything is recorded"
                description="Every change is saved and never deleted. You have a complete audit trail."
              />
              <InfoCard
                variant="primary"
                title="Explainable alerts"
                description="Every notification can be traced back to a specific email and the information extracted from it."
              />
              <InfoCard
                variant="primary"
                title="Isolated watchers"
                description="Each watcher is completely separate. Information never crosses between them."
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Design constraints</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Vigil intentionally limits what it can do to keep it safe and predictable:
            </p>

            <FeatureGrid
              features={[
                {
                  title: "Facts only",
                  description: "Vigil only extracts explicit information. It never guesses or interprets intent.",
                },
                {
                  title: "No autonomous actions",
                  description: "Vigil never sends emails, creates calendar events, or makes decisions for you.",
                },
                {
                  title: "Alert once per change",
                  description: "When urgency changes from OK to Warning, you get notified once—not repeatedly.",
                },
                {
                  title: "Minimal data storage",
                  description: "Email bodies are never stored. Only extracted facts and metadata are kept.",
                },
              ]}
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">How time works</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Vigil regularly checks your watchers (typically every 15 minutes) to see if any 
              deadlines are getting closer. During each check:
            </p>

            <StepList
              steps={[
                {
                  title: "Review active watchers",
                  description: "All watchers with open conversations are evaluated.",
                },
                {
                  title: "Calculate urgency",
                  description: "For each conversation with a deadline, urgency is recalculated based on how much time is left.",
                },
                {
                  title: "Detect changes",
                  description: "If urgency has increased (like going from OK to Warning), a reminder is generated.",
                },
                {
                  title: "Send notifications",
                  description: "New reminders trigger alerts through your configured notification channels.",
                },
              ]}
            />

            <ExampleBox className='mt-6'>
              <p>
                <strong>Important:</strong> Time checks don't change your stored information. 
                They only evaluate what's already there and generate new alerts when thresholds 
                are crossed.
              </p>
            </ExampleBox>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Why this approach?</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Most apps only save the current state. When you update or delete something, the 
              previous information is lost. For tracking time-sensitive communications, this 
              creates problems:
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <InfoCard
                variant="warning"
                title="Traditional approach problem"
                description="When data is overwritten, you can't explain why something changed. If urgency increased, why? Unknown."
              />
              <InfoCard
                variant="success"
                title="Vigil's solution"
                description="Every change is preserved. You can replay the entire history to understand exactly what happened and why."
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Data storage</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Vigil stores information in a structured database. Here's what's saved:
            </p>

            <FeatureGrid
              features={[
                {
                  title: "Unique identifiers",
                  description: "Every event and message gets a unique ID so it can be referenced.",
                },
                {
                  title: "Watcher association",
                  description: "Each piece of information is linked to its watcher to maintain isolation.",
                },
                {
                  title: "Event details",
                  description: "What happened, when it happened, and what information was involved.",
                },
                {
                  title: "Ordering",
                  description: "Events are kept in the exact order they occurred for accurate replay.",
                },
              ]}
            />

            <p className="text-gray-600 mt-4 leading-relaxed">
              Once saved, information is never modified or deleted (except when you explicitly 
              delete a watcher). This immutability guarantees that history remains accurate.
            </p>
          </section>
        </div>

        {/* Navigation */}
        <div className="mt-10 pt-6 border-t border-gray-200 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
          <Link href="/learn/alerts" className="text-sm text-gray-500 hover:text-gray-700">
            ← Notifications
          </Link>
          <Link href="/learn/security" className="text-sm link">
            Security →
          </Link>
        </div>
      </div>
    </article>
  );
}
