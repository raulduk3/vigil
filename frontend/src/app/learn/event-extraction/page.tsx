import Link from 'next/link';
import { InfoCard } from '@/components/learn/InfoCard';
import { FeatureGrid } from '@/components/learn/FeatureGrid';
import { StatusList } from '@/components/learn/StatusList';
import { ExampleBox } from '@/components/learn/ExampleBox';

export default function EventExtractionPage() {
  return (
    <article className="py-8 lg:py-12">
      <div className="mx-auto px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm">
          <Link href="/" className="text-gray-500 hover:text-gray-700">Home</Link>
          <span className="mx-2 text-gray-400">/</span>
          <Link href="/#learn-more" className="text-gray-500 hover:text-gray-700">Documentation</Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-900">Smart Extraction</span>
        </nav>

        {/* Header */}
        <header className="mb-10">
          <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">
            Core Concepts
          </p>
          <h1 className="text-3xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Smart extraction
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed max-w-2xl">
            Vigil automatically reads your emails and finds important information like deadlines,
            urgent requests, and when things are complete. It only extracts facts—it never
            makes decisions or takes actions for you.
          </p>
        </header>

        {/* Content */}
        <div className="space-y-14 lg:space-y-16">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">What Vigil finds</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              When you forward an email, Vigil analyzes it to find three types of information:
            </p>

            <div className="space-y-4">
              <InfoCard
                variant="critical"
                title="Specific Deadlines"
                description="Clear dates and times like 'Please respond by March 15th' or 'Payment due Friday at 5 PM'. These create reminders."
              />
              <InfoCard
                variant="warning"
                title="Time-Related Phrases"
                description="Vague time references like 'Let's discuss next week' or 'Please reply soon'. These help you stay aware but don't create alerts."
              />
              <InfoCard
                variant="primary"
                title="Requests and Questions"
                description="Things like 'What do you think?' or 'Could you review this?' that suggest a response is expected."
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">How deadlines work</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              When Vigil finds a specific date in your email, it creates a reminder and tracks
              how urgent it becomes as the deadline approaches.
            </p>

            <ExampleBox title="Example">
              <p>If someone emails: <em>"Can you send me the report by March 15?"</em></p>
              <p className="mt-3">Vigil extracts: <strong>Deadline: March 15</strong></p>
              <p className="text-gray-600 mt-2">You'll get notified as that date approaches.</p>
            </ExampleBox>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Urgency levels</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              As deadlines get closer, Vigil adjusts the urgency level. You'll only get notified
              when the urgency level changes—not repeatedly.
            </p>

            <StatusList
              items={[
                {
                  label: 'OK',
                  description: 'Plenty of time. No alerts needed.',
                  status: 'ok',
                },
                {
                  label: 'Warning',
                  description: 'Deadline is getting closer. You might want to start working on this.',
                  status: 'warning',
                },
                {
                  label: 'Critical',
                  description: 'Deadline is very soon. This needs your attention now.',
                  status: 'critical',
                },
                {
                  label: 'Overdue',
                  description: 'The deadline has passed.',
                  status: 'critical',
                },
              ]}
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Completion detection</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Vigil also recognizes when something is finished. If an email says "Thanks, this
              is resolved" or "All done," Vigil stops tracking that conversation.
            </p>

            <ExampleBox>
              <p><strong>Completion phrases Vigil recognizes:</strong></p>
              <ul className="mt-3 space-y-2 list-disc list-inside text-gray-700">
                <li>"Thanks, this is resolved"</li>
                <li>"All done here"</li>
                <li>"No further action needed"</li>
                <li>"Problem solved"</li>
              </ul>
            </ExampleBox>

            <p className="text-gray-600 mt-6 leading-relaxed text-[15px]">
              Once marked as complete, that conversation won't reopen. If someone emails about
              it again later, Vigil treats it as a new conversation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">What Vigil doesn't do</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Vigil is designed to help you stay organized, but it has clear limits:
            </p>

            <FeatureGrid
              features={[
                {
                  title: "Doesn't interpret intent",
                  description: "Only extracts what's explicitly written, never guesses what someone meant.",
                },
                {
                  title: "Doesn't analyze feelings",
                  description: "Focuses on facts like dates and requests, not emotions or tone.",
                },
                {
                  title: "Doesn't give advice",
                  description: "Shows you what it found, but never tells you what to do about it.",
                },
                {
                  title: "Doesn't schedule anything",
                  description: "Never adds events to your calendar or assigns tasks. You stay in control.",
                },
              ]}
            />
          </section>

          <section>
            <ExampleBox title="Key Principle">
              <p>
                Every alert from Vigil can be traced back to a specific email and the exact
                words that triggered it. Nothing happens automatically—you always know why
                you're being notified.
              </p>
            </ExampleBox>
          </section>
        </div>

        {/* Navigation */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex justify-between">
          <Link href="/learn/email-ingestion" className="text-sm text-gray-500 hover:text-gray-700">
            ← Email ingestion
          </Link>
          <Link href="/learn/reminders" className="text-sm link">
            Reminders →
          </Link>
        </div>
      </div>
    </article>
  );
}
