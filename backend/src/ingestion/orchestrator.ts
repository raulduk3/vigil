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
    originalDate?: number; // original Date header timestamp (when sender sent it)
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
