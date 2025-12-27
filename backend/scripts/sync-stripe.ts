#!/usr/bin/env bun
/**
 * Stripe Subscription Sync Script
 * 
 * Fetches existing Stripe subscriptions and populates the database
 * with the correct account/subscription linkage.
 */

import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_51SibyE3iF1EG7t8gE3kbkMhzp2C6DEAJd6IYQFdsdJrypoFlNVQMyBTby4by8r7ligq0IxN5tf2ni4jYLmrxvsGt003sh1a7XL";

const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2025-12-15.clover",
    typescript: true,
});

// Price ID to plan mapping
const PRICE_TO_PLAN: Record<string, string> = {
    "price_1SicY53iF1EG7t8gbiQcgSbm": "starter",
    "price_1SicYI3iF1EG7t8gtO6EM5ci": "pro",
    "price_1SicYU3iF1EG7t8ga4THoYb7": "enterprise",
};

async function main() {
    console.log("🔍 Fetching Stripe customers and subscriptions...\n");
    
    // List all customers
    const customers = await stripe.customers.list({ limit: 100 });
    
    console.log(`Found ${customers.data.length} customer(s):\n`);
    
    for (const customer of customers.data) {
        console.log("━".repeat(60));
        console.log(`📧 Customer: ${customer.email || "No email"}`);
        console.log(`   ID: ${customer.id}`);
        console.log(`   Name: ${customer.name || "N/A"}`);
        console.log(`   Created: ${new Date(customer.created * 1000).toISOString()}`);
        
        // Get metadata
        if (customer.metadata && Object.keys(customer.metadata).length > 0) {
            console.log(`   Metadata: ${JSON.stringify(customer.metadata)}`);
        }
        
        // List subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            limit: 10,
        });
        
        if (subscriptions.data.length === 0) {
            console.log("   Subscriptions: None");
        } else {
            console.log(`   Subscriptions (${subscriptions.data.length}):`);
            for (const sub of subscriptions.data) {
                const priceId = sub.items.data[0]?.price?.id || "unknown";
                const plan = PRICE_TO_PLAN[priceId] || "unknown";
                console.log(`     • ${sub.id}`);
                console.log(`       Status: ${sub.status}`);
                console.log(`       Plan: ${plan} (${priceId})`);
                console.log(`       Current Period: ${new Date(sub.current_period_start * 1000).toISOString()} - ${new Date(sub.current_period_end * 1000).toISOString()}`);
                if (sub.cancel_at_period_end) {
                    console.log(`       ⚠️  Cancels at period end`);
                }
            }
        }
        console.log();
    }
    
    // Now generate SQL to restore data
    console.log("\n" + "═".repeat(60));
    console.log("📝 SQL to restore Stripe linkage:\n");
    
    for (const customer of customers.data) {
        if (!customer.email) continue;
        
        const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: "active",
            limit: 1,
        });
        
        const activeSub = subscriptions.data[0];
        if (activeSub) {
            const priceId = activeSub.items.data[0]?.price?.id || "";
            const plan = PRICE_TO_PLAN[priceId] || "free";
            
            console.log(`-- For user: ${customer.email}`);
            console.log(`UPDATE accounts SET`);
            console.log(`  stripe_customer_id = '${customer.id}',`);
            console.log(`  stripe_subscription_id = '${activeSub.id}',`);
            console.log(`  plan = '${plan}',`);
            console.log(`  subscription_status = '${activeSub.status}',`);
            console.log(`  billing_period_start = ${activeSub.current_period_start * 1000},`);
            console.log(`  billing_period_end = ${activeSub.current_period_end * 1000}`);
            console.log(`WHERE account_id = (SELECT account_id FROM users WHERE email = '${customer.email}');`);
            console.log();
        }
    }
    
    console.log("═".repeat(60));
    console.log("\n✅ Done! Copy the SQL above after creating your user account.\n");
}

main().catch(console.error);
