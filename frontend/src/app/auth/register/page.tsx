'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { PublicHeader } from '@/components/layout';

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intent = searchParams.get('intent');
  const { register, isAuthenticated, isLoading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const nextSteps = [
    'Create your account.',
    'Name your first watcher.',
    'Connect forwarding with the extension or a manual rule.',
    'Forward one live email and let Vigil start building context.',
  ];

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, authLoading, router]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-page flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-vigil-600"></div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const result = await register(email, password);
      if (result.success) {
        router.push(intent ? `/watchers/new?intent=${encodeURIComponent(intent)}` : '/watchers/new');
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-page flex flex-col">
      <PublicHeader fixed={false} navLinks={[]} />

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-5xl grid gap-8 lg:grid-cols-[minmax(0,28rem)_minmax(0,24rem)] items-start">
          <div>
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-vigil-700 mb-3">Create account</p>
              <h1 className="text-3xl font-display font-semibold text-gray-900 mb-3">
                Start with one watcher and one forwarding rule.
              </h1>
              <p className="text-base text-gray-600 max-w-none">
                Vigil is easiest to evaluate with one real email stream. Create your account, make a watcher,
                and connect Gmail or Outlook in a minute.
              </p>
            </div>

            {intent && (
              <div className="panel-inset rounded-md px-4 py-4 mb-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-vigil-700 mb-2">Your watcher intent</p>
                <p className="text-sm text-gray-700 max-w-none">{intent}</p>
              </div>
            )}

            <div className="panel p-6">
              <OAuthButtons />

              <div className="section-rule my-6">
                <span className="px-3 bg-surface-raised text-xs text-gray-500 uppercase tracking-wider">
                  or register with email
                </span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="notice notice-error text-sm">
                    {error}
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="email" className="form-label">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="password" className="form-label">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                  <p className="form-hint">At least 8 characters</p>
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword" className="form-label">
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input"
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                  />
                </div>

                <div className="flex items-start gap-2">
                  <input
                    id="terms"
                    type="checkbox"
                    required
                    className="mt-0.5 rounded border-gray-300 text-vigil-900 focus:ring-vigil-500/20"
                  />
                  <label htmlFor="terms" className="text-sm text-gray-600">
                    I agree to the{' '}
                    <Link href="/terms" className="link">Terms of Service</Link>
                    {' '}and{' '}
                    <Link href="/privacy" className="link">Privacy Policy</Link>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full btn btn-primary"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="spinner" />
                      Creating account...
                    </span>
                  ) : (
                    'Create account'
                  )}
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-sm text-gray-600">
              Already have an account?{' '}
              <Link href="/auth/login" className="link">
                Sign in
              </Link>
            </p>
          </div>

          <aside className="panel p-6 lg:sticky lg:top-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-vigil-700 mb-3">What happens next</p>
            <ol className="space-y-3">
              {nextSteps.map((step, index) => (
                <li key={step} className="panel-inset rounded-md px-4 py-4 flex items-start gap-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-page text-sm font-semibold text-vigil-700">{index + 1}</span>
                  <span className="text-sm text-gray-700 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-6 border-t border-gray-200 pt-6 space-y-3">
              <p className="text-sm text-gray-600 max-w-none">Best first move after sign-up:</p>
              <Link href="/extension" className="btn btn-secondary w-full justify-center">
                Use the extension
              </Link>
              <Link href="/learn/email-ingestion" className="btn btn-ghost w-full justify-center">
                Manual setup guide
              </Link>
              <p className="text-xs text-gray-500 max-w-none">50 emails free each month. No credit card required.</p>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-6 text-center">
        <p className="text-xs text-gray-500">
          © {new Date().getFullYear()} Vigil. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="spinner" /></div>}>
      <RegisterContent />
    </Suspense>
  );
}
