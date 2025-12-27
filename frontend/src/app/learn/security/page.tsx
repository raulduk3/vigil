import Link from 'next/link';
import { InfoCard } from '@/components/learn/InfoCard';
import { FeatureGrid } from '@/components/learn/FeatureGrid';
import { StatusList } from '@/components/learn/StatusList';
import { ExampleBox } from '@/components/learn/ExampleBox';

export default function SecurityPage() {
  return (
    <article className="py-8 lg:py-12">
      <div className="mx-auto px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm">
          <Link href="/" className="text-gray-500 hover:text-gray-700">Home</Link>
          <span className="mx-2 text-gray-400">/</span>
          <Link href="/#learn-more" className="text-gray-500 hover:text-gray-700">Documentation</Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-900">Security</span>
        </nav>

        {/* Header */}
        <header className="mb-8">
          <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-2">
            Trust &amp; Safety
          </p>
          <h1 className="text-3xl font-display font-semibold text-gray-900 tracking-tight mb-3">
            Security and data handling
          </h1>
          <p className="text-base text-gray-600 leading-relaxed">
            Vigil is designed with minimal data retention and zero autonomous action.
            You control what enters the system. Vigil never acts on your behalf.
          </p>
        </header>

        {/* Content */}
        <div className="space-y-10 lg:space-y-12">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">No inbox access</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Vigil doesn't connect to your email provider. No OAuth, no credentials stored.
              Email arrives through explicit forwarding only.
            </p>

            <FeatureGrid
              features={[
                {
                  title: "You decide what Vigil sees",
                  description: "Only forwarded messages enter the system. Nothing else.",
                },
                {
                  title: "No credential storage",
                  description: "No passwords, no tokens—nothing to leak or compromise.",
                },
                {
                  title: "Provider-agnostic",
                  description: "Works with any email service that supports forwarding.",
                },
              ]}
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">What Vigil stores</h2>
            
            <StatusList
              items={[
                {
                  label: "Message metadata",
                  description: "Subject, sender, recipient, timestamps, and message identifiers.",
                  status: "ok",
                },
                {
                  label: "Extracted facts",
                  description: "Deadlines, urgency signals, and completion indicators found in emails.",
                  status: "ok",
                },
                {
                  label: "Conversation state",
                  description: "Status, last activity time, and urgency level for each thread.",
                  status: "ok",
                },
                {
                  label: "Event history",
                  description: "Complete, immutable log of all changes and actions.",
                  status: "ok",
                },
              ]}
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">What Vigil discards</h2>
            
            <div className="space-y-3 mt-6">
              <InfoCard
                variant="default"
                title="Full message bodies"
                description="Read once for extraction, then immediately deleted. Never stored."
              />
              <InfoCard
                variant="default"
                title="Attachments"
                description="Filenames and sizes are logged, but file content is never stored."
              />
              <InfoCard
                variant="default"
                title="HTML rendering"
                description="Converted to plain text for analysis, then discarded."
              />
            </div>

            <ExampleBox title="Important" className="mt-6">
              <p>
                Vigil stores extracted facts (like "deadline: March 15"), not original sentences.
                If the email said "Please respond by March 15", only the deadline date is kept.
              </p>
            </ExampleBox>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Bounded analysis</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              The analysis system is deliberately constrained to extract facts only:
            </p>

            <FeatureGrid
              features={[
                {
                  title: "Extracts information",
                  description: "Finds deadlines, urgency signals, and completion indicators.",
                },
                {
                  title: "Does NOT interpret",
                  description: "Never guesses intent, makes decisions, or schedules work.",
                },
                {
                  title: "No external access",
                  description: "Cannot access other systems or take any actions.",
                },
                {
                  title: "No memory",
                  description: "Doesn't store or remember content between processing requests.",
                },
              ]}
            />

            <p className="text-gray-600 mt-4 leading-relaxed">
              Email bodies are seen only during extraction. They're deleted immediately after. 
              The analysis system has no persistent memory of content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">No autonomous action</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Vigil is strictly observational. It will never:
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              {[
                "Send replies on your behalf",
                "Create calendar events",
                "Assign tasks in external systems",
                "Contact senders directly",
                "Make decisions requiring judgment",
                "Modify your email settings",
              ].map((item) => (
                <div key={item} className="panel p-4 flex gap-3 items-start">
                  <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                  <p className="text-sm text-gray-700">{item}</p>
                </div>
              ))}
            </div>

            <ExampleBox title="Design principle" className="mt-4">
              <p>
                Vigil observes and alerts. You decide what to do. This is intentional, 
                not a missing feature.
              </p>
            </ExampleBox>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Sender allowlists</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Each watcher can configure which email addresses it tracks:
            </p>

            <div className="space-y-3">
              <InfoCard
                variant="success"
                title="Allowed senders"
                description="Create conversations and generate alerts as configured."
              />
              <InfoCard
                variant="neutral"
                title="Unknown senders"
                description="Are logged for your records but don't create conversations or alerts."
              />
            </div>

            <p className="text-gray-600 mt-4 leading-relaxed">
              This prevents spam and unwanted emails from creating noise in your monitoring.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Data isolation</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Watchers are completely isolated from each other. It's impossible to:
            </p>

            <FeatureGrid
              features={[
                {
                  title: "Cross-watcher queries",
                  description: "Information from different watchers cannot be queried together.",
                },
                {
                  title: "Thread merging",
                  description: "Conversations from different watchers stay separate.",
                },
                {
                  title: "Data sharing",
                  description: "Extracted information never crosses watcher boundaries.",
                },
              ]}
            />

            <p className="text-gray-600 mt-4 leading-relaxed">
              This isolation is enforced at the database level, making it structurally impossible 
              to violate.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Data deletion</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              When you delete a watcher:
            </p>

            <div className="space-y-3">
              <InfoCard
                variant="default"
                title="Status changes to deleted"
                description="The watcher is marked as deleted and can no longer receive emails."
              />
              <InfoCard
                variant="default"
                title="Address becomes inactive"
                description="The ingestion email address stops working immediately."
              />
              <InfoCard
                variant="default"
                title="History is preserved"
                description="All events remain in the system for audit trail purposes."
              />
            </div>

            <p className="text-gray-600 mt-4 leading-relaxed">
              For complete data removal (GDPR compliance), contact support. We can permanently 
              delete all associated data upon request.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Encryption</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              <InfoCard
                variant="primary"
                title="In transit"
                description="All connections use TLS 1.3 encryption to protect data while moving."
              />
              <InfoCard
                variant="primary"
                title="At rest"
                description="Database storage uses AES-256 encryption to protect stored data."
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Access controls</h2>
            <p className="text-gray-600 mb-4 leading-relaxed">
              Authentication uses email magic links or OAuth (Google, GitHub). All sessions are:
            </p>

            <FeatureGrid
              features={[
                {
                  title: "Time-limited",
                  description: "Sessions automatically expire after a set period.",
                },
                {
                  title: "Device-bound",
                  description: "Linked to your device fingerprint for added security.",
                },
                {
                  title: "Revocable",
                  description: "You can manually revoke sessions from your account settings.",
                },
                {
                  title: "Isolated",
                  description: "Each user can only access their own watchers.",
                },
              ]}
            />

            <p className="text-gray-600 mt-4 leading-relaxed">
              There is no admin backdoor for viewing customer data. Your information stays yours.
            </p>
          </section>
        </div>

        {/* Navigation */}
        <div className="mt-10 pt-6 border-t border-gray-200 flex justify-between">
          <Link href="/learn/architecture" className="text-sm text-gray-500 hover:text-gray-700">
            ← Architecture
          </Link>
          <Link href="/" className="text-sm link">
            Back to home →
          </Link>
        </div>
      </div>
    </article>
  );
}
