/**
 * Backend Ingestion Orchestrator
 *
 * Orchestrates the email ingestion pipeline including:
 * - Email parsing (MR-BackendIngestion-1)
 * - Sender validation (MR-BackendIngestion-2)
 * - Deduplication (MR-BackendIngestion-3)
 * - LLM extraction orchestration (MR-BackendIngestion-4)
 *
 * This module coordinates the flow from raw email to events.
 *
 * Key timestamp semantics:
 * - sent_at: When the original email was sent (from Date header) - used for timeline/urgency
 * - ingested_at: When Vigil received it (Date.now()) - for audit only
 */

import type { VigilEvent, WatcherPolicy } from "@/events/types";
import {
    extractHardDeadline,
    detectClosureSignal,
    extractSoftDeadlineSignal,
    detectUrgencySignal,
    validateSourceSpan,
} from "@/llm/extractor";
import { routeEmail } from "@/llm/router";
import type { RoutingRequest, RoutingResponse } from "@/llm/client";
import { normalizeSubject } from "@/ingestion/validator";
import { sanitizeBodyExcerpt } from "@/security/pii-sanitizer";

/**
 * Watcher status for orchestration decisions
 */
export type WatcherStatus = "created" | "active" | "paused" | "deleted";

/**
 * Parsed email structure (MR-BackendIngestion-1)
 *
 * Note: `sent_at` is when the email was originally sent (from Date header).
 * This is what matters for thread timeline and urgency calculations.
 * Vigil's ingestion time is tracked separately as `ingested_at` in events.
 */
export interface ParsedEmail {
    sender: string; // who forwarded/sent the email to Vigil
    original_sender: string; // original email sender (from forwarded content)
    recipients: string[]; // original recipients (to + cc, excluding Vigil ingestion address)
    subject: string;
    body_text: string;
    headers: Record<string, string>;
    message_id: string | null;
    sent_at: number; // when email was originally sent (from Date header)
}

/**
 * Ingestion context for orchestration
 */
export interface IngestionContext {
    watcher_id: string;
    watcher_status: WatcherStatus;
    policy: WatcherPolicy;
    reference_timestamp: number;
    reference_timezone: string;
}

/**
 * Ingestion result containing generated events
 */
export interface IngestionResult {
    success: boolean;
    message_received_event: VigilEvent | null;
    extraction_events: VigilEvent[];
    thread_event: VigilEvent | null;
    closure_event: VigilEvent | null;
    reminder_events: VigilEvent[]; // REMINDER_CREATED events for portable semantic obligations
    association_event: VigilEvent | null; // MESSAGE_THREAD_ASSOCIATED for soft association
    routing_event: VigilEvent | null; // MESSAGE_ROUTED for thread routing decision
    error?: string;
    skipped_reason?: string;
}

/**
 * Map urgency level to signal type
 */
function mapUrgencyLevelToSignalType(
    level: string
): "question" | "escalation" | "waiting" | "follow_up" {
    switch (level) {
        case "high":
            return "escalation";
        case "medium":
            return "follow_up";
        default:
            return "waiting";
    }
}

/**
 * Parse raw email into structured format (MR-BackendIngestion-1).
 * Simplified parser for common email formats.
 */
