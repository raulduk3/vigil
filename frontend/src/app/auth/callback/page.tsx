'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function CallbackInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');

    if (accessToken && refreshToken) {
      localStorage.setItem('vigil_access_token', accessToken);
      localStorage.setItem('vigil_refresh_token', refreshToken);
      window.location.href = '/dashboard';
    } else {
      window.location.href = '/auth/login?error=oauth_failed';
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="spinner mx-auto mb-4" />
        <p className="text-sm text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return <Suspense><CallbackInner /></Suspense>;
}
