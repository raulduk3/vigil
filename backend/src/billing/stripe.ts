/**
 * Stripe Integration — V2 (MVP Stub)
 *
 * Stripe integration not active in V2 MVP.
 * All functions return safe defaults or throw "not configured".
 */

import type { PlanTier } from "./types";

export async function getOrCreateCustomer(
    _accountId: string,
    _email: string
): Promise<string> {
    throw new Error("Stripe not configured in V2 MVP");
}

export async function createCheckoutSession(
    _accountId: string,
    _email: string,
    _tier: PlanTier,
    _successUrl: string,
    _cancelUrl: string
): Promise<string> {
    throw new Error("Stripe not configured in V2 MVP");
}

export async function createPortalSession(
    _accountId: string,
    _returnUrl: string
): Promise<string> {
    throw new Error("Stripe not configured in V2 MVP");
}

export async function getSubscription(
    _accountId: string
): Promise<{ tier: PlanTier; status: string } | null> {
    return { tier: "free", status: "free" };
}

export async function updateAccountPlan(
    _accountId: string,
    _tier: PlanTier,
    _subscriptionId: string | null
): Promise<void> {}

export async function handleStripeWebhook(
    _payload: string,
    _signature: string
): Promise<void> {
    throw new Error("Stripe webhooks not configured in V2 MVP");
}

export async function cancelSubscription(_accountId: string): Promise<boolean> {
    throw new Error("Stripe not configured in V2 MVP");
}

export async function resumeSubscription(_accountId: string): Promise<boolean> {
    throw new Error("Stripe not configured in V2 MVP");
}

export async function getInvoices(_accountId: string): Promise<any[]> {
    return [];
}

export function isStripeConfigured(): boolean {
    return false;
}
