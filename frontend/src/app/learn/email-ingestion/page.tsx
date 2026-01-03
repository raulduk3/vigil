import Link from 'next/link';
import { InfoCard } from '@/components/learn/InfoCard';
import { FeatureGrid } from '@/components/learn/FeatureGrid';
import { StepList } from '@/components/learn/StepList';
import { ExampleBox } from '@/components/learn/ExampleBox';

export default function EmailIngestionPage() {
  return (
    <article className="py-8 lg:py-12">
      <div className="mx-auto px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm">
          <Link href="/" className="text-gray-500 hover:text-gray-700">Home</Link>
          <span className="mx-2 text-gray-400">/</span>
          <Link href="/#learn-more" className="text-gray-500 hover:text-gray-700">Documentation</Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-900">Email Ingestion</span>
        </nav>

        {/* Header */}
        <header className="mb-10">
          <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">
            Core Concepts
          </p>
          <h1 className="text-3xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Email ingestion and forwarding
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed max-w-2xl">
            Vigil receives email through explicit forwarding. No inbox access, no OAuth,
            no credential storage. You control exactly what Vigil sees.
          </p>
        </header>

        {/* Content */}
        <div className="space-y-14 lg:space-y-16">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">How forwarding works</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Each watcher has its own unique email address. To track emails, you simply set 
              up a forwarding rule in your email provider (Gmail, Outlook, etc.) to automatically 
              forward specific messages to this address.
            </p>

            <ExampleBox title="Example Address" className="mt-6">
              <code className="text-sm font-mono text-gray-800">
                finance-a7f3k9@vigil.run
              </code>
              <p className="mt-2">or</p>
              <code className="text-sm font-mono text-gray-800">
                client-billing-x4p9j2@vigil.run
              </code>
            </ExampleBox>

            <p className="text-gray-600 mt-6 leading-relaxed text-[15px]">
              The unique code in the address ensures your emails go to the right watcher.
              Only emails sent to this specific address will be tracked.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">What Vigil tracks</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              When you forward an email, Vigil captures and saves:
            </p>

            <FeatureGrid
              features={[
                {
                  title: "Subject and sender",
                  description: "Who sent it and what it's about. Used to organize conversations.",
                },
                {
                  title: "Recipients",
                  description: "Who was on the to: and cc: lines. Helps track who's involved.",
                },
                {
                  title: "Timestamps",
                  description: "When it was sent and when Vigil received it.",
                },
                {
                  title: "Important facts",
                  description: "Deadlines, requests, and completion signals extracted from the content.",
                },
              ]}
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">What Vigil doesn't save</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              To protect your privacy, Vigil reads the email content to extract important
              information, then immediately discards it:
            </p>

            <div className="space-y-4">
              <InfoCard
                variant="default"
                title="Full message body"
                description="Read for extraction, then deleted. Never stored."
              />
              <InfoCard
                variant="default"
                title="Attachments"
                description="Vigil logs filenames and sizes but never stores the actual files."
              />
              <InfoCard
                variant="default"
                title="Email formatting"
                description="HTML and styling are converted to plain text for reading, then discarded."
              />
            </div>

            <ExampleBox title="Important" className="mt-6">
              <p>
                Vigil stores the <strong>facts it extracts</strong> (like "deadline: March 15"), 
                not the original sentences. This keeps your data minimal and private.
              </p>
            </ExampleBox>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Preventing duplicates</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              If you accidentally forward the same email twice, or it arrives through multiple
              forwarding rules, Vigil automatically detects and ignores duplicates. Each email
              is only processed once.
            </p>

            <StepList
              steps={[
                {
                  title: "Check email identifier",
                  description: "Uses the Message-ID header (a unique code every email has) to identify duplicates.",
                },
                {
                  title: "Compare to existing emails",
                  description: "Looks for any email with the same identifier within this watcher.",
                },
                {
                  title: "Skip if duplicate",
                  description: "If found, logs that it was received but doesn't process it again.",
                },
              ]}
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Grouping related emails</h2>
            <p className="text-gray-600 mb-5 leading-relaxed text-[15px]">
              Vigil automatically groups related emails into conversations (threads). This helps
              you see all messages about the same topic together.
            </p>

            <p className="text-gray-600 mb-5 leading-relaxed text-[15px]">
              Emails are grouped together when they:
            </p>

            <div className="space-y-4">
              <InfoCard
                variant="primary"
                title="Reply to each other"
                description="Email programs mark replies with special headers. Vigil uses these to connect messages."
              />
              <InfoCard
                variant="primary"
                title="Have the same subject and people"
                description="Messages with the same subject line (like 'Budget Review') involving the same people are grouped together."
              />
            </div>

            <ExampleBox className="mt-6">
              <p><strong>Example:</strong></p>
              <p className="mt-2">
                If someone emails you "Budget review for Q1" and you reply, then they reply back,
                all three messages appear as one conversation in Vigil.
              </p>
            </ExampleBox>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">What happens when an email arrives</h2>
            
            <StepList
              steps={[
                {
                  title: "Email is received",
                  description: "Vigil receives your forwarded email and parses it.",
                },
                {
                  title: "Basic check",
                  description: "Validates the sender and checks if this watcher is active and allowed to receive it.",
                },
                {
                  title: "Extract information",
                  description: "Reads the email to find deadlines, requests, and completion signals.",
                },
                {
                  title: "Find or create conversation",
                  description: "Determines if this belongs to an existing conversation or starts a new one.",
                },
                {
                  title: "Discard the content",
                  description: "Saves the extracted facts and metadata, then deletes the full email body.",
                },
              ]}
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Reliability</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Vigil is designed to be reliable and predictable:
            </p>

            <FeatureGrid
              features={[
                {
                  title: "Never silently drops emails",
                  description: "Every received message is recorded, even if there's an error processing it.",
                },
                {
                  title: "Handles duplicates safely",
                  description: "Forwarding the same email multiple times has the same result as forwarding it once.",
                },
                {
                  title: "Maintains order",
                  description: "Messages within a watcher are kept in the order they arrived.",
                },
                {
                  title: "Explicit tracking",
                  description: "If Vigil misses an email (like when a watcher is paused), you need to resend it. This keeps tracking accurate.",
                },
              ]}
            />
          </section>
        </div>

        {/* Navigation */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex justify-between">
          <Link href="/learn/watchers" className="text-sm text-gray-500 hover:text-gray-700">
            ← Watchers
          </Link>
          <Link href="/learn/event-extraction" className="text-sm link">
            Smart extraction →
          </Link>
        </div>
      </div>
    </article>
  );
}