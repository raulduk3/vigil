/**
 * Billing Types Tests
 *
 * Tests for subscription tier types, plan limits, and usage period calculations.
 */

import { describe, test, expect } from "bun:test";
import {
    type SubscriptionPlan,
    PLAN_LIMITS,
    PLAN_CONFIGS,
    getPlanLimits,
    getPlanConfig,
    hasUnlimitedEmails,
    getCurrentUsagePeriod,
    getUsagePeriodForTimestamp,
    isWithinPeriod,
    isValidPlan,
    getUpgradeOptions,
    isValidUpgrade,
} from "@/billing/types";

describe("Plan Limits", () => {
    test("free tier has 50 emails per week", () => {
        const limits = getPlanLimits("free");
        expect(limits.emails_per_week).toBe(50);
    });

    test("starter tier has 200 emails per week", () => {
        const limits = getPlanLimits("starter");
        expect(limits.emails_per_week).toBe(200);
    });

    test("pro tier has 1000 emails per week", () => {
        const limits = getPlanLimits("pro");
        expect(limits.emails_per_week).toBe(1000);
    });

    test("enterprise tier has unlimited emails", () => {
        const limits = getPlanLimits("enterprise");
        expect(limits.emails_per_week).toBe(-1);
        expect(hasUnlimitedEmails("enterprise")).toBe(true);
    });

    test("free tier does not have unlimited emails", () => {
        expect(hasUnlimitedEmails("free")).toBe(false);
    });

    test("all tiers have expected watcher limits", () => {
        expect(PLAN_LIMITS.free.max_watchers).toBe(2);
        expect(PLAN_LIMITS.starter.max_watchers).toBe(5);
        expect(PLAN_LIMITS.pro.max_watchers).toBe(20);
        expect(PLAN_LIMITS.enterprise.max_watchers).toBe(-1);
    });
});

describe("Plan Configs", () => {
    test("free tier is visible on dashboard", () => {
        const config = getPlanConfig("free");
        expect(config.visible_on_dashboard).toBe(true);
        expect(config.price_cents_monthly).toBe(0);
    });

    test("starter tier has correct pricing", () => {
        const config = getPlanConfig("starter");
        expect(config.visible_on_dashboard).toBe(true);
        expect(config.price_cents_monthly).toBe(999);
    });

    test("pro tier has correct pricing", () => {
        const config = getPlanConfig("pro");
        expect(config.visible_on_dashboard).toBe(true);
        expect(config.price_cents_monthly).toBe(2999);
    });

    test("enterprise tier is NOT visible on dashboard", () => {
        const config = getPlanConfig("enterprise");
        expect(config.visible_on_dashboard).toBe(false);
    });
});

describe("Usage Period Calculations", () => {
    test("getCurrentUsagePeriod returns Monday to Sunday range", () => {
        const period = getCurrentUsagePeriod();
        
        // Period start should be a Monday at 00:00:00 UTC
        const start = new Date(period.period_start);
        expect(start.getUTCDay()).toBe(1); // Monday
        expect(start.getUTCHours()).toBe(0);
        expect(start.getUTCMinutes()).toBe(0);
        expect(start.getUTCSeconds()).toBe(0);
        
        // Period end should be a Sunday at 23:59:59 UTC
        const end = new Date(period.period_end);
        expect(end.getUTCDay()).toBe(0); // Sunday
        expect(end.getUTCHours()).toBe(23);
        expect(end.getUTCMinutes()).toBe(59);
    });

    test("getUsagePeriodForTimestamp returns correct period", () => {
        // Test with a known Wednesday: Dec 25, 2024
        const christmas2024 = new Date("2024-12-25T12:00:00Z").getTime();
        const period = getUsagePeriodForTimestamp(christmas2024);
        
        // Monday of that week is Dec 23, 2024
        const start = new Date(period.period_start);
        expect(start.getUTCDate()).toBe(23);
        expect(start.getUTCMonth()).toBe(11); // December (0-indexed)
        
        // Sunday of that week is Dec 29, 2024
        const end = new Date(period.period_end);
        expect(end.getUTCDate()).toBe(29);
    });

    test("isWithinPeriod correctly identifies timestamps in period", () => {
        const period = {
            period_start: new Date("2024-12-23T00:00:00Z").getTime(),
            period_end: new Date("2024-12-29T23:59:59.999Z").getTime(),
        };
        
        // Mid-week should be within
        const midWeek = new Date("2024-12-25T12:00:00Z").getTime();
        expect(isWithinPeriod(midWeek, period)).toBe(true);
        
        // Before period should be outside
        const beforePeriod = new Date("2024-12-22T23:59:59Z").getTime();
        expect(isWithinPeriod(beforePeriod, period)).toBe(false);
        
        // After period should be outside
        const afterPeriod = new Date("2024-12-30T00:00:01Z").getTime();
        expect(isWithinPeriod(afterPeriod, period)).toBe(false);
    });
});

