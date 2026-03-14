/**
 * Billing Types — Metered pay-per-use
 */

export interface AccountBilling {
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    has_payment_method: boolean;
    trial_emails_remaining: number;
}

export const FREE_TRIAL_EMAILS = 50;
