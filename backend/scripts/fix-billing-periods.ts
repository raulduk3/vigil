/**
 * Fix Billing Periods Script
 *
 * Shows account billing state and fixes accounts with invalid/missing period data.
 * Can optionally sync with Stripe for accounts that have a stripe_customer_id.
 *
 * Usage:
 *   bun run scripts/fix-billing-periods.ts           # Show all accounts and fix periods
 *   bun run scripts/fix-billing-periods.ts --sync    # Also sync with Stripe
 */

import {
    query,
    queryMany,
    initializeDatabase,
    closeDatabase,
} from "@/db/client";
import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

async function main() {
    const syncWithStripe = process.argv.includes("--sync");

    await initializeDatabase();

    console.log("\n=== Current Account Billing State ===\n");

    // Get all accounts with their billing info
    const accounts = await queryMany<{
        account_id: string;
        owner_email: string;
        plan: string;
        subscription_status: string | null;
        stripe_customer_id: string | null;
        stripe_subscription_id: string | null;
        current_period_start: string | null;
        current_period_end: string | null;
        cancel_at_period_end: boolean;
        updated_at: Date | null;
    }>(`
        SELECT
            account_id, owner_email, plan, subscription_status,
            stripe_customer_id, stripe_subscription_id,
            current_period_start, current_period_end,
            cancel_at_period_end, updated_at
        FROM accounts
        ORDER BY updated_at DESC NULLS LAST
    `);

    if (accounts.length === 0) {
        console.log("No accounts found in database.");
        return;
    }

    // Display accounts
    for (const acc of accounts) {
        const periodStart = acc.current_period_start ? parseInt(acc.current_period_start) : 0;
        const periodEnd = acc.current_period_end ? parseInt(acc.current_period_end) : 0;

        console.log(`Account: ${acc.account_id}`);
        console.log(`  Email: ${acc.owner_email}`);
        console.log(`  Plan: ${acc.plan}`);
        console.log(`  Status: ${acc.subscription_status || 'null'}`);
        console.log(`  Stripe Customer: ${acc.stripe_customer_id || 'none'}`);
        console.log(`  Stripe Subscription: ${acc.stripe_subscription_id || 'none'}`);
        console.log(`  Period Start: ${periodStart > 0 ? new Date(periodStart).toISOString() : 'INVALID (0 or null)'}`);
        console.log(`  Period End: ${periodEnd > 0 ? new Date(periodEnd).toISOString() : 'INVALID (0 or null)'}`);
        console.log(`  Cancel at Period End: ${acc.cancel_at_period_end}`);
        console.log("");
    }

    // Sync with Stripe if requested
    if (syncWithStripe && STRIPE_SECRET_KEY) {
        console.log("\n=== Syncing with Stripe ===\n");

        const stripe = new Stripe(STRIPE_SECRET_KEY, {
            apiVersion: "2025-12-15.clover",
        });

        for (const acc of accounts) {
            if (!acc.stripe_customer_id) {
                console.log(`Skipping ${acc.owner_email}: No Stripe customer ID`);
                continue;
            }

            try {
                // Get customer's subscriptions from Stripe
                const subscriptions = await stripe.subscriptions.list({
                    customer: acc.stripe_customer_id,
                    limit: 1,
                });

                if (subscriptions.data.length === 0) {
                    console.log(`${acc.owner_email}: No active subscription in Stripe`);

                    // Update to free plan if they have no subscription
                    if (acc.plan !== 'free') {
                        const now = Date.now();
                        const periodEnd = now + 30 * 24 * 60 * 60 * 1000;
                        await query(`
                            UPDATE accounts
                            SET plan = 'free',
                                subscription_status = 'free',
                                stripe_subscription_id = NULL,
                                current_period_start = $2,
                                current_period_end = $3,
                                cancel_at_period_end = false,
                                updated_at = NOW()
                            WHERE account_id = $1
                        `, [acc.account_id, now, periodEnd]);
                        console.log(`  -> Updated to free plan with valid periods`);
                    }
                    continue;
                }

                const sub = subscriptions.data[0];
                // Access period data with type cast since Stripe SDK types may not expose it
                const subData = sub as unknown as {
                    current_period_start?: number;
                    current_period_end?: number;
                };
                const firstItem = sub.items.data[0];
                const periodStart = (subData.current_period_start ?? firstItem?.current_period_start ?? 0) * 1000;
                const periodEnd = (subData.current_period_end ?? firstItem?.current_period_end ?? 0) * 1000;

                // Determine plan from price ID
                const priceId = firstItem?.price?.id;
                let plan = 'free';
                if (priceId === process.env.STRIPE_STARTER_PRICE_ID) plan = 'starter';
                else if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = 'pro';
                else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) plan = 'enterprise';

                console.log(`${acc.owner_email}: Found Stripe subscription`);
                console.log(`  Status: ${sub.status}`);
                console.log(`  Plan: ${plan}`);
                console.log(`  Period: ${new Date(periodStart).toISOString()} - ${new Date(periodEnd).toISOString()}`);

                // Update database with Stripe data
                await query(`
                    UPDATE accounts
                    SET plan = $2,
                        subscription_status = $3,
                        stripe_subscription_id = $4,
                        current_period_start = $5,
                        current_period_end = $6,
                        cancel_at_period_end = $7,
                        updated_at = NOW()
                    WHERE account_id = $1
                `, [
                    acc.account_id,
                    plan,
                    sub.status,
                    sub.id,
                    periodStart,
                    periodEnd,
                    sub.cancel_at_period_end,
                ]);
                console.log(`  -> Database updated from Stripe`);

            } catch (err) {
                console.error(`Error syncing ${acc.owner_email}:`, err);
            }
        }
    } else if (syncWithStripe && !STRIPE_SECRET_KEY) {
        console.log("\nWarning: --sync requested but STRIPE_SECRET_KEY not set");
    }

    // Fix accounts with timestamps in seconds (need to convert to milliseconds)
    // Timestamps < 100000000000 (before Sept 2001 in ms) are likely in seconds
    console.log("\n=== Fixing Timestamps in Seconds ===\n");

    const SECONDS_THRESHOLD = 100000000000; // Timestamps below this in ms would be before Sept 2001
    const now = Date.now();

    // Find accounts with timestamps that appear to be in seconds
    const secondsAccounts = await queryMany<{
        account_id: string;
        owner_email: string;
        current_period_start: string | null;
        current_period_end: string | null;
    }>(`
        SELECT account_id, owner_email, current_period_start, current_period_end
        FROM accounts
        WHERE
            (current_period_start IS NOT NULL AND current_period_start > 0 AND current_period_start < $1)
            OR (current_period_end IS NOT NULL AND current_period_end > 0 AND current_period_end < $1)
    `, [SECONDS_THRESHOLD]);

    for (const acc of secondsAccounts) {
        const startSec = acc.current_period_start ? parseInt(acc.current_period_start) : 0;
        const endSec = acc.current_period_end ? parseInt(acc.current_period_end) : 0;

        // Convert seconds to milliseconds
        const startMs = startSec > 0 && startSec < SECONDS_THRESHOLD ? startSec * 1000 : startSec;
        const endMs = endSec > 0 && endSec < SECONDS_THRESHOLD ? endSec * 1000 : endSec;

        console.log(`${acc.owner_email}: Converting timestamps from seconds to milliseconds`);
        console.log(`  Start: ${startSec} -> ${startMs} (${new Date(startMs).toISOString()})`);
        console.log(`  End: ${endSec} -> ${endMs} (${new Date(endMs).toISOString()})`);

        await query(`
            UPDATE accounts
            SET
                current_period_start = $2,
                current_period_end = $3,
                updated_at = NOW()
            WHERE account_id = $1
        `, [acc.account_id, startMs, endMs]);

        console.log(`  -> Fixed!`);
    }

    if (secondsAccounts.length === 0) {
        console.log("No accounts with timestamps in seconds found.");
    }

    // Fix accounts with null/zero period data
    console.log("\n=== Fixing Invalid Periods ===\n");

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const defaultEnd = now + thirtyDaysMs;

    const updateSql = `
        UPDATE accounts
        SET
            current_period_start = $1,
            current_period_end = $2,
            subscription_status = CASE
                WHEN plan = 'free' THEN 'free'
                WHEN subscription_status IS NULL OR subscription_status = '' THEN 'active'
                ELSE subscription_status
            END,
            updated_at = NOW()
        WHERE
            (current_period_start IS NULL OR current_period_start <= 0)
            OR (current_period_end IS NULL OR current_period_end <= 0)
        RETURNING account_id, owner_email, plan, subscription_status, current_period_start, current_period_end;
    `;

    const res = await query(updateSql, [now, defaultEnd]);

    if (res.rowCount && res.rowCount > 0) {
        console.log(`Fixed ${res.rowCount} account(s) with invalid periods:\n`);
        for (const row of res.rows) {
            console.log(`  ${row.owner_email}: ${row.plan} (${row.subscription_status})`);
            console.log(`    Period: ${new Date(parseInt(row.current_period_start)).toISOString()} - ${new Date(parseInt(row.current_period_end)).toISOString()}`);
        }
    } else {
        console.log("No accounts needed period fixes.");
    }

    console.log("\n=== Done ===\n");
}

main()
    .then(() => {
        console.log("Billing period normalization complete.");
    })
    .catch((err) => {
        console.error("Failed to normalize billing periods", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDatabase();
    });
