'use client';

import React from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';

// ============================================================================
// Stripe Instance
// ============================================================================

let stripePromise: Promise<Stripe | null> | null = null;

function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.warn('Stripe publishable key not configured');
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

// ============================================================================
// Provider
// ============================================================================

interface StripeProviderProps {
  children: React.ReactNode;
}

export function StripeProvider({ children }: StripeProviderProps) {
  const [stripe, setStripe] = React.useState<Stripe | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getStripe().then((s) => {
      setStripe(s);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <>{children}</>;
  }

  if (!stripe) {
    // Stripe not configured, render children without Elements wrapper
    return <>{children}</>;
  }

  return (
    <Elements stripe={stripe}>
      {children}
    </Elements>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useStripeReady(): boolean {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    getStripe().then((s) => setReady(!!s));
  }, []);

  return ready;
}
