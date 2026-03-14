import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-surface-page">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 py-10">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <p className="font-display font-semibold text-gray-900 mb-3">Vigil</p>
            <p className="text-sm text-gray-500 leading-relaxed">
              An AI agent that reads your email and acts on it. One cent per email.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Product</p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/#how-it-works" className="hover:text-gray-700">How it works</Link></li>
              <li><Link href="/pricing" className="hover:text-gray-700">Pricing</Link></li>
              <li><Link href="/auth/register" className="hover:text-gray-700">Sign up</Link></li>
              <li><Link href="/auth/login" className="hover:text-gray-700">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Documentation</p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/learn/watchers" className="hover:text-gray-700">Watchers</Link></li>
              <li><Link href="/learn/agent" className="hover:text-gray-700">The Agent</Link></li>
              <li><Link href="/learn/actions" className="hover:text-gray-700">How the Agent Acts</Link></li>
              <li><Link href="/learn/integrations" className="hover:text-gray-700">Agent Integration</Link></li>
              <li><Link href="/learn/architecture" className="hover:text-gray-700">Architecture</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Company</p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/blog" className="hover:text-gray-700">Blog</Link></li>
              <li><Link href="/privacy" className="hover:text-gray-700">Privacy & Data</Link></li>
              <li><Link href="/learn/security" className="hover:text-gray-700">Security</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-200 mt-8 pt-8 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Vigil. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
