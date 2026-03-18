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
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, authLoading, router]);

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
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-display font-semibold text-gray-900 mb-2">
              Create your account
            </h1>
            <p className="text-sm text-gray-500">
              50 emails free. No credit card required.
            </p>
          </div>

          {intent && (
            <div className="panel-inset rounded-md px-4 py-3 mb-6 text-center">
              <p className="text-xs text-gray-500 mb-1">Your watcher will watch for:</p>
              <p className="text-sm text-gray-800 font-medium">{intent}</p>
            </div>
          )}

          <div className="panel p-6">
            <OAuthButtons />

            <div className="section-rule my-6">
              <span className="px-3 bg-surface-raised text-xs text-gray-500 uppercase tracking-wider">
                or use email
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="notice notice-error text-sm">
                  {error}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="email" className="form-label">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="8+ characters"
                  required
                  autoComplete="new-password"
                  minLength={8}
                />
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

              <p className="text-xs text-gray-400 text-center">
                By creating an account you agree to our{' '}
                <Link href="/privacy" className="link">Privacy Policy</Link>.
              </p>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/auth/login" className="link">Sign in</Link>
          </p>
        </div>
      </main>
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
