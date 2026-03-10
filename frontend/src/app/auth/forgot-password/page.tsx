'use client';

import Link from 'next/link';

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page">
      <div className="panel p-8 max-w-sm w-full text-center">
        <h1 className="text-xl font-display font-semibold text-gray-900 mb-4">Reset Password</h1>
        <p className="text-sm text-gray-500 mb-6">Password reset is not yet available.</p>
        <Link href="/auth/login" className="text-sm text-vigil-700 hover:text-vigil-800">Back to login</Link>
      </div>
    </div>
  );
}
