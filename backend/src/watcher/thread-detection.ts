/**
 * Thread Detection and Grouping
 *
 * Implements thread grouping algorithm per SDD FR-8.
 * Priority order: Message-ID chain > Conversation-Index > Subject+Participants
 */

import type { ThreadState } from "../watcher/runtime";
import {
    normalizeSubject,
    extractThreadingHeaders,
} from "../ingestion/validator";

export type ThreadingContext = {
    readonly messageId: string;
    readonly from: string;
    readonly subject: string;
    readonly headers: Record<string, string>;
};

export type ThreadMatch = {
    readonly threadId: string;
    readonly matchType:
        | "message_id"
        | "conversation_index"
        | "subject_participants";
    readonly confidence: "high" | "medium" | "low";
};

/**
 * Determine which thread a message belongs to.
 * Per SDD Thread Grouping Algorithm:
 * 1. Message-ID chaining (highest priority)
 * 2. Conversation-Index header
 * 3. Subject + participant overlap
 *
 * @param message - Threading context from incoming message
 * @param existingThreads - Map of existing threads
 * @param messageIdToThreadId - Map of message IDs to thread IDs
 * @returns Thread match or null if no match
 */
export function findMatchingThread(
    message: ThreadingContext,
    existingThreads: ReadonlyMap<string, ThreadState>,
    messageIdToThreadId: ReadonlyMap<string, string>
): ThreadMatch | null {
    const threadingHeaders = extractThreadingHeaders(message.headers);

    // Priority 1: Message-ID chain (In-Reply-To or References)
    if (threadingHeaders.inReplyTo) {
        const cleanId = cleanMessageId(threadingHeaders.inReplyTo);
        const threadId = messageIdToThreadId.get(cleanId);
        if (threadId) {
            const thread = existingThreads.get(threadId);
            // Only match if thread is open (closed threads are terminal)
            if (thread && thread.status === "open") {
                return {
                    threadId,
                    matchType: "message_id",
                    confidence: "high",
                };
            }
        }
    }

    // Check References header
    for (const ref of threadingHeaders.references) {
        const cleanId = cleanMessageId(ref);
        const threadId = messageIdToThreadId.get(cleanId);
        if (threadId) {
            const thread = existingThreads.get(threadId);
            if (thread && thread.status === "open") {
                return {
                    threadId,
                    matchType: "message_id",
                    confidence: "high",
                };
            }
        }
    }

    // Priority 2: Conversation-Index (Microsoft Outlook)
    if (threadingHeaders.conversationIndex) {
        // Extract base index for potential future conversation tracking
        extractConversationBase(threadingHeaders.conversationIndex);
        for (const [_threadId, thread] of existingThreads) {
            if (thread.status !== "open") continue;
            // Check if any message in thread has matching conversation index base
            // This would require additional data structure tracking conversation indices
            // For now, skip this check if we don't have conversation index mapping
        }
    }

    // Priority 3: Subject + Participant overlap
    // Note: We match on original conversation participants (sender/recipients),
    // not the Vigil user who forwarded the email
    const normalizedSubject = normalizeSubject(message.subject);

    // Don't match on generic subjects alone
    if (isGenericSubject(normalizedSubject)) {
        return null;
    }

    for (const [threadId, thread] of existingThreads) {
        if (thread.status !== "open") continue;

        // Check subject match
        if (thread.normalized_subject === normalizedSubject) {
            // Check if the message sender is a participant in the original conversation
            if (hasParticipantOverlap(message.from, thread.participants)) {
                return {
                    threadId,
                    matchType: "subject_participants",
                    confidence: "medium",
                };
            }
        }
    }

    return null;
}

/**
 * Clean message ID by removing angle brackets.
 */
function cleanMessageId(messageId: string): string {
    return messageId.replace(/^<|>$/g, "").trim();
}

/**
 * Extract base conversation index (first 22 characters for Outlook).
 */
function extractConversationBase(conversationIndex: string): string {
    // Conversation-Index is base64 encoded, first 22 chars identify the conversation
    return conversationIndex.substring(0, 22);
}

/**
 * Check if subject is too generic for thread matching.
 */
export function isGenericSubject(normalizedSubject: string): boolean {
    const genericSubjects = new Set([
        "question",
        "update",
        "fyi",
        "info",
        "hi",
        "hello",
        "hey",
        "thanks",
        "thank you",
        "request",
        "help",
        "issue",
        "problem",
        "urgent",
        "(no subject)",
        "",
    ]);
    return genericSubjects.has(normalizedSubject);
}

/**
 * Check if sender is a participant in the thread.
 */
function hasParticipantOverlap(
    sender: string,
    participants: readonly string[]
): boolean {
    const normalizedSender = sender.toLowerCase().trim();
    return participants.some(
        (p) => p.toLowerCase().trim() === normalizedSender
    );
}

/**
 * Build message ID to thread ID mapping from threads.
 * Cleans message IDs (removes angle brackets) for consistent lookup.
 */
export function buildMessageIdMap(
    threads: ReadonlyMap<string, ThreadState>
): Map<string, string> {
    const map = new Map<string, string>();
    for (const [threadId, thread] of threads) {
        for (const messageId of thread.message_ids) {
            // Clean the message ID (remove angle brackets) for consistent lookup
            const cleanId = messageId.replace(/^<|>$/g, "").trim();
            map.set(cleanId, threadId);
        }
    }
    return map;
}

/**
 * Check if message should create a new thread (matches closed thread).
 */
export function matchesClosedThread(
    message: ThreadingContext,
    existingThreads: ReadonlyMap<string, ThreadState>,
    messageIdToThreadId: ReadonlyMap<string, string>
): boolean {
    const threadingHeaders = extractThreadingHeaders(message.headers);

    // Check if references point to closed thread
    if (threadingHeaders.inReplyTo) {
        const cleanId = cleanMessageId(threadingHeaders.inReplyTo);
        const threadId = messageIdToThreadId.get(cleanId);
        if (threadId) {
            const thread = existingThreads.get(threadId);
            if (thread && thread.status === "closed") {
                return true;
            }
        }
    }

    return false;
}
