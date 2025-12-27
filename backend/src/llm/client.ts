/**
 * LLM Service Client
 *
 * HTTP client for calling the external LLM service endpoints with automatic
 * fallback to regex-based extraction when the service is unavailable.
 *
 * SDD Requirements:
 * - FR-7: Three-tier extraction model (hard deadline, soft deadline, urgency)
 * - IR-11: LLM timeout (10-second max response)
 * - MR-LLMService-1: Hard deadline extraction
 * - MR-LLMService-2: Closure signal detection
 * - MR-LLMService-4: Soft deadline signal extraction
 * - MR-LLMService-5: Urgency signal detection
 */

import {
    HardDeadlineRequest,
    HardDeadlineResponse,
    ClosureDetectionRequest,
    ClosureDetectionResponse,
    SoftDeadlineRequest,
    SoftDeadlineResponse,
    UrgencySignalRequest,
    UrgencySignalResponse,
    extractHardDeadline,
    detectClosureSignal,
    extractSoftDeadlineSignal,
    detectUrgencySignal,
    runAllExtractors,
    ExtractionResult,
} from "./extractor";
import { routeEmail } from "./router";

/**
 * LLM service configuration
 */
export interface LLMClientConfig {
    /** Base URL of the LLM service (e.g., "http://localhost:8000") */
    baseUrl: string;
    /** Request timeout in milliseconds (default: 10000 per IR-11) */
    timeoutMs: number;
    /** Whether to fall back to regex when service unavailable (default: true) */
    enableFallback: boolean;
    /** API key for authentication (optional) */
    apiKey?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: LLMClientConfig = {
    baseUrl: process.env.LLM_SERVICE_URL || "http://localhost:8000",
    timeoutMs: 10000, // IR-11: 10-second max response
    enableFallback: true,
};

/**
 * Extraction source indicator
 */
export type ExtractionSource = "llm" | "regex";

/**
 * Extended extraction response with source metadata
 */
export interface ExtractedWithSource<T> {
    result: T;
    source: ExtractionSource;
    latencyMs: number;
    error?: string;
}

/**
 * Routing request for determining which extractions to perform
 */
export interface RoutingRequest {
    email_text: string;
    sender_email: string;
    subject: string;
    thread_id?: string;
}

/**
 * Routing response indicating which extraction types are needed
 */
export interface RoutingResponse {
    extract_deadline: boolean;
    extract_soft_deadline: boolean;
    extract_urgency: boolean;
    extract_closure: boolean;
    reasoning?: string;
}

/**
 * LLM Service Client
 *
 * Provides HTTP interface to LLM service with automatic fallback
 * to regex extraction when the service is unavailable.
 */
export class LLMClient {
    private config: LLMClientConfig;