describe("Plan Validation", () => {
    test("isValidPlan accepts valid plans", () => {
        expect(isValidPlan("free")).toBe(true);
        expect(isValidPlan("starter")).toBe(true);
        expect(isValidPlan("pro")).toBe(true);
        expect(isValidPlan("enterprise")).toBe(true);
    });

    test("isValidPlan rejects invalid plans", () => {
        expect(isValidPlan("premium")).toBe(false);
        expect(isValidPlan("basic")).toBe(false);
        expect(isValidPlan("")).toBe(false);
    });
});

describe("Plan Upgrades", () => {
    test("getUpgradeOptions returns valid upgrade paths", () => {
        const freeOptions = getUpgradeOptions("free");
        expect(freeOptions).toContain("starter");
        expect(freeOptions).toContain("pro");
        expect(freeOptions).not.toContain("enterprise"); // Not visible on dashboard

        const starterOptions = getUpgradeOptions("starter");
        expect(starterOptions).toContain("pro");
        expect(starterOptions).not.toContain("free");

        const proOptions = getUpgradeOptions("pro");
        expect(proOptions).not.toContain("enterprise"); // Not visible on dashboard
        expect(proOptions).not.toContain("free");
        expect(proOptions).not.toContain("starter");
    });

    test("isValidUpgrade correctly validates upgrade paths", () => {
        // Valid upgrades
        expect(isValidUpgrade("free", "starter")).toBe(true);
        expect(isValidUpgrade("free", "pro")).toBe(true);
        expect(isValidUpgrade("free", "enterprise")).toBe(true);
        expect(isValidUpgrade("starter", "pro")).toBe(true);
        expect(isValidUpgrade("pro", "enterprise")).toBe(true);

        // Invalid (downgrades or same plan)
        expect(isValidUpgrade("starter", "free")).toBe(false);
        expect(isValidUpgrade("pro", "starter")).toBe(false);
        expect(isValidUpgrade("free", "free")).toBe(false);
        expect(isValidUpgrade("enterprise", "pro")).toBe(false);
    });
});

describe("Feature Flags by Tier", () => {
    test("free tier has limited features", () => {
        const limits = PLAN_LIMITS.free;
        expect(limits.advanced_reporting).toBe(false);
        expect(limits.webhook_notifications).toBe(false);
        expect(limits.sms_notifications).toBe(false);
        expect(limits.support_level).toBe("community");
    });

    test("starter tier has webhook but no SMS", () => {
        const limits = PLAN_LIMITS.starter;
        expect(limits.webhook_notifications).toBe(true);
        expect(limits.sms_notifications).toBe(false);
        expect(limits.support_level).toBe("email");
    });

    test("pro tier has all features except dedicated support", () => {
        const limits = PLAN_LIMITS.pro;
        expect(limits.advanced_reporting).toBe(true);
        expect(limits.webhook_notifications).toBe(true);
        expect(limits.sms_notifications).toBe(true);
        expect(limits.support_level).toBe("priority");
    });

    test("enterprise tier has all features", () => {
        const limits = PLAN_LIMITS.enterprise;
        expect(limits.advanced_reporting).toBe(true);
        expect(limits.webhook_notifications).toBe(true);
        expect(limits.sms_notifications).toBe(true);
        expect(limits.support_level).toBe("dedicated");
    });
});
