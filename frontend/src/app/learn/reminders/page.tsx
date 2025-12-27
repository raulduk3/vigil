import Link from 'next/link';
import { InfoCard } from '@/components/learn/InfoCard';
import { FeatureGrid } from '@/components/learn/FeatureGrid';
import { StepList } from '@/components/learn/StepList';
import { ExampleBox } from '@/components/learn/ExampleBox';

export default function RemindersPage() {
  return (
    <article className="py-8 lg:py-12">
      <div className="mx-auto px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm">
          <Link href="/" className="text-gray-500 hover:text-gray-700">Home</Link>
          <span className="mx-2 text-gray-400">/</span>
          <Link href="/#learn-more" className="text-gray-500 hover:text-gray-700">Documentation</Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-900">Reminders</span>
        </nav>

        {/* Header */}
        <header className="mb-10">
          <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">
            Core Concepts
          </p>
          <h1 className="text-3xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Reminders
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed max-w-2xl">
            Reminders are the core tracking units in Vigil. Each reminder represents a specific
            obligation extracted from your emails—a deadline, an urgent request, or a follow-up
            need. One email can create multiple reminders, each tied to distinct context.
          </p>
        </header>

        {/* Content */}
        <div className="space-y-14 lg:space-y-16">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Reminders vs. Threads</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              This distinction is fundamental to how Vigil works:
            </p>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="panel p-5">
                <h3 className="font-semibold text-gray-900 mb-3 text-base">Threads</h3>
                <p className="text-[15px] text-gray-600 mb-4 leading-relaxed">
                  Threads are <strong>conversations</strong>—grouped emails on the same topic.
                  They track communication context, participants, and activity.
                </p>
                <p className="text-sm text-gray-500">
                  Threads do NOT own deadlines. They are just containers for messages.
                </p>
              </div>
              <div className="panel p-5 border-l-2 border-vigil-500">
                <h3 className="font-semibold text-gray-900 mb-3 text-base">Reminders</h3>
                <p className="text-[15px] text-gray-600 mb-4 leading-relaxed">
                  Reminders are <strong>obligations</strong>—specific things that need attention.
                  They carry deadlines, urgency, and the exact text that created them.
                </p>
                <p className="text-sm text-gray-500">
                  Reminders own the deadlines. They can be moved between threads.
                </p>
              </div>
            </div>

            <ExampleBox title="Why this matters" className="mt-6">
              <p>
                An email conversation about a project might contain multiple deadlines:
                "Send the draft by Monday" and "Final version due Friday." Each becomes
                its own reminder with its own urgency tracking, even though both are in
                the same thread.
              </p>
            </ExampleBox>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">One email, multiple reminders</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              A single email can create several reminders when it contains multiple obligations.
              Each reminder preserves the exact context that created it.
            </p>

            <ExampleBox title="Example email">
              <p className="italic text-gray-700 mb-5 text-base leading-relaxed">
                "Hi, please send the budget by Friday at 5pm. Also, let me know your
                availability for next week's meeting. One more thing—I need the quarterly
                report ASAP."
              </p>
              <p className="font-medium text-gray-900 mb-4">Vigil creates three reminders:</p>
              <ol className="space-y-4">
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-red-100 text-red-700 text-xs flex items-center justify-center font-semibold">1</span>
                  <div>
                    <p className="font-medium text-gray-900 mb-1">Hard deadline</p>
                    <p className="text-gray-600">"send the budget by Friday at 5pm"</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs flex items-center justify-center font-semibold">2</span>
                  <div>
                    <p className="font-medium text-gray-900 mb-1">Soft deadline</p>
                    <p className="text-gray-600">"let me know your availability for next week's meeting"</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-vigil-100 text-vigil-700 text-xs flex items-center justify-center font-semibold">3</span>
                  <div>
                    <p className="font-medium text-gray-900 mb-1">Urgency signal</p>
                    <p className="text-gray-600">"I need the quarterly report ASAP"</p>
                  </div>
                </li>
              </ol>
            </ExampleBox>

            <div className="mt-6">
              <InfoCard
                variant="primary"
                title="Preserved context"
                description="Each reminder stores the exact phrase from the email that triggered it (the 'source span'). You always know exactly what created a reminder and can trace it back to the original message."
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Reminder types</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Vigil categorizes reminders by how binding the obligation is:
            </p>

            <div className="space-y-4">
              <InfoCard
                variant="critical"
                title="Hard deadline"
                description="Explicit date and time. 'By Friday at 5pm', 'December 31st', 'Before the meeting tomorrow.' These are binding commitments with specific due dates."
              />
              <InfoCard
                variant="warning"
                title="Soft deadline"
                description="Fuzzy temporal language. 'Next week', 'Soon', 'When you get a chance.' These are advisory—they guide urgency but don't have exact due dates."
              />
              <InfoCard
                variant="primary"
                title="Urgency signal"
                description="Immediate attention phrases. 'ASAP', 'Urgent', 'Right away.' These indicate something needs attention now, even without a specific deadline."
              />
              <InfoCard
                variant="neutral"
                title="Silence-based"
                description="Generated when a thread goes quiet. If no activity occurs within your silence threshold, a reminder is created to prompt follow-up."
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Reminder lifecycle</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Reminders are created automatically from extraction but can be managed by you:
            </p>

            <StepList
              steps={[
                {
                  title: "Created",
                  description: "Vigil extracts an obligation from an email. A reminder is created in 'active' status, linked to the specific text that triggered it.",
                },
                {
                  title: "Evaluated",
                  description: "Every 15 minutes, Vigil evaluates each active reminder. Urgency is computed based on time until deadline and time since activity.",
                },
                {
                  title: "Alert generated",
                  description: "When urgency transitions (OK → Warning, Warning → Critical), an alert is queued. You're notified through your configured channels.",
                },
              ]}
            />

            <ExampleBox title="User actions" className="mt-8">
              <p className="mb-4">You can manage reminders that Vigil creates:</p>
              <ul className="space-y-3">
                <li><strong>Edit</strong> — Correct an extraction mistake (wrong date, wrong type)</li>
                <li><strong>Dismiss</strong> — Remove a false positive (reminder remains in audit log)</li>
                <li><strong>Merge</strong> — Combine duplicate reminders into one</li>
                <li><strong>Reassign</strong> — Move a reminder to a different thread</li>
              </ul>
            </ExampleBox>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Portable obligations</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Reminders can be reassigned between threads. This is useful when:
            </p>

            <FeatureGrid
              features={[
                {
                  title: "Wrong thread detected",
                  description: "The LLM associated a reminder with the wrong conversation. Move it to the correct thread.",
                },
                {
                  title: "Conversation splits",
                  description: "A topic branches into multiple threads. Reassign the reminder to the relevant branch.",
                },
                {
                  title: "Handoff scenarios",
                  description: "Responsibility moves to a different project or watcher. The reminder follows.",
                },
              ]}
            />

            <div className="mt-6">
              <InfoCard
                variant="neutral"
                title="Audit trail preserved"
                description="When you reassign a reminder, the move is recorded as an event. The full history—original thread, new thread, who moved it, when—is preserved for traceability."
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Traceability</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Every reminder can be traced back through the complete causal chain:
            </p>

            <div className="panel-inset p-6 font-mono text-[15px] space-y-2">
              <p className="text-gray-500">Alert received →</p>
              <p className="text-gray-600 pl-6">Reminder that triggered it →</p>
              <p className="text-gray-700 pl-12">Extraction event that created it →</p>
              <p className="text-gray-800 pl-[4.5rem]">Original email message →</p>
              <p className="text-gray-900 pl-24 font-semibold">Exact text: "by Friday at 5pm"</p>
            </div>

            <p className="text-gray-600 mt-6 leading-relaxed text-[15px]">
              This chain is never broken. Whether a reminder was automatically created,
              manually edited, merged, or reassigned—you can always trace why you're
              being notified and what originally caused it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Extraction accuracy</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Vigil's extraction is designed to be conservative—it's better to miss an
              ambiguous deadline than to create false positives. When extraction does
              make a mistake, you have full control:
            </p>

            <div className="space-y-4">
              <InfoCard
                variant="default"
                title="~10% need correction"
                description="Most reminders are correct. The small percentage that need adjustment can be quickly edited or dismissed. The system learns from corrections in aggregate (not per-user)."
              />
              <InfoCard
                variant="default"
                title="Confidence scores"
                description="Each extraction includes a confidence level (high, medium, low). Low-confidence reminders are flagged for your review."
              />
              <InfoCard
                variant="default"
                title="Source always visible"
                description="You can always see the exact email text that triggered a reminder. If it doesn't match, dismiss it and move on."
              />
            </div>
          </section>
        </div>

        {/* Navigation */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex justify-between">
          <Link href="/learn/event-extraction" className="text-sm text-gray-500 hover:text-gray-700">
            ← Smart extraction
          </Link>
          <Link href="/learn/alerts" className="text-sm link">
            Notifications →
          </Link>
        </div>
      </div>
    </article>
  );
}
