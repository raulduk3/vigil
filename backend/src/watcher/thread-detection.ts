/**
 * Thread Detection and Grouping
 *
 * Implements thread grouping algorithm.
 * Priority: Message-ID chain > Conversation-Index > Subject+Participants
 */

// ============================================================================
// Types (standalone — no runtime dependency)
// ============================================================================

export interface ThreadState {
    readonly status: "open" | "closed";
    readonly participants: string[];
    readonly normalized_subject: string;
    readonly message_ids: string[];
}

export interface ThreadingContext {
    readonly messageId: string;
    readonly from: string;
    readonly subject: string;
    readonly headers: Record<string, string>;
}

export interface ThreadMatch {
    readonly threadId: string;
    readonly matchType:
        | "message_id"
        | "conversation_index"
        | "subject_participants";
    readonly confidence: "high" | "medium" | "low";
}

// ============================================================================
// Subject Normalization
// ============================================================================

/**
 * Normalize subject for comparison.
 * Removes Re:, Fwd:, etc. and normalizes whitespace.
 */
export function normalizeSubject(subject: string): string {
    return subject
        .replace(/^(re|fw|fwd|aw|wg|sv|vs):\s*/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

/**
 * Check if a subject is too generic for matching.
 */
export function isGenericSubject(normalizedSubject: string): boolean {
    const generic = [
        "",
        "hello",
        "hi",
        "hey",
        "question",
        "request",
        "follow up",
        "following up",
        "checking in",
        "quick question",
        "update",
        "urgent",
        "important",
        "fyi",
        "info",
        "information",
    ];
    return generic.includes(normalizedSubject);
}

// ============================================================================
// Header Extraction
// ============================================================================

export interface ThreadingHeaders {
    inReplyTo: string | null;
    references: string[];
    conversationIndex: string | null;
    messageId: string | null;
}

export function extractThreadingHeaders(
    headers: Record<string, string>
): ThreadingHeaders {
    const get = (name: string): string | null => {
        const key = Object.keys(headers).find(
            (k) => k.toLowerCase() === name.toLowerCase()
        );
        return key ? (headers[key] ?? null) : null;
    };

    const references = get("references");
    const refList = references
        ? references.split(/\s+/).filter((r) => r.length > 0)
        : [];

    return {
        inReplyTo: get("in-reply-to"),
        references: refList,
        conversationIndex:
            get("x-ms-exchange-organization-conversationindex") ??
            get("thread-index"),
        messageId: get("message-id"),
    };
}

function cleanMessageId(id: string): string {
    return id.replace(/^<|>$/g, "").trim();
}

// ============================================================================
// Thread Matching
// ============================================================================

/**
 * Find matching thread for a message.
 */
export function findMatchingThread(
    context: ThreadingContext,
    existingThreads: ReadonlyMap<string, ThreadState>,
    messageIdToThreadId: ReadonlyMap<string, string>
): ThreadMatch | null {
    const threadingHeaders = extractThreadingHeaders(context.headers);

    // Priority 1: In-Reply-To header
    if (threadingHeaders.inReplyTo) {
        const cleanId = cleanMessageId(threadingHeaders.inReplyTo);
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

    // Priority 2: References header
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

    // Priority 3: Subject + participant matching
    const normalizedSubject = normalizeSubject(context.subject);

    if (isGenericSubject(normalizedSubject)) {
        return null;
    }

    for (const [threadId, thread] of existingThreads) {
        if (thread.status !== "open") continue;

        if (thread.normalized_subject !== normalizedSubject) continue;

        const hasOverlap = thread.participants.some(
            (p) => p.toLowerCase() === context.from.toLowerCase()
        );

        if (hasOverlap) {
            return {
                threadId,
                matchType: "subject_participants",
                confidence: "medium",
            };
        }
    }

    return null;
}

// ============================================================================
// Thread ID Map Builder
// ============================================================================

/**
 * Build a map of message IDs to thread IDs from existing threads.
 */
export function buildMessageIdMap(
    threads: ReadonlyMap<string, ThreadState>
): Map<string, string> {
    const map = new Map<string, string>();

    for (const [threadId, thread] of threads) {
        for (const messageId of thread.message_ids) {
            map.set(messageId, threadId);
        }
    }

    return map;
}
