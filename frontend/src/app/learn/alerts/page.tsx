import Link from 'next/link';
import { InfoCard } from '@/components/learn/InfoCard';
import { FeatureGrid } from '@/components/learn/FeatureGrid';
import { StepList } from '@/components/learn/StepList';
import { StatusList } from '@/components/learn/StatusList';
import { ExampleBox } from '@/components/learn/ExampleBox';

export default function NotificationsPage() {
  return (
    <article className="py-8 lg:py-12">
      <div className="mx-auto px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm">
          <Link href="/" className="text-gray-500 hover:text-gray-700">Home</Link>
          <span className="mx-2 text-gray-400">/</span>
          <Link href="/#learn-more" className="text-gray-500 hover:text-gray-700">Documentation</Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-900">Notifications</span>
        </nav>

        {/* Header */}
        <header className="mb-10">
          <p className="text-sm font-medium text-vigil-700 uppercase tracking-wider mb-3">
            Core Concepts
          </p>
          <h1 className="text-3xl font-display font-semibold text-gray-900 tracking-tight mb-4">
            Notifications
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed max-w-2xl">
            Vigil notifies you when deadlines approach, when conversations go quiet,
            or when urgent items need attention. Automatic reminders so nothing slips through.
          </p>
        </header>

        {/* Content */}
        <div className="space-y-14 lg:space-y-16">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">When you get notified</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Vigil monitors your conversations and sends notifications at key moments.
              You get notified when something needs your attention, not constantly.
            </p>

            <div className="space-y-4">
              <InfoCard
                variant="warning"
                title="Deadlines approaching"
                description="You get notified before a deadline arrives, giving you time to respond. The timing depends on your watcher settings."
              />
              <InfoCard
                variant="warning"
                title="Deadlines missed"
                description="If a deadline passes without the conversation being marked complete, you get an overdue notification."
              />
              <InfoCard
                variant="default"
                title="Long silence"
                description="When a conversation goes quiet for too long (no emails received), you get a reminder to follow up."
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Types of notifications</h2>

            <div className="space-y-10">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Deadline notifications</h3>
                <p className="text-gray-600 mb-5 leading-relaxed text-[15px]">
                  When Vigil finds a deadline in your email (like "please respond by Friday"),
                  it tracks that date. As the deadline approaches, you get notifications at
                  specific thresholds.
                </p>

                <ExampleBox title="Example">
                  <p>
                    Email says: <em>"Please send the proposal by March 15 at 5pm"</em>
                  </p>
                  <p className="mt-4 text-gray-600">You might get notified:</p>
                  <ul className="mt-3 space-y-2 text-gray-600 list-disc pl-5">
                    <li>48 hours before (warning)</li>
                    <li>12 hours before (critical)</li>
                    <li>When the deadline passes (overdue)</li>
                  </ul>
                </ExampleBox>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Silence reminders</h3>
                <p className="text-gray-600 mb-5 leading-relaxed text-[15px]">
                  If a conversation goes quiet—no new emails received for a while—you get
                  a reminder to check in. This helps you stay on top of conversations that
                  might be waiting on the other person.
                </p>

                <ExampleBox title="Example">
                  <p>
                    You email a client asking for information. If they haven't responded
                    after 3 days (based on your watcher settings), you get a notification
                    suggesting you follow up.
                  </p>
                </ExampleBox>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Urgency alerts</h3>
                <p className="text-gray-600 leading-relaxed text-[15px]">
                  When an email contains urgent language ("ASAP", "urgent", "immediate attention"),
                  Vigil flags it immediately so you don't miss time-sensitive requests.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">How urgency levels work</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Notifications have different urgency levels based on how soon something needs
              attention. Each level can be sent to different channels.
            </p>

            <StatusList
              items={[
                {
                  label: "Warning",
                  description: "Deadline is approaching, but there's still time. Sent well before the deadline.",
                  status: "warning",
                },
                {
                  label: "Critical",
                  description: "Deadline is very close. Sent shortly before the deadline to give final notice.",
                  status: "critical",
                },
                {
                  label: "Overdue",
                  description: "Deadline has passed and the conversation is still open.",
                  status: "critical",
                },
              ]}
            />

            <ExampleBox className="mt-6">
              <p className="font-medium">Example urgency progression:</p>
              <p className="mt-3 text-gray-600">
                A conversation with a deadline on Friday at 5pm might send a warning on
                Wednesday (48 hours before), a critical alert on Friday morning (12 hours before),
                and an overdue notification on Friday evening.
              </p>
            </ExampleBox>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">What's in a notification</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Every notification tells you what needs attention and why:
            </p>

            <FeatureGrid
              features={[
                {
                  title: "Conversation summary",
                  description: "Who's involved, what the topic is, and when the last message arrived.",
                },
                {
                  title: "Why you're being notified",
                  description: "Clear explanation: approaching deadline, silence reminder, or urgency flag.",
                },
                {
                  title: "The deadline or timeframe",
                  description: "Shows the specific date/time if there's a deadline, or how long since the last message.",
                },
                {
                  title: "Quick actions",
                  description: "Links to view the conversation, mark it complete, or snooze the notification.",
                },
              ]}
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">When notifications are sent</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Vigil checks your conversations regularly (typically every 15 minutes) to see
              if any have crossed a threshold. Notifications are sent only when something
              changes—you won't get repeated alerts for the same thing.
            </p>

            <div className="space-y-6">
              <StepList
                steps={[
                  {
                    title: "Regular check",
                    description: "Every 15 minutes, Vigil evaluates all open conversations in your watchers.",
                  },
                  {
                    title: "Compare to thresholds",
                    description: "For each conversation, it checks if urgency has changed (moved from OK to warning, warning to critical, etc.).",
                  },
                  {
                    title: "Send notification on change",
                    description: "If urgency increased, a notification is sent. If it stayed the same, nothing is sent.",
                  },
                ]}
              />

              <InfoCard
                variant="primary"
                title="No alert fatigue"
                description="You only get notified when urgency changes. Staying at 'warning' level doesn't send repeated notifications. This keeps your inbox manageable while ensuring you don't miss important changes."
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Delivery channels</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              You can receive notifications through different channels. Each channel can
              be configured to only receive certain urgency levels.
            </p>

            <div className="space-y-4">
              <div className="panel p-5">
                <h3 className="font-medium text-gray-900 mb-2 text-base">Email</h3>
                <p className="text-[15px] text-gray-600 mb-3 leading-relaxed">
                  Formatted email with full conversation context, deadline information,
                  and action buttons. Good for all urgency levels.
                </p>
                <p className="text-sm text-gray-500">
                  Example: Send all notifications to your personal email.
                </p>
              </div>

              <div className="panel p-5">
                <h3 className="font-medium text-gray-900 mb-2 text-base">Webhook</h3>
                <p className="text-[15px] text-gray-600 mb-3 leading-relaxed">
                  JSON payload sent to any URL. Integrate with Slack, Discord, PagerDuty,
                  or custom systems. Good for critical alerts only.
                </p>
                <p className="text-sm text-gray-500">
                  Example: Send only critical and overdue alerts to your team's Slack channel.
                </p>
              </div>
            </div>

            <ExampleBox title="Filtering by urgency" className="mt-6">
              <p>
                You might configure your watcher to send all notifications (warning, critical,
                overdue) to your email, but only critical and overdue alerts to your Slack
                channel. This keeps Slack focused on urgent items.
              </p>
            </ExampleBox>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Stopping notifications</h2>
            <p className="text-gray-600 mb-6 leading-relaxed text-[15px]">
              Notifications stop automatically when:
            </p>

            <div className="space-y-4">
              <InfoCard
                variant="default"
                title="Conversation marked complete"
                description="When you forward an email with completion language ('done', 'resolved', 'completed'), Vigil marks that conversation as complete and stops tracking it."
              />
              <InfoCard
                variant="default"
                title="Watcher paused"
                description="If you pause a watcher, all notifications for conversations in that watcher stop until you unpause it."
              />
              <InfoCard
                variant="default"
                title="New activity arrives"
                description="For silence reminders, receiving a new email in the conversation resets the timer."
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-5">Reliability</h2>

            <FeatureGrid
              features={[
                {
                  title: "Never misses changes",
                  description: "Every urgency change triggers a notification. If something becomes urgent, you'll know.",
                },
                {
                  title: "Handles delivery failures",
                  description: "If a notification fails to send (network issue, etc.), Vigil automatically retries.",
                },
                {
                  title: "Full traceability",
                  description: "Every notification can be traced back to the email and extracted fact that caused it.",
                },
                {
                  title: "Predictable timing",
                  description: "Checks run every 15 minutes, so you know when to expect updates.",
                },
              ]}
            />
          </section>
        </div>

        {/* Navigation */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex justify-between">
          <Link href="/learn/reminders" className="text-sm text-gray-500 hover:text-gray-700">
            ← Reminders
          </Link>
          <Link href="/learn/architecture" className="text-sm link">
            How it works →
          </Link>
        </div>
      </div>
    </article>
  );
}
