'use client';
import Link from 'next/link';
import { PublicHeader, Footer } from '@/components/layout';

export default function ExtensionPage() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-page text-gray-700">
      <PublicHeader />
      <main className="flex-1 max-w-[800px] mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="font-display text-4xl font-extrabold text-gray-900 mb-3">
            Vigil for Chrome
          </h1>
          <p className="text-base text-gray-500 max-w-[500px] mx-auto leading-relaxed">
            Set up email forwarding in under 30 seconds. No manual steps, no confirmation codes to hunt down.
          </p>
        </div>

        {/* Install Button */}
        <div className="text-center mb-12">
          <a
            href="https://chrome.google.com/webstore/detail/vigil-email-intelligence/EXTENSION_ID_HERE"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-accent text-gray-50 rounded-lg text-base font-bold no-underline hover:bg-accent-muted transition-colors"
          >
            <ChromeIcon />
            Add to Chrome — Free
          </a>
          <p className="text-2xs text-gray-400 mt-2.5">
            Works with Gmail and Outlook. Manifest V3. Zero email access.
          </p>
        </div>

        {/* How it works */}
        <div className="mb-12">
          <h2 className="font-display text-2xl font-bold text-gray-900 mb-6 text-center">
            How it works
          </h2>
          <div className="flex flex-col gap-4">
            <StepCard num={1} title="Sign in" desc="Enter your Vigil API key or sign in with email. Takes 5 seconds." />
            <StepCard num={2} title="Open your email" desc="Navigate to Gmail or Outlook. The extension detects your provider automatically." />
            <StepCard num={3} title="Pick a watcher" desc="Choose an existing watcher or create a new one. Tell it what to watch for." />
            <StepCard num={4} title="Forwarding is set up for you" desc="The extension opens your email settings, shows you exactly where to paste the forwarding address, and auto-retrieves Gmail's confirmation code." />
            <StepCard num={5} title="Done" desc="Emails start flowing. Vigil reads, remembers, and alerts you when something needs attention." />
          </div>
        </div>

        {/* What it doesn't do */}
        <div className="bg-surface-raised shadow-panel rounded-lg p-7 mb-12">
          <h3 className="text-sm font-bold text-accent-subtle mb-4">
            What this extension does NOT do
          </h3>
          <div className="flex flex-col gap-2.5">
            <NoItem text="Never reads your email content" />
            <NoItem text="Never requests inbox access or OAuth permissions" />
            <NoItem text="Never runs in the background after setup" />
            <NoItem text="Never sends data anywhere except your Vigil account" />
            <NoItem text="Zero tracking, zero analytics, zero cookies" />
          </div>
          <p className="text-xs text-gray-400 mt-4 leading-relaxed">
            The extension is a setup wizard. It helps you create a forwarding rule in your email provider&apos;s own settings. 
            After that, it&apos;s done. Your email provider handles the forwarding natively.
          </p>
        </div>

        {/* Manual install */}
        <div className="bg-surface-raised shadow-panel rounded-lg p-7 mb-12">
          <h3 className="text-sm font-bold text-gray-900 mb-4">
            Manual Install (Developer Mode)
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed mb-4">
            If the extension isn&apos;t on the Chrome Web Store yet, you can install it manually:
          </p>
          <ol className="text-xs text-gray-600 leading-loose pl-5 list-decimal">
            <li>Download the extension from <a href="https://github.com/raulduk3/vigil.run/tree/main/chrome-extension" target="_blank" rel="noopener noreferrer" className="text-accent-subtle hover:underline">GitHub</a></li>
            <li>Open <code className="bg-surface-sunken px-1.5 py-0.5 rounded text-2xs font-mono">chrome://extensions</code> in Chrome</li>
            <li>Enable &quot;Developer mode&quot; (top right toggle)</li>
            <li>Click &quot;Load unpacked&quot; and select the <code className="bg-surface-sunken px-1.5 py-0.5 rounded text-2xs font-mono">chrome-extension</code> folder</li>
            <li>The Vigil icon appears in your toolbar. Click it to start.</li>
          </ol>
        </div>

        {/* Supported providers */}
        <div className="text-center mb-12">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Supported Providers</h3>
          <div className="flex justify-center gap-6">
            <ProviderBadge name="Gmail" status="Full support" />
            <ProviderBadge name="Outlook" status="Full support" />
            <ProviderBadge name="Yahoo" status="Coming soon" />
          </div>
        </div>

        {/* CTA */}
        <div className="text-center py-10">
          <p className="text-sm text-gray-400 mb-4">
            Don&apos;t have a Vigil account yet?
          </p>
          <Link
            href="/auth/register"
            className="inline-block px-7 py-3 bg-surface-raised text-accent-subtle rounded-lg shadow-panel text-sm font-semibold no-underline hover:shadow-panel-lg transition-shadow"
          >
            Create a free account
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StepCard({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="flex gap-4 p-4 bg-surface-raised shadow-panel rounded-lg">
      <div className="w-8 h-8 rounded-full bg-accent text-gray-50 flex items-center justify-center text-sm font-bold shrink-0">
        {num}
      </div>
      <div>
        <div className="font-bold text-sm text-gray-900 mb-1">{title}</div>
        <div className="text-xs text-gray-500 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

function NoItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-status-critical text-sm font-bold">&times;</span>
      <span className="text-xs text-gray-600">{text}</span>
    </div>
  );
}

function ProviderBadge({ name, status }: { name: string; status: string }) {
  const isComingSoon = status === 'Coming soon';
  return (
    <div className="px-6 py-4 bg-surface-raised shadow-panel rounded-lg text-center">
      <div className="font-bold text-sm text-gray-900">{name}</div>
      <div className={`text-2xs mt-1 ${isComingSoon ? 'text-status-warning' : 'text-status-ok'}`}>
        {status}
      </div>
    </div>
  );
}

function ChromeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="21.17" y1="8" x2="12" y2="8" />
      <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
      <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
    </svg>
  );
}
