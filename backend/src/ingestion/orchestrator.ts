/**
 * Email Ingestion Orchestrator
 *
 * Handles inbound email processing pipeline:
 * 1. Validate sender
 * 2. Emit EMAIL_RECEIVED
 * 3. Extract action request (if allowed)
 * 4. Create/update thread
 */

import type {
    EmailReceivedEvent,
    ActionRequestObservedEvent,
    ThreadOpenedEvent,
    ThreadEmailAddedEvent,
    VigilEvent,
} from "../events/types";
import { getEventStore } from "../events/store";
import { replayEvents, type WatcherState } from "../watcher/runtime";
import {
    findMatchingThread,
    buildMessageIdMap,
    normalizeSubject,
} from "../watcher/thread-detection";
import {
    extractActionRequest,
    getExtractorVersion,
} from "../llm/action-request-extractor";
import { logger } from "../logger";

// ============================================================================
// Types
// ============================================================================

export interface IngestEmailInput {
    watcherId: string;
    messageId: string;
    from: string;
    subject: string;
    body: string;
    headers: Record<string, string>;
    receivedAt: number;
}

export interface IngestEmailResult {
    success: boolean;
    emittedEvents: VigilEvent[];
    threadId: string | null;
    actionRequestDetected: boolean;
    senderAllowed: boolean;
}

// ============================================================================
// Orchestrator
// ============================================================================

export async function ingestEmail(
    input: IngestEmailInput
): Promise<IngestEmailResult> {
    const eventStore = getEventStore();
    const emittedEvents: VigilEvent[] = [];
    const now = Date.now();

    // Load watcher state
    const events = await eventStore.getEventsForWatcher(input.watcherId);
    const state = replayEvents(events);

    if (state.status === "deleted") {
        logger.warn("Attempted to ingest email for deleted watcher", {
            watcherId: input.watcherId,
        });
        return {
            success: false,
            emittedEvents: [],
            threadId: null,
            actionRequestDetected: false,
            senderAllowed: false,
        };
    }

    // Check sender allowlist
    const senderAllowed = isSenderAllowed(state, input.from);

    // Always emit EMAIL_RECEIVED
    const emailReceivedEvent: EmailReceivedEvent = {
        event_id: crypto.randomUUID(),
        timestamp: now,
        watcher_id: input.watcherId,
        type: "EMAIL_RECEIVED",
        message_id: input.messageId,
        from: input.from,
        subject: input.subject,
        received_at: input.receivedAt,
        sender_allowed: senderAllowed,
        headers: input.headers,
    };
    emittedEvents.push(emailReceivedEvent);

    if (!senderAllowed) {
        await eventStore.appendBatch(emittedEvents);
        return {
            success: true,
            emittedEvents,
            threadId: null,
            actionRequestDetected: false,
            senderAllowed: false,
        };
    }

    // Extract action request (only if watcher is active)
    let actionRequestDetected = false;
    let actionRequestEventId: string | null = null;

    if (state.status === "active") {
        const extractionResult = await extractActionRequest({
            email_text: input.body,
            from: input.from,
            subject: input.subject,
        });

        if (extractionResult.contains_action_request) {
            actionRequestDetected = true;
            const actionEvent: ActionRequestObservedEvent = {
                event_id: crypto.randomUUID(),
                timestamp: now,
                watcher_id: input.watcherId,
                type: "ACTION_REQUEST_OBSERVED",
                message_id: input.messageId,
                action_summary: extractionResult.action_summary ?? "",
                request_type: extractionResult.request_type,
                source_span: extractionResult.source_span,
                confidence: extractionResult.confidence,
                extractor_version: getExtractorVersion(),
            };
            emittedEvents.push(actionEvent);
            actionRequestEventId = actionEvent.event_id;
        }
    }

    // Thread management
    let threadId: string | null = null;

    if (actionRequestDetected && actionRequestEventId) {
        // Try to find existing thread
        const messageIdMap = buildMessageIdMap(state.threads);
        const match = findMatchingThread(
            {
                messageId: input.messageId,
                from: input.from,
                subject: input.subject,
                headers: input.headers,
            },
            state.threads,
            messageIdMap
        );

        if (match) {
            // Add to existing thread
            threadId = match.threadId;
            const threadEmailEvent: ThreadEmailAddedEvent = {
                event_id: crypto.randomUUID(),
                timestamp: now,
                watcher_id: input.watcherId,
                type: "THREAD_EMAIL_ADDED",
                thread_id: threadId,
                message_id: input.messageId,
                sender: input.from,
                added_at: now,
            };
            emittedEvents.push(threadEmailEvent);
        } else {
            // Create new thread
            threadId = crypto.randomUUID();
            const threadOpenedEvent: ThreadOpenedEvent = {
                event_id: crypto.randomUUID(),
                timestamp: now,
                watcher_id: input.watcherId,
                type: "THREAD_OPENED",
                thread_id: threadId,
                message_id: input.messageId,
                opened_at: now,
                normalized_subject: normalizeSubject(input.subject),
                original_sender: input.from,
                action_request_event_id: actionRequestEventId,
            };
            emittedEvents.push(threadOpenedEvent);
        }
    }

    // Persist all events
    await eventStore.appendBatch(emittedEvents);

    return {
        success: true,
        emittedEvents,
        threadId,
        actionRequestDetected,
        senderAllowed,
    };
}

// ============================================================================
// Helpers
// ============================================================================

function isSenderAllowed(state: WatcherState, sender: string): boolean {
    if (!state.policy) {
        return false;
    }

    const allowedSenders = state.policy.allowed_senders;
    if (allowedSenders.length === 0) {
        return true; // Empty list = allow all
    }

    const normalizedSender = sender.toLowerCase();
    return allowedSenders.some(
        (allowed) => allowed.toLowerCase() === normalizedSender
    );
}
