'use client';

import { AuthProvider } from '@/lib/auth/context';
import { StripeProvider } from '@/lib/stripe/provider';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <StripeProvider>
        {children}
      </StripeProvider>
    </AuthProvider>
  );
}
