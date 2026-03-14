/**
 * Stripe Integration — Metered billing via fetch (no npm package)
 */

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_PRICE_ID =
    process.env.STRIPE_PRICE_ID ?? "price_1TAqQZ3iF1EG7t8gTEOc4KMu";
const STRIPE_METER_EVENT_NAME =
    process.env.STRIPE_METER_EVENT_NAME ?? "vigil_usage";

function stripeKey(): string {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    return key;
}

async function stripePost(
    path: string,
    params: Record<string, string>
): Promise<any> {
    const key = stripeKey();
    const body = new URLSearchParams(params).toString();
    const resp = await fetch(`${STRIPE_API}${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as any;
        throw new Error(
            `Stripe ${path} error ${resp.status}: ${err?.error?.message ?? resp.statusText}`
        );
    }
    return resp.json();
}

/** Create a Stripe customer. Returns customer ID. */
export async function createCustomer(email: string): Promise<string> {
    const customer = await stripePost("/customers", {
        email,
        description: "Vigil account",
    });
    return customer.id as string;
}

/** Create a metered subscription. Returns subscription ID. */
export async function createSubscription(customerId: string): Promise<string> {
    const sub = await stripePost("/subscriptions", {
        customer: customerId,
        "items[0][price]": STRIPE_PRICE_ID,
        payment_behavior: "default_incomplete",
    });
    return sub.id as string;
}

/**
 * Create a Stripe Checkout session (subscription mode) to collect payment method.
 * Returns the checkout URL.
 */
export async function createCheckoutSession(
    customerId: string,
    successUrl: string,
    cancelUrl: string
): Promise<string> {
    const session = await stripePost("/checkout/sessions", {
        customer: customerId,
        mode: "subscription",
        "line_items[0][price]": STRIPE_PRICE_ID,
        success_url: successUrl,
        cancel_url: cancelUrl,
    });
    return session.url as string;
}

/** Create a setup intent for collecting a payment method. Returns client_secret. */
export async function createSetupIntent(customerId: string): Promise<string> {
    const intent = await stripePost("/setup_intents", {
        customer: customerId,
        usage: "off_session",
    });
    return intent.client_secret as string;
}

/**
 * Report usage to the Stripe meter.
 * costCents: cost in cents (e.g. 0.5 = 0.005 USD)
 * Meter value is in tenths of a cent: $0.001 = 0.1 cents = 1 unit
 */
export async function reportUsage(
    customerId: string,
    costCents: number
): Promise<void> {
    const value = Math.round(costCents * 10); // tenths of a cent
    if (value <= 0) return;
    await stripePost("/billing/meter_events", {
        event_name: STRIPE_METER_EVENT_NAME,
        "payload[stripe_customer_id]": customerId,
        "payload[value]": String(value),
        timestamp: String(Math.floor(Date.now() / 1000)),
    });
}

/** Create a Stripe billing portal session. Returns the portal URL. */
export async function getCustomerPortalUrl(
    customerId: string,
    returnUrl: string
): Promise<string> {
    const session = await stripePost("/billing_portal/sessions", {
        customer: customerId,
        return_url: returnUrl,
    });
    return session.url as string;
}

/** Verify a Stripe webhook signature. Returns true if valid. */
export async function verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
): Promise<boolean> {
    const parts: Record<string, string> = {};
    for (const part of signature.split(",")) {
        const idx = part.indexOf("=");
        if (idx !== -1) parts[part.slice(0, idx)] = part.slice(idx + 1);
    }
    const timestamp = parts["t"];
    const v1 = parts["v1"];
    if (!timestamp || !v1) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(`${timestamp}.${payload}`)
    );
    const computed = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return computed === v1;
}

export function isStripeConfigured(): boolean {
    return !!process.env.STRIPE_SECRET_KEY;
}
