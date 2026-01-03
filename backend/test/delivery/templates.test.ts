/**
 * Email Templates Tests
 */

import { describe, it, expect } from "bun:test";
import {
    silenceAlertTemplate,
    silenceAlertSubject,
    weeklyReportTemplate,
    weeklyReportSubject,
    threadDigestTemplate,
    threadDigestSubject,
    type SilenceAlertData,
    type WeeklyReportData,
    type ThreadDigestData,
} from "../../src/delivery/templates";

// ============================================================================
// Test Data
// ============================================================================

const silenceAlertData: SilenceAlertData = {
    watcherName: "Client Support",
    threadId: "thread-123-abc-456",
    threadSubject: "Invoice #12345 - Payment Query",
    originalSender: "john@customer.com",
    hoursSilent: 80.5,
    thresholdHours: 72,
    lastActivityAt: Date.now() - 80 * 60 * 60 * 1000,
    dashboardUrl: "https://app.vigil.run/watchers/w1/threads/t1",
};

const weeklyReportData: WeeklyReportData = {
    watcherName: "Sales Pipeline",
    watcherId: "watcher-001",
    periodStart: Date.now() - 7 * 24 * 60 * 60 * 1000,
    periodEnd: Date.now(),
    stats: {
        totalThreads: 15,
        openThreads: 5,
        closedThreads: 8,
        silenceAlertsTriggered: 2,
        emailsProcessed: 45,
    },
    openThreads: [
        {
            threadId: "t1",
            subject: "Q4 Contract Review",
            originalSender: "alice@client.com",
            status: "open",
            hoursSilent: 96,
            messageCount: 4,
            openedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
        },
        {
            threadId: "t2",
            subject: "Partnership Proposal",
            originalSender: "bob@partner.com",
            status: "open",
            hoursSilent: 48,
            messageCount: 2,
            openedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
        },
    ],
    recentlyClosed: [
        {
            threadId: "t3",
            subject: "Invoice Question",
            originalSender: "carol@vendor.com",
            status: "closed",
            hoursSilent: 0,
            messageCount: 3,
            openedAt: Date.now() - 6 * 24 * 60 * 60 * 1000,
            closedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
        },
    ],
    dashboardUrl: "https://app.vigil.run/watchers/watcher-001",
};

const digestData: ThreadDigestData = {
    watcherName: "Operations",
    threads: [
        {
            threadId: "t1",
            subject: "Server Maintenance Request",
            originalSender: "ops@company.com",
            hoursSilent: 100,
            lastActivityAt: Date.now() - 100 * 60 * 60 * 1000,
        },
        {
            threadId: "t2",
            subject: "Security Audit Follow-up",
            originalSender: "security@company.com",
            hoursSilent: 85,
            lastActivityAt: Date.now() - 85 * 60 * 60 * 1000,
        },
    ],
    dashboardUrl: "https://app.vigil.run/watchers/w1",
};

// ============================================================================
// Silence Alert Template Tests
// ============================================================================

describe("Silence Alert Template", () => {
    it("generates valid HTML", () => {
        const html = silenceAlertTemplate(silenceAlertData);

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<html");
        expect(html).toContain("</html>");
    });

    it("includes watcher name", () => {
        const html = silenceAlertTemplate(silenceAlertData);

        expect(html).toContain("Client Support");
    });

    it("includes thread subject when provided", () => {
        const html = silenceAlertTemplate(silenceAlertData);

        expect(html).toContain("Invoice #12345 - Payment Query");
    });

    it("includes original sender when provided", () => {
        const html = silenceAlertTemplate(silenceAlertData);

        expect(html).toContain("john@customer.com");
    });

    it("formats silence duration", () => {
        const html = silenceAlertTemplate(silenceAlertData);

        // 80.5 hours = ~3d 8-9h depending on rounding
        expect(html).toMatch(/3d\s+\d+h|80/i);
    });

    it("includes dashboard link", () => {
        const html = silenceAlertTemplate(silenceAlertData);

        expect(html).toContain(silenceAlertData.dashboardUrl);
    });

    it("escapes HTML in user content", () => {
        const xssData: SilenceAlertData = {
            ...silenceAlertData,
            watcherName: "<script>alert('xss')</script>",
            threadSubject: "<img src=x onerror=alert(1)>",
        };

        const html = silenceAlertTemplate(xssData);

        // Script tag should be escaped
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
        // The entire img tag should be escaped
        expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    });

    it("handles missing optional fields", () => {
        const minimalData: SilenceAlertData = {
            watcherName: "Test Watcher",
            threadId: "t1",
            hoursSilent: 75,
            thresholdHours: 72,
            lastActivityAt: Date.now(),
            dashboardUrl: "https://example.com",
        };

        const html = silenceAlertTemplate(minimalData);

        expect(html).toContain("Test Watcher");
        expect(html).not.toContain("undefined");
    });
});

