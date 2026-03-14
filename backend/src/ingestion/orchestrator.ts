/**
 * Email Ingestion Orchestrator — V2
 *
 * Receives parsed email from the ingestion handler.
 * Finds the watcher, then calls invokeAgent.
 * Thread detection and state management happen inside the engine.
 */

import { queryOne } from "../db/client";
import { invokeAgent } from "../agent/engine";
import { logger } from "../logger";
import type { WatcherRow } from "../agent/schema";
import { tryExtractConfirmCode } from "../api/handlers/forwarding";

// ============================================================================
// Types
// ============================================================================

export interface IngestEmailInput {
    watcherId: string;
    messageId: string;
    from: string;
    to: string;
    subject: string;
    body: string;
    headers: Record<string, string>;
    inReplyTo?: string;
    receivedAt: number;
    originalFrom?: string;
    originalDate?: number;
    recipientReceivedAt?: string; // when the original recipient's mail server accepted it
}

export interface IngestEmailResult {
    success: boolean;
    watcherFound: boolean;
    agentInvoked: boolean;
}

// ============================================================================
// Orchestrator
// ============================================================================

export async function ingestEmail(
    input: IngestEmailInput
): Promise<IngestEmailResult> {
    // Verify watcher exists and is active
    const watcher = queryOne<WatcherRow>(
        `SELECT * FROM watchers WHERE id = ? AND status = 'active'`,
        [input.watcherId]
    );

    if (!watcher) {
        logger.warn("ingestEmail: watcher not found or inactive", {
            watcherId: input.watcherId,
        });
        return { success: false, watcherFound: false, agentInvoked: false };
    }

    // Check for Gmail forwarding confirmation emails
    const isConfirmation = tryExtractConfirmCode(
        input.watcherId,
        input.from,
        input.subject,
        input.body
    );
    if (isConfirmation) {
        logger.info("Gmail forwarding confirmation code captured", {
            watcherId: input.watcherId,
        });
        return { success: true, watcherFound: true, agentInvoked: false };
    }

    // Invoke agent with email trigger
    try {
        await invokeAgent(watcher.id, {
            type: "email_received",
            email: {
                messageId: input.messageId,
                from: input.from,
                to: input.to,
                subject: input.subject,
                body: input.body,
                headers: input.headers,
                receivedAt: input.receivedAt,
                originalFrom: input.originalFrom,
                originalDate: input.originalDate,
                recipientReceivedAt: input.recipientReceivedAt,
            },
        });

        return { success: true, watcherFound: true, agentInvoked: true };
    } catch (err) {
        logger.error("Agent invocation failed during ingestion", {
            watcherId: input.watcherId,
            err,
        });
        return { success: false, watcherFound: true, agentInvoked: false };
    }
}