export function parseRawEmail(rawEmail: string): ParsedEmail {
    const lines = rawEmail.split("\n");
    const headers: Record<string, string> = {};
    let bodyStart = 0;

    // Parse headers (until empty line)
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line?.trim() ?? "";

        // Empty line marks end of headers
        if (trimmedLine === "") {
            bodyStart = i + 1;
            break;
        }

        const colonIndex = trimmedLine.indexOf(":");
        if (colonIndex > 0) {
            const key = trimmedLine.substring(0, colonIndex).toLowerCase();
            const value = trimmedLine.substring(colonIndex + 1).trim();
            headers[key] = value;
        }
    }

    // Extract body
    const bodyText = lines.slice(bodyStart).join("\n").trim();

    // Parse From header (who forwarded/sent the email to Vigil)
    const forwarder = extractEmailAddress(headers["from"] || "");

    // Check if this is a forwarded email
    const forwardedPattern = /---------- Forwarded message ---------\s*\nFrom:\s*([^\n]+)\nDate:\s*([^\n]+)\nSubject:\s*([^\n]+)\nTo:\s*([^\n]+)\n\n([\s\S]*)/i;
    const forwardedMatch = bodyText.match(forwardedPattern);
    
    let originalSender: string;
    let originalSubject: string;
    let originalBody: string;
    
    if (forwardedMatch && forwardedMatch[1] && forwardedMatch[3] && forwardedMatch[5]) {
        // This is a forwarded email - extract original details
        originalSender = extractEmailAddress(forwardedMatch[1]);
        originalSubject = forwardedMatch[3].replace(/^(Fwd:|Re:)\s*/i, '').trim();
        originalBody = forwardedMatch[5].trim();
    } else {
        // Not forwarded - use headers as-is
        originalSender = forwarder;
        originalSubject = headers["subject"] || "";
        originalBody = bodyText;
    }

    // Parse To header
    const to = (headers["to"] || "")
        .split(",")
        .map(extractEmailAddress)
        .filter(Boolean);

    // Parse CC header
    const cc = (headers["cc"] || "")
        .split(",")
        .map(extractEmailAddress)
        .filter(Boolean);

    // Parse Date header for sent_at (when email was originally sent)
    const dateHeader = headers["date"];
    const sent_at = dateHeader ? new Date(dateHeader).getTime() : Date.now();

    // Combine recipients, excluding Vigil ingestion addresses
    const allRecipients = [...to, ...cc].filter(
        (addr) => !addr.includes("@ingest.vigil")
    );

    return {
        sender: forwarder, // Who forwarded/sent to Vigil
        original_sender: originalSender, // Original email sender
        recipients: allRecipients,
        subject: originalSubject,
        body_text: originalBody,
        headers,
        message_id: headers["message-id"] || null,
        sent_at: isNaN(sent_at) ? Date.now() : sent_at,
    };
}

/**
 * Extract email address from header value.
 * Handles formats like "Name <email@example.com>" or just "email@example.com"
 */
function extractEmailAddress(headerValue: string): string {
    const match = headerValue.match(/<([^>]+)>/);
    if (match && match[1]) {
        return match[1].trim().toLowerCase();
    }
    return headerValue.trim().toLowerCase();
}

/**
 * Validate sender against policy allowlist (MR-BackendIngestion-2).
 * Empty allowlist means allow all.
 */
