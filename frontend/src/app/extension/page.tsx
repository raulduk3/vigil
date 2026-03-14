'use client';
import Link from 'next/link';
import { PublicHeader, Footer } from '@/components/layout';

export default function ExtensionPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#e2e8f0' }}>
      <PublicHeader />
      <main style={{ flex: 1, maxWidth: 800, margin: '0 auto', padding: '60px 24px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👁️</div>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 12 }}>
            Vigil for Chrome
          </h1>
          <p style={{ fontSize: 16, color: '#94a3b8', maxWidth: 500, margin: '0 auto', lineHeight: 1.7 }}>
            Set up email forwarding in under 30 seconds. No manual steps, no confirmation codes to hunt down.
          </p>
        </div>

        {/* Install Button */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <a
            href="https://chrome.google.com/webstore/detail/vigil-email-intelligence/EXTENSION_ID_HERE"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '14px 32px', background: '#0d9488', color: 'white',
              borderRadius: 10, fontSize: 16, fontWeight: 700,
              textDecoration: 'none', transition: 'background 0.2s',
            }}
          >
            <ChromeIcon /> Add to Chrome — Free
          </a>
          <p style={{ fontSize: 12, color: '#475569', marginTop: 10 }}>
            Works with Gmail and Outlook. Manifest V3. Zero email access.
          </p>
        </div>

        {/* How it works */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, textAlign: 'center' }}>
            How it works
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <StepCard num={1} title="Sign in" desc="Enter your Vigil API key or sign in with email. Takes 5 seconds." />
            <StepCard num={2} title="Open your email" desc="Navigate to Gmail or Outlook. The extension detects your provider automatically." />
            <StepCard num={3} title="Pick a watcher" desc="Choose an existing watcher or create a new one. Tell it what to watch for." />
            <StepCard num={4} title="Forwarding is set up for you" desc="The extension opens your email settings, shows you exactly where to paste the forwarding address, and auto-retrieves Gmail's confirmation code." />
            <StepCard num={5} title="Done" desc="Emails start flowing. Vigil reads, remembers, and alerts you when something needs attention." />
          </div>
        </div>

        {/* What it doesn't do */}
        <div style={{
          background: '#1e293b', borderRadius: 12, padding: '28px 24px',
          border: '1px solid #334155', marginBottom: 48
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#0d9488' }}>
            What this extension does NOT do
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <NoItem text="Never reads your email content" />
            <NoItem text="Never requests inbox access or OAuth permissions" />
            <NoItem text="Never runs in the background after setup" />
            <NoItem text="Never sends data anywhere except your Vigil account" />
            <NoItem text="Zero tracking, zero analytics, zero cookies" />
          </div>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 16, lineHeight: 1.6 }}>
            The extension is a setup wizard. It helps you create a forwarding rule in your email provider&apos;s own settings. 
            After that, it&apos;s done. Your email provider handles the forwarding natively.
          </p>
        </div>

        {/* Manual install */}
        <div style={{
          background: '#1e293b', borderRadius: 12, padding: '28px 24px',
          border: '1px solid #334155', marginBottom: 48
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
            Manual Install (Developer Mode)
          </h3>
          <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7, marginBottom: 16 }}>
            If the extension isn&apos;t on the Chrome Web Store yet, you can install it manually:
          </p>
          <ol style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 2, paddingLeft: 20 }}>
            <li>Download the extension: <a href="https://github.com/raulduk3/vigil.run/tree/main/chrome-extension" target="_blank" rel="noopener noreferrer" style={{ color: '#0d9488' }}>GitHub repo</a></li>
            <li>Open <code style={{ background: '#334155', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>chrome://extensions</code> in Chrome</li>
            <li>Enable &quot;Developer mode&quot; (top right toggle)</li>
            <li>Click &quot;Load unpacked&quot; and select the <code style={{ background: '#334155', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>chrome-extension</code> folder</li>
            <li>The Vigil icon appears in your toolbar. Click it to start.</li>
          </ol>
        </div>

        {/* Supported providers */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Supported Providers</h3>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
            <ProviderBadge name="Gmail" status="Full support" emoji="📧" />
            <ProviderBadge name="Outlook" status="Full support" emoji="📬" />
            <ProviderBadge name="Yahoo" status="Coming soon" emoji="📨" />
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
            Don&apos;t have a Vigil account yet?
          </p>
          <Link
            href="/auth/register"
            style={{
              display: 'inline-block', padding: '12px 28px',
              background: '#1e293b', color: '#0d9488', borderRadius: 8,
              border: '1px solid #334155', fontSize: 14, fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Create a free account →
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StepCard({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div style={{
      display: 'flex', gap: 16, padding: '16px 20px',
      background: '#1e293b', borderRadius: 10, border: '1px solid #334155'
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', background: '#0d9488',
        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700, flexShrink: 0
      }}>
        {num}
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}

function NoItem({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: '#ef4444', fontSize: 16 }}>✕</span>
      <span style={{ fontSize: 13, color: '#cbd5e1' }}>{text}</span>
    </div>
  );
}

function ProviderBadge({ name, status, emoji }: { name: string; status: string; emoji: string }) {
  return (
    <div style={{
      padding: '16px 24px', background: '#1e293b', borderRadius: 10,
      border: '1px solid #334155', textAlign: 'center'
    }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{emoji}</div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
      <div style={{ fontSize: 11, color: status === 'Coming soon' ? '#eab308' : '#0d9488', marginTop: 4 }}>
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
