/**
 * Tests for Email Router - Classification before Extraction
 */

import { describe, it, expect } from "bun:test";
import {
    routeEmail,
    hasAnySignalIndicators,
    getSignalDetails,
    ROUTER_VERSION,
} from "@/llm/router";

describe("Email Router", () => {
    describe("routeEmail", () => {
        describe("deadline detection", () => {
            it("should detect 'due by' deadline language", () => {
                const result = routeEmail({
                    email_text: "The report is due by Friday.",
                    sender_email: "sender@example.com",
                    subject: "Report",
                });

                expect(result.extract_deadline).toBe(true);
            });

            it("should detect 'deadline' keyword", () => {
                const result = routeEmail({
                    email_text: "The deadline is next week.",
                    sender_email: "sender@example.com",
                    subject: "Project",
                });

                expect(result.extract_deadline).toBe(true);
            });

            it("should detect date patterns", () => {
                const result = routeEmail({
                    email_text: "Please complete by 12/31.",
                    sender_email: "sender@example.com",
                    subject: "Task",
                });

                expect(result.extract_deadline).toBe(true);
            });

            it("should detect month names", () => {
                const result = routeEmail({
                    email_text: "Submit before January 15th.",
                    sender_email: "sender@example.com",
                    subject: "Submission",
                });

                expect(result.extract_deadline).toBe(true);
            });

            it("should detect 'by tomorrow' patterns", () => {
                const result = routeEmail({
                    email_text: "Need this by tomorrow morning.",
                    sender_email: "sender@example.com",
                    subject: "Request",
                });

                expect(result.extract_deadline).toBe(true);
            });
        });

        describe("soft deadline detection", () => {
            it("should detect 'end of week' pattern", () => {
                const result = routeEmail({
                    email_text: "Would be great by end of week.",
                    sender_email: "sender@example.com",
                    subject: "Request",
                });

                expect(result.extract_soft_deadline).toBe(true);
            });

            it("should detect 'soon' language", () => {
                const result = routeEmail({
                    email_text: "Please respond as soon as possible.",
                    sender_email: "sender@example.com",
                    subject: "Question",
                });

                expect(result.extract_soft_deadline).toBe(true);
            });

            it("should detect 'when you get a chance'", () => {
                const result = routeEmail({
                    email_text: "When you get a chance, please review.",
                    sender_email: "sender@example.com",
                    subject: "Review",
                });

                expect(result.extract_soft_deadline).toBe(true);
            });

            it("should detect 'next week' patterns", () => {
                const result = routeEmail({
                    email_text: "Hoping to discuss next week.",
                    sender_email: "sender@example.com",
                    subject: "Meeting",
                });

                expect(result.extract_soft_deadline).toBe(true);
            });
        });

        describe("urgency detection", () => {
            it("should detect URGENT keyword", () => {
                const result = routeEmail({
                    email_text: "URGENT: Server is down!",
                    sender_email: "sender@example.com",
                    subject: "Alert",
                });

                expect(result.extract_urgency).toBe(true);
            });

            it("should detect ASAP", () => {
                const result = routeEmail({
                    email_text: "Need help ASAP.",
                    sender_email: "sender@example.com",
                    subject: "Help",
                });

                expect(result.extract_urgency).toBe(true);
            });

            it("should detect 'critical' keyword", () => {
                const result = routeEmail({
                    email_text: "This is a critical issue.",
                    sender_email: "sender@example.com",
                    subject: "Issue",
                });

                expect(result.extract_urgency).toBe(true);
            });

            it("should detect 'important' keyword", () => {
                const result = routeEmail({
                    email_text: "This is an important matter.",
                    sender_email: "sender@example.com",
                    subject: "Matter",
                });

                expect(result.extract_urgency).toBe(true);
            });

            it("should detect multiple exclamation marks", () => {
                const result = routeEmail({
                    email_text: "Please respond!!",
                    sender_email: "sender@example.com",
                    subject: "Help",
                });

                expect(result.extract_urgency).toBe(true);
            });
        });

        describe("closure detection", () => {
            it("should detect 'resolved' keyword", () => {
                const result = routeEmail({
                    email_text: "The issue has been resolved.",
                    sender_email: "sender@example.com",
                    subject: "Issue Update",
                });

                expect(result.extract_closure).toBe(true);
            });

            it("should detect 'no action needed'", () => {
                const result = routeEmail({
                    email_text: "No action needed on this.",
                    sender_email: "sender@example.com",
                    subject: "FYI",
                });

                expect(result.extract_closure).toBe(true);
            });

            it("should detect 'marking as closed'", () => {
                const result = routeEmail({
                    email_text: "Marking this as closed.",
                    sender_email: "sender@example.com",
                    subject: "Ticket",
                });

                expect(result.extract_closure).toBe(true);
            });

            it("should detect 'thank you for resolving'", () => {
                const result = routeEmail({
                    email_text: "Thank you for resolving this quickly!",
                    sender_email: "sender@example.com",
                    subject: "Thanks",
                });

                expect(result.extract_closure).toBe(true);
            });
        });

        describe("informational emails", () => {
            it("should skip extraction for FYI emails", () => {
                const result = routeEmail({
                    email_text: "FYI - the meeting has been moved.",
                    sender_email: "sender@example.com",
                    subject: "Meeting Update",
                });

                expect(result.extract_deadline).toBe(false);
                expect(result.extract_soft_deadline).toBe(false);
                expect(result.extract_urgency).toBe(false);
            });

            it("should skip extraction for 'no action needed' emails", () => {
                const result = routeEmail({
                    email_text: "No action needed. Just wanted to keep you in the loop.",
                    sender_email: "sender@example.com",
                    subject: "Update",
                });

                expect(result.extract_deadline).toBe(false);
                expect(result.extract_urgency).toBe(false);
            });

            it("should still detect closure for FYI emails", () => {
                const result = routeEmail({
                    email_text: "FYI - the issue has been resolved.",
                    sender_email: "sender@example.com",
                    subject: "Update",
                });

                expect(result.extract_closure).toBe(true);
            });
        });

        describe("benign emails (no signals)", () => {
            it("should not flag simple greetings", () => {
                const result = routeEmail({
                    email_text: "Hi, just wanted to say hello!",
                    sender_email: "sender@example.com",
                    subject: "Hello",
                });

                expect(result.extract_deadline).toBe(false);
                expect(result.extract_soft_deadline).toBe(false);
                expect(result.extract_urgency).toBe(false);
                expect(result.extract_closure).toBe(false);
            });

            it("should not flag casual conversation", () => {
                const result = routeEmail({
                    email_text: "How was your weekend? Mine was great.",
                    sender_email: "sender@example.com",
                    subject: "Hey",
                });

                expect(result.extract_deadline).toBe(false);
                expect(result.extract_soft_deadline).toBe(false);
                expect(result.extract_urgency).toBe(false);
                expect(result.extract_closure).toBe(false);
            });
        });

        describe("multiple signals", () => {
            it("should detect multiple signal types", () => {
                const result = routeEmail({
                    email_text: "URGENT: This is due by Friday. Please confirm receipt.",
                    sender_email: "sender@example.com",
                    subject: "Deadline",
                });

                expect(result.extract_deadline).toBe(true);
                expect(result.extract_urgency).toBe(true);
            });

            it("should provide reasoning in response", () => {
                const result = routeEmail({
                    email_text: "The deadline is next week. This is high priority.",
                    sender_email: "sender@example.com",
                    subject: "Project",
                });

                expect(result.reasoning).toBeDefined();
                expect(result.reasoning?.length).toBeGreaterThan(0);
            });
        });

        describe("subject line consideration", () => {
            it("should detect signals in subject line", () => {
                const result = routeEmail({
                    email_text: "Let me know your thoughts.",
                    sender_email: "sender@example.com",
                    subject: "URGENT: Need response",
                });

                expect(result.extract_urgency).toBe(true);
            });

            it("should detect deadline in subject", () => {
                const result = routeEmail({
                    email_text: "Please review the attached.",
                    sender_email: "sender@example.com",
                    subject: "Due Friday: Report",
                });

                expect(result.extract_deadline).toBe(true);
            });
        });
    });

    describe("hasAnySignalIndicators", () => {
        it("should return true when signals present", () => {
            expect(hasAnySignalIndicators("This is urgent!", "Help")).toBe(true);
        });

        it("should return false for benign email", () => {
            expect(hasAnySignalIndicators("Hello there!", "Greetings")).toBe(false);
        });
    });

    describe("getSignalDetails", () => {
        it("should return detailed match information", () => {
            const details = getSignalDetails(
                "URGENT: Due by Friday. Issue resolved.",
                "Alert"
            );

            expect(details.deadline.detected).toBe(true);
            expect(details.deadline.matches.length).toBeGreaterThan(0);

            expect(details.urgency.detected).toBe(true);
            expect(details.urgency.matches.length).toBeGreaterThan(0);

            expect(details.closure.detected).toBe(true);
            expect(details.closure.matches.length).toBeGreaterThan(0);
        });

        it("should return empty matches for benign email", () => {
            const details = getSignalDetails("Hello there!", "Greetings");

            expect(details.deadline.detected).toBe(false);
            expect(details.deadline.matches).toEqual([]);

            expect(details.urgency.detected).toBe(false);
            expect(details.urgency.matches).toEqual([]);
        });
    });

    describe("ROUTER_VERSION", () => {
        it("should have a version string", () => {
            expect(ROUTER_VERSION).toBeDefined();
            expect(ROUTER_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
        });
    });
});
