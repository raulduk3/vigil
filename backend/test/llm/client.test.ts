/**
 * LLM Client Tests
 *
 * Tests for the LLM service client with regex fallback.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
    LLMClient,
    createLLMClient,
    getDefaultLLMClient,
    resetDefaultLLMClient,
    type LLMClientConfig,
} from "../../src/llm/client";

// Mock fetch for testing
const originalFetch = globalThis.fetch;

function mockFetch(
    handler: (url: string, init?: RequestInit) => Promise<Response>
) {
    globalThis.fetch = handler as typeof fetch;
}

function restoreFetch() {
    globalThis.fetch = originalFetch;
}

describe("LLMClient", () => {
    beforeEach(() => {
        resetDefaultLLMClient();
    });

    afterEach(() => {
        restoreFetch();
    });

    describe("constructor", () => {
        it("should use default configuration", () => {
            const client = new LLMClient();
            // Client should be created without error
            expect(client).toBeDefined();
        });

        it("should merge custom configuration", () => {
            const client = new LLMClient({
                baseUrl: "http://custom:9000",
                timeoutMs: 5000,
            });
            expect(client).toBeDefined();
        });
    });

    describe("extractHardDeadline", () => {
        it("should call LLM service when available", async () => {
            const mockResponse = {
                deadline_found: true,
                deadline_utc: 1735336800000,
                deadline_text: "Friday December 27",
                source_span: "by Friday December 27",
                confidence: "high",
                is_absolute: true,
                binding_language: true,
                extractor_version: "v1.0.0",
            };

            mockFetch(async (url) => {
                if (url.includes("/extract/deadline")) {
                    return new Response(JSON.stringify(mockResponse), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                return new Response("Not found", { status: 404 });
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });
            const result = await client.extractHardDeadline({
                email_text: "Please reply by Friday December 27",
                reference_timestamp: 1703462400000,
                reference_timezone: "UTC",
            });

            expect(result.source).toBe("llm");
            expect(result.result.deadline_found).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it("should fall back to regex when LLM service unavailable", async () => {
            mockFetch(async () => {
                throw new Error("Connection refused");
            });

            const client = new LLMClient({
                baseUrl: "http://test:8000",
                enableFallback: true,
            });
            const result = await client.extractHardDeadline({
                email_text: "Due by Friday at 5pm",
                reference_timestamp: 1703462400000, // Fixed timestamp for deterministic test
                reference_timezone: "UTC",
            });

            expect(result.source).toBe("regex");
            expect(result.error).toBe("Connection refused");
            // Regex extractor should still find the deadline
            expect(result.result.deadline_found).toBe(true);
        });

        it("should throw when fallback disabled and service unavailable", async () => {
            mockFetch(async () => {
                throw new Error("Connection refused");
            });

            const client = new LLMClient({
                baseUrl: "http://test:8000",
                enableFallback: false,
            });

            await expect(
                client.extractHardDeadline({
                    email_text: "Please reply by Friday",
                    reference_timestamp: Date.now(),
                    reference_timezone: "UTC",
                })
            ).rejects.toThrow("Connection refused");
        });
    });

    describe("detectClosure", () => {
        it("should call LLM service when available", async () => {
            const mockResponse = {
                closure_found: true,
                closure_type: "explicit",
                source_span: "this issue is resolved",
                confidence: "high",
                extractor_version: "v1.0.0",
            };

            mockFetch(async (url) => {
                if (url.includes("/extract/closure")) {
                    return new Response(JSON.stringify(mockResponse), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                return new Response("Not found", { status: 404 });
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });
            const result = await client.detectClosure({
                email_text: "Thanks, this issue is resolved now",
            });

            expect(result.source).toBe("llm");
            expect(result.result.closure_found).toBe(true);
            expect(result.result.closure_type).toBe("explicit");
        });

        it("should fall back to regex when LLM service unavailable", async () => {
            mockFetch(async () => {
                throw new Error("Timeout");
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });
            const result = await client.detectClosure({
                email_text: "No further action needed",
            });

            expect(result.source).toBe("regex");
            expect(result.result.closure_found).toBe(true);
        });
    });

    describe("extractSoftDeadline", () => {
        it("should call LLM service when available", async () => {
            const mockResponse = {
                signal_found: true,
                signal_text: "next week",
                source_span: "sometime next week",
                estimated_horizon_hours: 168,
                confidence: "medium",
                binding_language: false,
                extractor_version: "v1.0.0",
            };

            mockFetch(async (url) => {
                if (url.includes("/extract/soft_deadline")) {
                    return new Response(JSON.stringify(mockResponse), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                return new Response("Not found", { status: 404 });
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });
            const result = await client.extractSoftDeadline({
                email_text: "I'll need this sometime next week",
                reference_timestamp: Date.now(),
            });

            expect(result.source).toBe("llm");
            expect(result.result.signal_found).toBe(true);
        });

        it("should fall back to regex when LLM service unavailable", async () => {
            mockFetch(async () => {
                throw new Error("Service unavailable");
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });
            const result = await client.extractSoftDeadline({
                email_text: "Please do this by end of week",
                reference_timestamp: Date.now(),
            });

            expect(result.source).toBe("regex");
            expect(result.result.signal_found).toBe(true);
            expect(result.result.signal_text).toBe("end of week");
        });
    });

    describe("detectUrgency", () => {
        it("should call LLM service when available", async () => {
            const mockResponse = {
                urgency_found: true,
                urgency_level: "high",
                indicators: ["urgent", "asap"],
                source_span: "This is urgent, need it ASAP",
                extractor_version: "v1.0.0",
            };

            mockFetch(async (url) => {
                if (url.includes("/extract/urgency")) {
                    return new Response(JSON.stringify(mockResponse), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                return new Response("Not found", { status: 404 });
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });
            const result = await client.detectUrgency({
                email_text: "This is urgent, need it ASAP",
            });

            expect(result.source).toBe("llm");
            expect(result.result.urgency_found).toBe(true);
            expect(result.result.urgency_level).toBe("high");
        });

        it("should fall back to regex when LLM service unavailable", async () => {
            mockFetch(async () => {
                throw new Error("Network error");
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });
            const result = await client.detectUrgency({
                email_text: "This is critical and needs immediate attention",
            });

            expect(result.source).toBe("regex");
            expect(result.result.urgency_found).toBe(true);
            expect(result.result.urgency_level).toBe("high");
        });
    });

    describe("route", () => {
        it("should call routing endpoint when available", async () => {
            const mockResponse = {
                extract_deadline: true,
                extract_soft_deadline: false,
                extract_urgency: true,
                extract_closure: false,
                reasoning: "Email contains deadline and urgency signals",
            };

            mockFetch(async (url) => {
                if (url.includes("/route")) {
                    return new Response(JSON.stringify(mockResponse), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                return new Response("Not found", { status: 404 });
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });
            const result = await client.route({
                email_text: "Urgent: Please reply by Friday",
                sender_email: "sender@example.com",
                subject: "Action Required",
            });

            expect(result.source).toBe("llm");
            expect(result.result.extract_deadline).toBe(true);
            expect(result.result.extract_urgency).toBe(true);
        });

        it("should fall back to regex router when LLM unavailable", async () => {
            mockFetch(async () => {
                throw new Error("Routing service unavailable");
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });

            // Test with email that has deadline, urgency, and closure indicators
            const result = await client.route({
                email_text: "URGENT: This is due by Friday. Problem has been resolved.",
                sender_email: "sender@example.com",
                subject: "Test",
            });

            expect(result.source).toBe("regex");
            expect(result.result.extract_deadline).toBe(true); // "due by Friday"
            expect(result.result.extract_urgency).toBe(true); // "URGENT"
            expect(result.result.extract_closure).toBe(true); // "resolved"
            expect(result.error).toBe("Routing service unavailable");
        });

        it("should not extract signals for informational emails", async () => {
            mockFetch(async () => {
                throw new Error("Routing service unavailable");
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });

            // Test with benign informational email
            const result = await client.route({
                email_text: "FYI - just letting you know about the update.",
                sender_email: "sender@example.com",
                subject: "Test",
            });

            expect(result.source).toBe("regex");
            expect(result.result.extract_deadline).toBe(false);
            expect(result.result.extract_soft_deadline).toBe(false);
            expect(result.result.extract_urgency).toBe(false);
            // Closure might still be checked for FYI emails
        });
    });

    describe("extractAll", () => {
        it("should run all extractors and collect results", async () => {
            mockFetch(async () => {
                throw new Error("Service unavailable");
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });
            const { result, sources, errors } = await client.extractAll(
                "Urgent: Due by Friday. This is critical.",
                1703462400000, // Fixed timestamp
                "UTC"
            );

            // All should use regex fallback
            expect(sources.hardDeadline).toBe("regex");
            expect(sources.closure).toBe("regex");
            expect(sources.softDeadline).toBe("regex");
            expect(sources.urgencySignal).toBe("regex");

            // Should find deadline and urgency
            expect(result.hardDeadline.deadline_found).toBe(true);
            expect(result.urgencySignal.urgency_found).toBe(true);

            // Should collect errors
            expect(errors.length).toBeGreaterThan(0);
        });

        it("should use routing when enabled", async () => {
            const routingResponse = {
                extract_deadline: true,
                extract_soft_deadline: false,
                extract_urgency: false,
                extract_closure: false,
            };

            mockFetch(async (url) => {
                if (url.includes("/route")) {
                    return new Response(JSON.stringify(routingResponse), {
                        status: 200,
                    });
                }
                // Other endpoints fail
                throw new Error("Endpoint unavailable");
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });
            const { result, sources } = await client.extractAll(
                "Please reply by Friday",
                Date.now(),
                "UTC",
                {
                    useRouting: true,
                    senderEmail: "sender@example.com",
                    subject: "Test",
                }
            );

            // Deadline was routed to be extracted (will use regex fallback)
            expect(sources.hardDeadline).toBe("regex");
            // Others were not routed, should have default "not found" results
            expect(result.softDeadline.signal_found).toBe(false);
        });
    });

    describe("extractAllRegex", () => {
        it("should run all extractors using only regex", () => {
            const client = new LLMClient();
            const result = client.extractAllRegex(
                "This is urgent! Due by Friday at 5pm. Thank you for your help.",
                1703462400000, // Fixed timestamp
                "UTC"
            );

            expect(result.hardDeadline.deadline_found).toBe(true);
            expect(result.urgencySignal.urgency_found).toBe(true);
            expect(result.closure.closure_found).toBe(true); // "Thank you for your help"
        });
    });

    describe("healthCheck", () => {
        it("should return available true when service responds", async () => {
            mockFetch(async (url) => {
                if (url.includes("/health")) {
                    return new Response(JSON.stringify({ status: "ok" }), {
                        status: 200,
                    });
                }
                return new Response("Not found", { status: 404 });
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });
            const health = await client.healthCheck();

            expect(health.available).toBe(true);
            expect(health.latencyMs).toBeGreaterThanOrEqual(0);
        });

        it("should return available false when service unavailable", async () => {
            mockFetch(async () => {
                throw new Error("Connection refused");
            });

            const client = new LLMClient({ baseUrl: "http://test:8000" });
            const health = await client.healthCheck();

            expect(health.available).toBe(false);
            expect(health.error).toBe("Connection refused");
        });
    });

    describe("singleton", () => {
        it("should return same instance from getDefaultLLMClient", () => {
            const client1 = getDefaultLLMClient();
            const client2 = getDefaultLLMClient();
            expect(client1).toBe(client2);
        });

        it("should create new instance after reset", () => {
            const client1 = getDefaultLLMClient();
            resetDefaultLLMClient();
            const client2 = getDefaultLLMClient();
            expect(client1).not.toBe(client2);
        });
    });

    describe("timeout handling", () => {
        it("should timeout after configured duration", async () => {
            mockFetch(async (url, init) => {
                // Simulate slow response
                await new Promise((resolve) => setTimeout(resolve, 500));
                
                // Check if aborted
                if (init?.signal?.aborted) {
                    throw new Error("Aborted");
                }
                
                return new Response(JSON.stringify({}), { status: 200 });
            });

            const client = new LLMClient({
                baseUrl: "http://test:8000",
                timeoutMs: 100,
                enableFallback: true,
            });

            const result = await client.extractHardDeadline({
                email_text: "Reply by Friday",
                reference_timestamp: 1703462400000, // Fixed timestamp
                reference_timezone: "UTC",
            });

            // Should fall back to regex due to timeout
            expect(result.source).toBe("regex");
        });
    });

    describe("API key authentication", () => {
        it("should include Authorization header when apiKey configured", async () => {
            let capturedHeaders: HeadersInit | undefined;

            mockFetch(async (url, init) => {
                capturedHeaders = init?.headers;
                return new Response(
                    JSON.stringify({
                        deadline_found: false,
                        deadline_utc: null,
                        deadline_text: "",
                        source_span: "",
                        confidence: "low",
                        is_absolute: false,
                        binding_language: false,
                        extractor_version: "v1.0.0",
                    }),
                    { status: 200 }
                );
            });

            const client = new LLMClient({
                baseUrl: "http://test:8000",
                apiKey: "test-api-key",
            });

            await client.extractHardDeadline({
                email_text: "Test",
                reference_timestamp: Date.now(),
                reference_timezone: "UTC",
            });

            expect(capturedHeaders).toBeDefined();
            expect((capturedHeaders as Record<string, string>)["Authorization"]).toBe(
                "Bearer test-api-key"
            );
        });
    });
});
