'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

function OAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const processedRef = useRef(false);

  useEffect(() => {
    // Prevent double-processing in React strict mode
    if (processedRef.current) return;
    processedRef.current = true;
    
    // Check for error from OAuth provider
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      setError(errorDescription || errorParam);
      setIsProcessing(false);
      return;
    }

    // Check for success tokens (set by backend redirect)
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');
    const redirectPath = searchParams.get('redirect') || '/dashboard';

    if (accessToken && refreshToken) {
      // Store tokens using API client
      api.handleOAuthCallback(accessToken, refreshToken);
      
      // Use window.location for full page reload so auth context reinitializes
      window.location.href = redirectPath;
      return;
    }

    // If no tokens and no error, something went wrong
    setError('OAuth authentication failed. Please try again.');
    setIsProcessing(false);
  }, [searchParams, router]);

  if (isProcessing && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Completing sign in...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className="text-3xl font-bold text-white">
              Vigil
            </Link>
          </div>

          <div className="card p-8 bg-white text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Failed</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="space-y-3">
              <Link href="/auth/login" className="block w-full btn btn-primary">
                Try again
              </Link>
              <Link href="/" className="block w-full btn btn-secondary">
                Go home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default loading state (shouldn't normally be seen)
  return null;
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    }>
      <OAuthCallbackContent />
    </Suspense>
  );
}