describe("Silence Alert Subject", () => {
    it("includes watcher name", () => {
        const subject = silenceAlertSubject(silenceAlertData);

        expect(subject).toContain("Client Support");
    });

    it("includes duration", () => {
        const subject = silenceAlertSubject(silenceAlertData);

        // 80.5 hours = ~3d depending on rounding
        expect(subject).toMatch(/3d\s+\d+h|80/);
    });

    it("starts with [Vigil]", () => {
        const subject = silenceAlertSubject(silenceAlertData);

        expect(subject).toMatch(/^\[Vigil\]/);
    });
});

// ============================================================================
// Weekly Report Template Tests
// ============================================================================

describe("Weekly Report Template", () => {
    it("generates valid HTML", () => {
        const html = weeklyReportTemplate(weeklyReportData);

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<html");
        expect(html).toContain("</html>");
    });

    it("includes watcher name", () => {
        const html = weeklyReportTemplate(weeklyReportData);

        expect(html).toContain("Sales Pipeline");
    });

    it("includes stats", () => {
        const html = weeklyReportTemplate(weeklyReportData);

        expect(html).toContain("5"); // open threads
        expect(html).toContain("8"); // closed threads
        expect(html).toContain("2"); // silence alerts
    });

    it("includes open threads", () => {
        const html = weeklyReportTemplate(weeklyReportData);

        expect(html).toContain("Q4 Contract Review");
        expect(html).toContain("Partnership Proposal");
        expect(html).toContain("alice@client.com");
    });

    it("includes recently closed threads", () => {
        const html = weeklyReportTemplate(weeklyReportData);

        expect(html).toContain("Invoice Question");
        expect(html).toContain("carol@vendor.com");
    });

    it("includes dashboard link", () => {
        const html = weeklyReportTemplate(weeklyReportData);

        expect(html).toContain(weeklyReportData.dashboardUrl);
    });

    it("handles empty thread lists", () => {
        const emptyData: WeeklyReportData = {
            ...weeklyReportData,
            openThreads: [],
            recentlyClosed: [],
        };

        const html = weeklyReportTemplate(emptyData);

        expect(html).toContain("No open threads");
        expect(html).toContain("No threads closed");
    });
});

describe("Weekly Report Subject", () => {
    it("includes watcher name", () => {
        const subject = weeklyReportSubject(weeklyReportData);

        expect(subject).toContain("Sales Pipeline");
    });

    it("includes open thread count", () => {
        const subject = weeklyReportSubject(weeklyReportData);

        expect(subject).toContain("5 open threads");
    });

    it("uses singular for one thread", () => {
        const singleData = {
            ...weeklyReportData,
            stats: { ...weeklyReportData.stats, openThreads: 1 },
        };

        const subject = weeklyReportSubject(singleData);

        expect(subject).toContain("1 open thread");
        expect(subject).not.toContain("threads");
    });

    it("shows 'All clear' when no open threads", () => {
        const clearData = {
            ...weeklyReportData,
            stats: { ...weeklyReportData.stats, openThreads: 0 },
        };

        const subject = weeklyReportSubject(clearData);

        expect(subject).toContain("All clear");
    });
});

// ============================================================================
// Thread Digest Template Tests
// ============================================================================

describe("Thread Digest Template", () => {
    it("generates valid HTML", () => {
        const html = threadDigestTemplate(digestData);

        expect(html).toContain("<!DOCTYPE html>");
    });

    it("includes all threads", () => {
        const html = threadDigestTemplate(digestData);

        expect(html).toContain("Server Maintenance Request");
        expect(html).toContain("Security Audit Follow-up");
    });

    it("includes thread count in header", () => {
        const html = threadDigestTemplate(digestData);

        expect(html).toContain("2 Threads");
    });

    it("includes silence durations", () => {
        const html = threadDigestTemplate(digestData);

        // 100 hours = 4d 4h
        expect(html).toMatch(/4d|100/);
    });
});

describe("Thread Digest Subject", () => {
    it("includes thread count", () => {
        const subject = threadDigestSubject(digestData);

        expect(subject).toContain("2 threads");
    });

    it("uses singular for one thread", () => {
        const singleData = {
            ...digestData,
            threads: [digestData.threads[0]],
        };

        const subject = threadDigestSubject(singleData);

        expect(subject).toContain("1 thread");
        expect(subject).not.toContain("threads");
    });
});