export function validateSenderAllowed(
    senderEmail: string,
    allowedSenders: string[]
): boolean {
    if (!senderEmail) {
        return false;
    }

    if (allowedSenders.length === 0) {
        return true;
    }

    const normalizedSender = senderEmail.toLowerCase().trim();

    for (const allowed of allowedSenders) {
        const normalizedAllowed = allowed.toLowerCase().trim();

        // Exact match
        if (normalizedSender === normalizedAllowed) {
            return true;
        }

        // Domain wildcard match (*@domain.com)
        if (normalizedAllowed.startsWith("*@")) {
            const domain = normalizedAllowed.substring(2);
            if (normalizedSender.endsWith("@" + domain)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Check if LLM extraction should be performed (MR-BackendIngestion-4).
 */
export function shouldRunExtraction(
    senderAllowed: boolean,
    watcherStatus: WatcherStatus
): boolean {
    // Don't extract if sender not allowed
    if (!senderAllowed) {
        return false;
    }

    // Only extract when watcher is active
    return watcherStatus === "active";
}

/**
 * Generate unique message ID for Vigil system (MR-BackendIngestion-3).
 * Uses email Message-ID header if present, otherwise generates from content.
 */
export function generateVigilMessageId(
    headerMessageId: string | null,
    from: string,
    subject: string,
    receivedAt: number
): string {
    if (headerMessageId && headerMessageId.trim()) {
        // Hash the Message-ID header
        const cleanId = headerMessageId.replace(/[<>]/g, "").trim();
        return `msgid-${hashString(cleanId).substring(0, 16)}`;
    }

    // Generate from content
    const content = `${from}|${subject}|${receivedAt}`;
    return `hash-${hashString(content).substring(0, 16)}`;
}

/**
 * Simple hash function for deduplication.
 * In production, use crypto.subtle.digest for SHA-256.
 */
function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    // Convert to hex and ensure positive
    return Math.abs(hash).toString(16).padStart(16, "0");
}

/**
 * Extraction result with routing metadata
 */
export interface ExtractionWithRouting {
    hardDeadline: ReturnType<typeof extractHardDeadline> | null;
    closure: ReturnType<typeof detectClosureSignal> | null;
    softDeadline: ReturnType<typeof extractSoftDeadlineSignal> | null;
    urgencySignal: ReturnType<typeof detectUrgencySignal> | null;
    routing: RoutingResponse;
}

/**
 * Orchestrate LLM extraction on email text (MR-BackendIngestion-4).
 *
 * Flow:
 * 1. Route email to determine which signals might be present
 * 2. Only run extractors for flagged signal types
 * 3. Validate results and return
 *
 * This saves compute by skipping extractors for unlikely signal types.
 */
export function orchestrateLLMExtraction(
    emailText: string,
    referenceTimestamp: number,
    referenceTimezone: string,
    senderEmail: string = "",
    subject: string = ""
): ExtractionWithRouting {
    // Default routing - extract nothing
    const emptyRouting: RoutingResponse = {
        extract_deadline: false,
        extract_soft_deadline: false,
        extract_urgency: false,
        extract_closure: false,
        reasoning: "Empty email text",
    };

    if (!emailText || emailText.trim().length === 0) {
        return {
            hardDeadline: null,
            closure: null,
            softDeadline: null,
            urgencySignal: null,
            routing: emptyRouting,
        };
    }

    // Step 1: Route email to determine which extractions to perform
    const routingRequest: RoutingRequest = {
        email_text: emailText,
        sender_email: senderEmail,
        subject: subject,
    };
    const routing = routeEmail(routingRequest);

    // Initialize results
    let validHardDeadline: ReturnType<typeof extractHardDeadline> | null = null;
    let validClosure: ReturnType<typeof detectClosureSignal> | null = null;
    let validSoftDeadline: ReturnType<typeof extractSoftDeadlineSignal> | null =
        null;
    let validUrgencySignal: ReturnType<typeof detectUrgencySignal> | null =
        null;

    // Step 2: Run only the extractors that routing flagged

    // Hard deadline extraction (if flagged)
    if (routing.extract_deadline) {
        const hardDeadline = extractHardDeadline({
            email_text: emailText,
            reference_timestamp: referenceTimestamp,
            reference_timezone: referenceTimezone,
        });

        // Validate source span (MR-LLMService-3)
        if (
            hardDeadline.deadline_found &&
            validateSourceSpan(emailText, hardDeadline.source_span)
        ) {
            validHardDeadline = hardDeadline;
        }
    }

    // Closure detection (if flagged)
    if (routing.extract_closure) {
        const closure = detectClosureSignal({
            email_text: emailText,
        });

        if (
            closure.closure_found &&
            validateSourceSpan(emailText, closure.source_span)
        ) {
            validClosure = closure;
        }
    }

    // Soft deadline extraction (if flagged)
    if (routing.extract_soft_deadline) {
        const softDeadline = extractSoftDeadlineSignal({
            email_text: emailText,
            reference_timestamp: referenceTimestamp,
        });

        if (
            softDeadline.signal_found &&
            validateSourceSpan(emailText, softDeadline.source_span)
        ) {
            validSoftDeadline = softDeadline;
        }
    }

    // Urgency signal detection (if flagged)
    if (routing.extract_urgency) {
        const urgencySignal = detectUrgencySignal({
            email_text: emailText,
        });

        // Urgency might have partial span, be lenient
        if (urgencySignal.urgency_found) {
            validUrgencySignal = urgencySignal;
        }
    }

    return {
        hardDeadline: validHardDeadline,
        closure: validClosure,
        softDeadline: validSoftDeadline,
        urgencySignal: validUrgencySignal,
        routing,
    };
}

/**
 * Result of extraction event creation with event ID references
 */
export interface ExtractionEventsResult {
    events: VigilEvent[];
    hardDeadlineEventId: string | null;
    softDeadlineEventId: string | null;
    urgencySignalEventId: string | null;
    closureSignalEventId: string | null;
}

/**
 * Create extraction events from LLM results.
 * Events are ordered: ROUTE_EXTRACTION_COMPLETE → detailed signals → EXTRACTION_COMPLETE
 * 
 * Returns event IDs for linking to threads and reminders.
 */
export function createExtractionEvents(
    watcherId: string,
    messageId: string,
    extraction: ReturnType<typeof orchestrateLLMExtraction>,
    timestamp: number,
    threadId?: string
): ExtractionEventsResult {
    const events: VigilEvent[] = [];
    let hardDeadlineEventId: string | null = null;
    let softDeadlineEventId: string | null = null;
    let urgencySignalEventId: string | null = null;
    let closureSignalEventId: string | null = null;

    // Step 1: Emit ROUTE_EXTRACTION_COMPLETE to show routing decision
    // Use routing data if available, otherwise derive from extraction results
    const routing = (extraction as any).routing ?? {
        extract_deadline: extraction.hardDeadline?.deadline_found ?? false,
        extract_soft_deadline: extraction.softDeadline?.signal_found ?? false,
        extract_urgency: extraction.urgencySignal?.urgency_found ?? false,
        extract_closure: extraction.closure?.closure_found ?? false,
        reasoning: "Derived from extraction results (legacy mode)",
    };
    
    events.push({
        event_id: crypto.randomUUID(),
        timestamp,
        watcher_id: watcherId,
        type: "ROUTE_EXTRACTION_COMPLETE",
        message_id: messageId,
        extract_deadline: routing.extract_deadline,
        extract_soft_deadline: routing.extract_soft_deadline,
        extract_urgency: routing.extract_urgency,
        extract_closure: routing.extract_closure,
        routing_reasoning: routing.reasoning,
    } as VigilEvent);

    // HARD_DEADLINE_OBSERVED
    if (extraction.hardDeadline && extraction.hardDeadline.deadline_found) {
        hardDeadlineEventId = crypto.randomUUID();
        events.push({
            event_id: hardDeadlineEventId,
            timestamp,
            watcher_id: watcherId,
            type: "HARD_DEADLINE_OBSERVED",
            message_id: messageId,
            deadline_utc: extraction.hardDeadline.deadline_utc!,
            deadline_text: extraction.hardDeadline.deadline_text,
            source_span: extraction.hardDeadline.source_span,
            confidence: extraction.hardDeadline.confidence,
            binding: extraction.hardDeadline.binding_language,
            extractor_version: extraction.hardDeadline.extractor_version,
        } as VigilEvent);
    }

    // SOFT_DEADLINE_SIGNAL_OBSERVED
    if (extraction.softDeadline && extraction.softDeadline.signal_found) {
        softDeadlineEventId = crypto.randomUUID();
        events.push({
            event_id: softDeadlineEventId,
            timestamp,
            watcher_id: watcherId,
            type: "SOFT_DEADLINE_SIGNAL_OBSERVED",
            message_id: messageId,
            signal_text: extraction.softDeadline.signal_text,
            source_span: extraction.softDeadline.source_span,
            estimated_horizon_hours:
                extraction.softDeadline.estimated_horizon_hours,
            confidence: extraction.softDeadline.confidence,
            binding: false,
            extractor_version: extraction.softDeadline.extractor_version,
        } as VigilEvent);
    }

    // URGENCY_SIGNAL_OBSERVED
    if (extraction.urgencySignal && extraction.urgencySignal.urgency_found) {
        urgencySignalEventId = crypto.randomUUID();
        // Map urgency_level to signal_type
        const signalType = mapUrgencyLevelToSignalType(
            extraction.urgencySignal.urgency_level
        );
        events.push({
            event_id: urgencySignalEventId,
            timestamp,
            watcher_id: watcherId,
            type: "URGENCY_SIGNAL_OBSERVED",
            message_id: messageId,
            signal_type: signalType,
            signal_text: extraction.urgencySignal.indicators.join("; "),
            source_span: extraction.urgencySignal.source_span,
            confidence:
                extraction.urgencySignal.urgency_level === "high"
                    ? "high"
                    : "medium",
            binding: false,
            extractor_version: extraction.urgencySignal.extractor_version,
        } as VigilEvent);
    }

    // CLOSURE_SIGNAL_OBSERVED
    if (extraction.closure && extraction.closure.closure_found) {
        closureSignalEventId = crypto.randomUUID();
        events.push({
            event_id: closureSignalEventId,
            timestamp,
            watcher_id: watcherId,
            type: "CLOSURE_SIGNAL_OBSERVED",
            message_id: messageId,
            closure_type: extraction.closure.closure_type,
            source_span: extraction.closure.source_span,
            confidence: extraction.closure.confidence,
            extractor_version: extraction.closure.extractor_version,
        } as VigilEvent);
    }

    // Step 2: Emit EXTRACTION_COMPLETE summary (excludes ROUTE event itself)
    const signalsCount = events.length - 1; // -1 to exclude ROUTE_EXTRACTION_COMPLETE
    events.push({
        event_id: crypto.randomUUID(),
        timestamp,
        watcher_id: watcherId,
        type: "EXTRACTION_COMPLETE",
        message_id: messageId,
        thread_id: threadId,
        hard_deadline_found: !!(extraction.hardDeadline?.deadline_found),
        soft_deadline_found: !!(extraction.softDeadline?.signal_found),
        urgency_signal_found: !!(extraction.urgencySignal?.urgency_found),
        closure_signal_found: !!(extraction.closure?.closure_found),
        signals_count: signalsCount,
    } as VigilEvent);

    return {
        events,
        hardDeadlineEventId,
        softDeadlineEventId,
        urgencySignalEventId,
        closureSignalEventId,
    };
}

/**
 * Full ingestion orchestration pipeline (MR-BackendIngestion-4).
 * Coordinates parsing, validation, deduplication, extraction, and thread detection.
 */
export async function orchestrateIngestion(
    rawEmail: string,
    context: IngestionContext,
    checkDuplicate: (messageId: string) => Promise<boolean>,
    getExistingThreads?: () => Promise<{
        threads: Map<string, any>;
        messageIdMap: Map<string, string>;
    }>
): Promise<IngestionResult> {
    const now = Date.now();

    // Step 1: Parse email (MR-BackendIngestion-1)
    let parsed: ParsedEmail;
    try {
        parsed = parseRawEmail(rawEmail);
    } catch (error) {
        return {
            success: false,
            message_received_event: null,
            extraction_events: [],
            thread_event: null,
            closure_event: null,
            reminder_events: [],
            association_event: null,
            routing_event: null,
            error: "PARSE_ERROR",
        };
    }

    // Validate required fields
    if (!parsed.sender) {
        return {
            success: false,
            message_received_event: null,
            extraction_events: [],
            thread_event: null,
            closure_event: null,
            reminder_events: [],
            association_event: null,
            routing_event: null,
            error: "MISSING_REQUIRED_HEADER",
        };
    }

    // Step 2: Validate sender (MR-BackendIngestion-2)
    // Note: We validate the FORWARDER (who sent to Vigil), not the original email sender
    const senderAllowed = validateSenderAllowed(parsed.sender, [
        ...context.policy.allowed_senders,
    ]);

    // Step 3: Generate message ID and check duplicates (MR-BackendIngestion-3)
    const vigilMessageId = generateVigilMessageId(
        parsed.message_id,
        parsed.original_sender, // Use original sender for message ID
        parsed.subject,
        parsed.sent_at
    );

    const isDuplicate = await checkDuplicate(vigilMessageId);
    if (isDuplicate) {
        return {
            success: false,
            message_received_event: null,
            extraction_events: [],
            thread_event: null,
            closure_event: null,
            reminder_events: [],
            association_event: null,
            routing_event: null,
            skipped_reason: "DUPLICATE_MESSAGE",
        };
    }

    // Step 4: Create MESSAGE_RECEIVED event
    // Note: ingested_at = now (when Vigil saw it), sent_at = when email was originally sent
    // IMPORTANT: We never store raw email body. Only a sanitized excerpt for context.
    const sanitizedExcerpt = sanitizeBodyExcerpt(parsed.body_text, 500);
    
    const messageReceivedEvent: VigilEvent = {
        event_id: crypto.randomUUID(),
        timestamp: now,
        watcher_id: context.watcher_id,
        type: "MESSAGE_RECEIVED",
        message_id: vigilMessageId,
        sender: parsed.sender, // Who forwarded to Vigil
        original_sender: parsed.original_sender, // Original email sender
        recipients: parsed.recipients,
        subject: parsed.subject,
        normalized_subject: normalizeSubject(parsed.subject),
        sent_at: parsed.sent_at, // when email was originally sent (from Date header)
        ingested_at: now, // when Vigil received it (for audit)
        body_text_extract: sanitizedExcerpt.sanitized_text, // PII/secrets removed
        raw_body_stored: false, // We NEVER store raw body
        pii_detected: sanitizedExcerpt.was_sanitized,
        pii_types_redacted: sanitizedExcerpt.pii_types_found,
        secrets_redacted: sanitizedExcerpt.secret_types_found,
        headers: {
            "message-id": parsed.message_id || "",
            "in-reply-to": parsed.headers["in-reply-to"] || "",
            references: parsed.headers["references"] || "",
            "conversation-index": parsed.headers["conversation-index"] || "",
        },
    } as VigilEvent;

    // Step 5: Route and extract signals (MR-BackendIngestion-4)
    // First routes email to determine signal types, then extracts only relevant signals
    let extractionResult: ExtractionEventsResult | null = null;
    let extraction: ReturnType<typeof orchestrateLLMExtraction> | null = null;

    if (shouldRunExtraction(senderAllowed, context.watcher_status)) {
        extraction = orchestrateLLMExtraction(
            parsed.body_text,
            context.reference_timestamp,
            context.reference_timezone,
            parsed.original_sender, // Use original sender for extraction context
            parsed.subject
        );

        // Note: threadId will be added after thread is determined
        extractionResult = createExtractionEvents(
            context.watcher_id,
            vigilMessageId,
            extraction,
            now,
            undefined // threadId added later if thread created
        );
    }

    const extractionEvents = extractionResult?.events ?? [];

    // Step 6: Thread detection and THREAD_OPENED/THREAD_ACTIVITY_OBSERVED event
    let threadEvent: VigilEvent | null = null;
    let routingEvent: VigilEvent | null = null;
    let associationEvent: VigilEvent | null = null;
    const reminderEvents: VigilEvent[] = [];

    // Only create threads for allowed senders when watcher is active
    if (
        senderAllowed &&
        context.watcher_status === "active" &&
        getExistingThreads
    ) {
        const { threads, messageIdMap } = await getExistingThreads();

        // Import thread detection after checking conditions
        const { findMatchingThread } =
            await import("@/watcher/thread-detection");

        const threadingContext = {
            messageId: vigilMessageId,
            from: parsed.original_sender, // Use original sender for thread detection
            subject: parsed.subject,
            headers: {
                "in-reply-to": parsed.headers["in-reply-to"] || "",
                references: parsed.headers["references"] || "",
                "conversation-index":
                    parsed.headers["conversation-index"] || "",
            },
        };

        const match = findMatchingThread(
            threadingContext,
            threads,
            messageIdMap
        );

        if (match) {
            // Message belongs to existing thread
            const threadId = match.threadId;

            // Emit MESSAGE_ROUTED event to capture routing decision
            routingEvent = {
                event_id: crypto.randomUUID(),
                timestamp: now,
                watcher_id: context.watcher_id,
                type: "MESSAGE_ROUTED",
                message_id: vigilMessageId,
                routed_to_thread_id: threadId,
                evidence: `Matched via ${match.matchType}`,
                confidence: match.confidence,
            } as VigilEvent;

            // Generate THREAD_ACTIVITY_OBSERVED
            threadEvent = {
                event_id: crypto.randomUUID(),
                timestamp: now,
                watcher_id: context.watcher_id,
                type: "THREAD_ACTIVITY_OBSERVED",
                thread_id: threadId,
                message_id: vigilMessageId,
                activity_at: parsed.sent_at,
                sender: parsed.original_sender, // Original email sender
            } as VigilEvent;

            // Emit MESSAGE_THREAD_ASSOCIATED for soft association model
            associationEvent = {
                event_id: crypto.randomUUID(),
                timestamp: now,
                watcher_id: context.watcher_id,
                type: "MESSAGE_THREAD_ASSOCIATED",
                message_id: vigilMessageId,
                thread_id: threadId,
                association_status: "active",
                associated_by: "system",
                associated_at: now,
            } as VigilEvent;
        } else {
            // No matching thread - only create new thread if there are actionable extraction events
            // Per SDD: "Thread creation is driven by extraction events, not by explicit user intent"
            const hasHardDeadline = extractionResult?.hardDeadlineEventId !== null;
            const hasSoftDeadline = extractionResult?.softDeadlineEventId !== null;
            const hasUrgencySignal = extractionResult?.urgencySignalEventId !== null;

            // Only create thread if there's a deadline or urgency signal
            // CLOSURE_SIGNAL alone doesn't create threads (it closes existing ones)
            if (hasHardDeadline || hasSoftDeadline || hasUrgencySignal) {
                const threadId = `thr-${crypto.randomUUID().substring(0, 8)}`;

                // Determine trigger type from extraction results (priority order)
                let triggerType:
                    | "hard_deadline"
                    | "soft_deadline"
                    | "urgency_signal" = "urgency_signal";
                if (hasHardDeadline) {
                    triggerType = "hard_deadline";
                } else if (hasSoftDeadline) {
                    triggerType = "soft_deadline";
                }

                // Emit MESSAGE_ROUTED for new thread creation
                routingEvent = {
                    event_id: crypto.randomUUID(),
                    timestamp: now,
                    watcher_id: context.watcher_id,
                    type: "MESSAGE_ROUTED",
                    message_id: vigilMessageId,
                    routed_to_thread_id: null, // null indicates new thread
                    evidence: `New thread created for ${triggerType}`,
                    confidence: "high",
                } as VigilEvent;

                // Create THREAD_OPENED with extraction event references (DC-1)
                threadEvent = {
                    event_id: crypto.randomUUID(),
                    timestamp: now,
                    watcher_id: context.watcher_id,
                    type: "THREAD_OPENED",
                    thread_id: threadId,
                    message_id: vigilMessageId,
                    opened_at: parsed.sent_at, // Use when email was originally sent
                    trigger_type: triggerType,
                    normalized_subject: normalizeSubject(parsed.subject),
                    original_sender: parsed.original_sender, // Original email sender
                    original_sent_at: parsed.sent_at,
                    // Link extraction events for deadline resolution (DC-1)
                    hard_deadline_event_id: extractionResult?.hardDeadlineEventId,
                    soft_deadline_event_id: extractionResult?.softDeadlineEventId,
                    urgency_signal_event_id: extractionResult?.urgencySignalEventId,
                } as VigilEvent;

                // Emit MESSAGE_THREAD_ASSOCIATED for soft association model
                associationEvent = {
                    event_id: crypto.randomUUID(),
                    timestamp: now,
                    watcher_id: context.watcher_id,
                    type: "MESSAGE_THREAD_ASSOCIATED",
                    message_id: vigilMessageId,
                    thread_id: threadId,
                    association_status: "active",
                    associated_by: "system",
                    associated_at: now,
                } as VigilEvent;

                // Create REMINDER_CREATED events for each actionable extraction
                // Per SDD: Reminders are portable semantic obligations
                if (hasHardDeadline && extractionResult?.hardDeadlineEventId && extraction?.hardDeadline) {
                    const reminderId = `rem-${crypto.randomUUID().substring(0, 8)}`;
                    reminderEvents.push({
                        event_id: crypto.randomUUID(),
                        timestamp: now,
                        watcher_id: context.watcher_id,
                        type: "REMINDER_CREATED",
                        reminder_id: reminderId,
                        thread_id: threadId,
                        extraction_event_id: extractionResult.hardDeadlineEventId,
                        reminder_type: "hard_deadline",
                        deadline_utc: extraction.hardDeadline.deadline_utc,
                        source_span: extraction.hardDeadline.source_span,
                        confidence: extraction.hardDeadline.confidence,
                        status: "active",
                        created_at: now,
                    } as VigilEvent);
                }

                if (hasSoftDeadline && extractionResult?.softDeadlineEventId && extraction?.softDeadline) {
                    const reminderId = `rem-${crypto.randomUUID().substring(0, 8)}`;
                    // Calculate deadline from estimated horizon
                    const horizonHours = extraction.softDeadline.estimated_horizon_hours;
                    const estimatedDeadline = horizonHours ? now + horizonHours * 60 * 60 * 1000 : null;
                    reminderEvents.push({
                        event_id: crypto.randomUUID(),
                        timestamp: now,
                        watcher_id: context.watcher_id,
                        type: "REMINDER_CREATED",
                        reminder_id: reminderId,
                        thread_id: threadId,
                        extraction_event_id: extractionResult.softDeadlineEventId,
                        reminder_type: "soft_deadline",
                        deadline_utc: estimatedDeadline,
                        source_span: extraction.softDeadline.source_span,
                        confidence: extraction.softDeadline.confidence,
                        status: "active",
                        created_at: now,
                    } as VigilEvent);
                }

                if (hasUrgencySignal && extractionResult?.urgencySignalEventId && extraction?.urgencySignal) {
                    const reminderId = `rem-${crypto.randomUUID().substring(0, 8)}`;
                    reminderEvents.push({
                        event_id: crypto.randomUUID(),
                        timestamp: now,
                        watcher_id: context.watcher_id,
                        type: "REMINDER_CREATED",
                        reminder_id: reminderId,
                        thread_id: threadId,
                        extraction_event_id: extractionResult.urgencySignalEventId,
                        reminder_type: "urgency_signal",
                        deadline_utc: null, // Urgency signals don't have explicit deadlines
                        source_span: extraction.urgencySignal.source_span,
                        confidence: extraction.urgencySignal.urgency_level === "high" ? "high" : "medium",
                        status: "active",
                        created_at: now,
                    } as VigilEvent);
                }
            }
            // If no actionable signals, threadEvent remains null - email is received but no thread created
        }
    }

    // Step 7: If closure signal detected and message matched an existing thread, close it
    let closureEvent: VigilEvent | null = null;
    const hasClosureSignal = extractionResult?.closureSignalEventId !== null;

    if (hasClosureSignal && threadEvent?.type === "THREAD_ACTIVITY_OBSERVED") {
        closureEvent = {
            event_id: crypto.randomUUID(),
            timestamp: now,
            watcher_id: context.watcher_id,
            type: "THREAD_CLOSED",
            thread_id: threadEvent.thread_id,
            closed_at: now,
            closed_by: "message_evidence",
            closure_event_id: extractionResult?.closureSignalEventId || "",
            closure_reason: "Closure signal detected in message",
        } as VigilEvent;
    }

    return {
        success: true,
        message_received_event: messageReceivedEvent,
        extraction_events: extractionEvents,
        thread_event: threadEvent,
        closure_event: closureEvent,
        reminder_events: reminderEvents,
        association_event: associationEvent,
        routing_event: routingEvent,
    };
}