    constructor(config: Partial<LLMClientConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Make HTTP request to LLM service with timeout handling
     */
    private async fetchWithTimeout<T>(
        endpoint: string,
        body: unknown
    ): Promise<{ data: T; latencyMs: number }> {
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            this.config.timeoutMs
        );

        const startTime = Date.now();

        try {
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };

            if (this.config.apiKey) {
                headers["Authorization"] = `Bearer ${this.config.apiKey}`;
            }

            const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            const latencyMs = Date.now() - startTime;

            if (!response.ok) {
                throw new Error(
                    `LLM service returned ${response.status}: ${response.statusText}`
                );
            }

            const data = (await response.json()) as T;
            return { data, latencyMs };
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Route an email to determine which extraction types are needed.
     * This is the "router LLM" that runs on every inbound email.
     *
     * Falls back to extracting all types if routing fails.
     */
    async route(
        request: RoutingRequest
    ): Promise<ExtractedWithSource<RoutingResponse>> {
        const startTime = Date.now();

        try {
            const { data, latencyMs } =
                await this.fetchWithTimeout<RoutingResponse>("/route", request);

            return {
                result: data,
                source: "llm",
                latencyMs,
            };
        } catch (error) {
            const latencyMs = Date.now() - startTime;

            if (!this.config.enableFallback) {
                throw error;
            }

            // Fallback: Use regex-based router for intelligent classification
            const regexResult = routeEmail(request);

            return {
                result: {
                    ...regexResult,
                    reasoning: `[Regex fallback] ${regexResult.reasoning}`,
                },
                source: "regex",
                latencyMs,
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown routing error",
            };
        }
    }

    /**
     * Extract hard deadline from email text (MR-LLMService-1)
     */
    async extractHardDeadline(
        request: HardDeadlineRequest
    ): Promise<ExtractedWithSource<HardDeadlineResponse>> {
        const startTime = Date.now();

        try {
            const { data, latencyMs } =
                await this.fetchWithTimeout<HardDeadlineResponse>(
                    "/extract/deadline",
                    request
                );

            return {
                result: data,
                source: "llm",
                latencyMs,
            };
        } catch (error) {
            const latencyMs = Date.now() - startTime;

            if (!this.config.enableFallback) {
                throw error;
            }

            // Fall back to regex extraction
            const result = extractHardDeadline(request);

            return {
                result,
                source: "regex",
                latencyMs,
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown LLM error",
            };
        }
    }

    /**
     * Detect closure signal in email text (MR-LLMService-2)
     */
    async detectClosure(
        request: ClosureDetectionRequest
    ): Promise<ExtractedWithSource<ClosureDetectionResponse>> {
        const startTime = Date.now();

        try {
            const { data, latencyMs } =
                await this.fetchWithTimeout<ClosureDetectionResponse>(
                    "/extract/closure",
                    request
                );

            return {
                result: data,
                source: "llm",
                latencyMs,
            };
        } catch (error) {
            const latencyMs = Date.now() - startTime;

            if (!this.config.enableFallback) {
                throw error;
            }

            // Fall back to regex extraction
            const result = detectClosureSignal(request);

            return {
                result,
                source: "regex",
                latencyMs,
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown LLM error",
            };
        }
    }

    /**
     * Extract soft deadline signal from email text (MR-LLMService-4)
     */
    async extractSoftDeadline(
        request: SoftDeadlineRequest
    ): Promise<ExtractedWithSource<SoftDeadlineResponse>> {
        const startTime = Date.now();

        try {
            const { data, latencyMs } =
                await this.fetchWithTimeout<SoftDeadlineResponse>(
                    "/extract/soft_deadline",
                    request
                );

            return {
                result: data,
                source: "llm",
                latencyMs,
            };
        } catch (error) {
            const latencyMs = Date.now() - startTime;

            if (!this.config.enableFallback) {
                throw error;
            }

            // Fall back to regex extraction
            const result = extractSoftDeadlineSignal(request);

            return {
                result,
                source: "regex",
                latencyMs,
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown LLM error",
            };
        }
    }

    /**
     * Detect urgency signal in email text (MR-LLMService-5)
     */
    async detectUrgency(
        request: UrgencySignalRequest
    ): Promise<ExtractedWithSource<UrgencySignalResponse>> {
        const startTime = Date.now();

        try {
            const { data, latencyMs } =
                await this.fetchWithTimeout<UrgencySignalResponse>(
                    "/extract/urgency",
                    request
                );

            return {
                result: data,
                source: "llm",
                latencyMs,
            };
        } catch (error) {
            const latencyMs = Date.now() - startTime;

            if (!this.config.enableFallback) {
                throw error;
            }

            // Fall back to regex extraction
            const result = detectUrgencySignal(request);

            return {
                result,
                source: "regex",
                latencyMs,
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown LLM error",
            };
        }
    }

    /**
     * Run all extractors on email text.
     *
     * Can optionally use routing to determine which extractions to perform,
     * or extract all signals (default behavior).
     */
    async extractAll(
        emailText: string,
        referenceTimestamp: number,
        referenceTimezone: string = "UTC",
        options?: {
            useRouting?: boolean;
            senderEmail?: string;
            subject?: string;
            threadId?: string;
        }
    ): Promise<{
        result: ExtractionResult;
        sources: {
            hardDeadline: ExtractionSource;
            closure: ExtractionSource;
            softDeadline: ExtractionSource;
            urgencySignal: ExtractionSource;
        };
        totalLatencyMs: number;
        errors: string[];
    }> {
        const startTime = Date.now();
        const errors: string[] = [];

        // Determine which extractions to perform
        let routing: RoutingResponse = {
            extract_deadline: true,
            extract_soft_deadline: true,
            extract_urgency: true,
            extract_closure: true,
        };

        if (options?.useRouting && options.senderEmail && options.subject) {
            const routeResult = await this.route({
                email_text: emailText,
                sender_email: options.senderEmail,
                subject: options.subject,
                thread_id: options.threadId,
            });
            routing = routeResult.result;
            if (routeResult.error) {
                errors.push(`Routing: ${routeResult.error}`);
            }
        }

        // Run extractions in parallel
        const [deadline, closure, softDeadline, urgency] = await Promise.all([
            routing.extract_deadline
                ? this.extractHardDeadline({
                      email_text: emailText,
                      reference_timestamp: referenceTimestamp,
                      reference_timezone: referenceTimezone,
                  })
                : Promise.resolve({
                      result: {
                          deadline_found: false,
                          deadline_utc: null,
                          deadline_text: "",
                          source_span: "",
                          confidence: "low" as const,
                          is_absolute: false,
                          binding_language: false,
                          extractor_version: "v1.0.0",
                      },
                      source: "regex" as ExtractionSource,
                      latencyMs: 0,
                  }),
            routing.extract_closure
                ? this.detectClosure({ email_text: emailText })
                : Promise.resolve({
                      result: {
                          closure_found: false,
                          closure_type: "none" as const,
                          source_span: "",
                          confidence: "low" as const,
                          extractor_version: "v1.0.0",
                      },
                      source: "regex" as ExtractionSource,
                      latencyMs: 0,
                  }),
            routing.extract_soft_deadline
                ? this.extractSoftDeadline({
                      email_text: emailText,
                      reference_timestamp: referenceTimestamp,
                  })
                : Promise.resolve({
                      result: {
                          signal_found: false,
                          signal_text: "",
                          source_span: "",
                          estimated_horizon_hours: null,
                          confidence: "low" as const,
                          binding_language: false,
                          extractor_version: "v1.0.0",
                      },
                      source: "regex" as ExtractionSource,
                      latencyMs: 0,
                  }),
            routing.extract_urgency
                ? this.detectUrgency({ email_text: emailText })
                : Promise.resolve({
                      result: {
                          urgency_found: false,
                          urgency_level: "low" as const,
                          indicators: [],
                          source_span: "",
                          extractor_version: "v1.0.0",
                      },
                      source: "regex" as ExtractionSource,
                      latencyMs: 0,
                  }),
        ]);

        // Collect errors
        if ("error" in deadline && deadline.error)
            errors.push(`Deadline: ${deadline.error}`);
        if ("error" in closure && closure.error)
            errors.push(`Closure: ${closure.error}`);
        if ("error" in softDeadline && softDeadline.error)
            errors.push(`SoftDeadline: ${softDeadline.error}`);
        if ("error" in urgency && urgency.error)
            errors.push(`Urgency: ${urgency.error}`);

        return {
            result: {
                hardDeadline: deadline.result,
                closure: closure.result,
                softDeadline: softDeadline.result,
                urgencySignal: urgency.result,
            },
            sources: {
                hardDeadline: deadline.source,
                closure: closure.source,
                softDeadline: softDeadline.source,
                urgencySignal: urgency.source,
            },
            totalLatencyMs: Date.now() - startTime,
            errors,
        };
    }

    /**
     * Run all extractors using only regex (no LLM service call).
     * Useful for testing and when LLM service is explicitly disabled.
     */
    extractAllRegex(
        emailText: string,
        referenceTimestamp: number,
        referenceTimezone: string = "UTC"
    ): ExtractionResult {
        return runAllExtractors(
            emailText,
            referenceTimestamp,
            referenceTimezone
        );
    }

    /**
     * Health check for LLM service
     */
    async healthCheck(): Promise<{
        available: boolean;
        latencyMs: number;
        error?: string;
    }> {
        const startTime = Date.now();

        try {
            const response = await fetch(`${this.config.baseUrl}/health`, {
                method: "GET",
                signal: AbortSignal.timeout(5000),
            });

            const latencyMs = Date.now() - startTime;

            return {
                available: response.ok,
                latencyMs,
            };
        } catch (error) {
            return {
                available: false,
                latencyMs: Date.now() - startTime,
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown health check error",
            };
        }
    }
}

/**
 * Create default LLM client instance
 */
export function createLLMClient(config?: Partial<LLMClientConfig>): LLMClient {
    return new LLMClient(config);
}

/**
 * Singleton instance for convenience
 */
let defaultClient: LLMClient | null = null;

export function getDefaultLLMClient(): LLMClient {
    if (!defaultClient) {
        defaultClient = createLLMClient();
    }
    return defaultClient;
}

/**
 * Reset default client (useful for testing)
 */
export function resetDefaultLLMClient(): void {
    defaultClient = null;
}
