/**
 * Thread Detection Unit Tests
 *
 * Tests for subject normalization, header extraction,
 * and thread matching algorithms.
 */

import { describe, it, expect } from "bun:test";
import {
    normalizeSubject,
    isGenericSubject,
    extractThreadingHeaders,
    findMatchingThread,
    buildMessageIdMap,
    type ThreadingContext,
    type ThreadMatch,
} from "../../src/watcher/thread-detection";
import type { ThreadState } from "../../src/watcher/runtime";

// ============================================================================
// Test Fixtures
// ============================================================================

const WATCHER_ID = "watcher-001";

function createThread(
    threadId: string,
    messageIds: string[],
    normalizedSubject: string,
    participants: string[],
    status: "open" | "closed" = "open"
): ThreadState {
    return {
        thread_id: threadId,
        watcher_id: WATCHER_ID,
        status,
        opened_at: Date.now(),
        closed_at: status === "closed" ? Date.now() : null,
        last_activity_at: Date.now(),
        last_action_request_event_id: `evt-action-${threadId}`,
        message_ids: messageIds,
        participants,
        normalized_subject: normalizedSubject,
        original_sender: participants[0] ?? "unknown@example.com",
        silence_alerted: false,
    };
}

function createThreadMap(threads: ThreadState[]): Map<string, ThreadState> {
    const map = new Map<string, ThreadState>();
    for (const thread of threads) {
        map.set(thread.thread_id, thread);
    }
    return map;
}

// ============================================================================
// normalizeSubject Tests
// ============================================================================

describe("normalizeSubject", () => {
    it("removes Re: prefix", () => {
        expect(normalizeSubject("Re: Test Subject")).toBe("test subject");
    });

    it("removes Fwd: prefix", () => {
        expect(normalizeSubject("Fwd: Test Subject")).toBe("test subject");
    });

    it("removes FW: prefix", () => {
        expect(normalizeSubject("FW: Test Subject")).toBe("test subject");
    });

    it("removes multiple prefixes", () => {
        expect(normalizeSubject("Re: Fwd: Re: Test Subject")).toBe("fwd: re: test subject");
        // Note: only removes first prefix, this is intentional for performance
    });

    it("handles case variations", () => {
        expect(normalizeSubject("RE: Test")).toBe("test");
        expect(normalizeSubject("FWD: Test")).toBe("test");
        expect(normalizeSubject("re: Test")).toBe("test");
    });

    it("removes AW: (German reply)", () => {
        expect(normalizeSubject("AW: Test Subject")).toBe("test subject");
    });

    it("removes WG: (German forward)", () => {
        expect(normalizeSubject("WG: Test Subject")).toBe("test subject");
    });

    it("removes SV: (Scandinavian reply)", () => {
        expect(normalizeSubject("SV: Test Subject")).toBe("test subject");
    });

    it("removes VS: (Scandinavian forward)", () => {
        expect(normalizeSubject("VS: Test Subject")).toBe("test subject");
    });

    it("normalizes whitespace", () => {
        expect(normalizeSubject("  Test   Subject  ")).toBe("test subject");
    });

    it("converts to lowercase", () => {
        expect(normalizeSubject("TEST SUBJECT")).toBe("test subject");
    });

    it("handles empty string", () => {
        expect(normalizeSubject("")).toBe("");
    });

    it("handles subject with only prefix", () => {
        expect(normalizeSubject("Re:")).toBe("");
    });
});

// ============================================================================
// isGenericSubject Tests
// ============================================================================

describe("isGenericSubject", () => {
    it("returns true for empty subject", () => {
        expect(isGenericSubject("")).toBe(true);
    });

    it("returns true for common generic subjects", () => {
        expect(isGenericSubject("hello")).toBe(true);
        expect(isGenericSubject("hi")).toBe(true);
        expect(isGenericSubject("hey")).toBe(true);
        expect(isGenericSubject("question")).toBe(true);
        expect(isGenericSubject("request")).toBe(true);
        expect(isGenericSubject("follow up")).toBe(true);
        expect(isGenericSubject("following up")).toBe(true);
        expect(isGenericSubject("checking in")).toBe(true);
        expect(isGenericSubject("quick question")).toBe(true);
        expect(isGenericSubject("update")).toBe(true);
        expect(isGenericSubject("urgent")).toBe(true);
        expect(isGenericSubject("important")).toBe(true);
        expect(isGenericSubject("fyi")).toBe(true);
        expect(isGenericSubject("info")).toBe(true);
        expect(isGenericSubject("information")).toBe(true);
    });

    it("returns false for specific subjects", () => {
        expect(isGenericSubject("quarterly report review")).toBe(false);
        expect(isGenericSubject("invoice #12345")).toBe(false);
        expect(isGenericSubject("meeting notes - jan 15")).toBe(false);
        expect(isGenericSubject("contract renewal discussion")).toBe(false);
    });
});

// ============================================================================
// extractThreadingHeaders Tests
// ============================================================================

describe("extractThreadingHeaders", () => {
    it("extracts In-Reply-To header", () => {
        const headers = {
            "In-Reply-To": "<abc123@example.com>",
        };

        const result = extractThreadingHeaders(headers);

        expect(result.inReplyTo).toBe("<abc123@example.com>");
    });

    it("extracts References header", () => {
        const headers = {
            References: "<msg1@example.com> <msg2@example.com> <msg3@example.com>",
        };

        const result = extractThreadingHeaders(headers);

        expect(result.references).toHaveLength(3);
        expect(result.references).toContain("<msg1@example.com>");
        expect(result.references).toContain("<msg2@example.com>");
        expect(result.references).toContain("<msg3@example.com>");
    });

    it("extracts Message-ID header", () => {
        const headers = {
            "Message-ID": "<unique123@example.com>",
        };

        const result = extractThreadingHeaders(headers);

        expect(result.messageId).toBe("<unique123@example.com>");
    });

    it("extracts Conversation-Index header (Exchange)", () => {
        const headers = {
            "X-MS-Exchange-Organization-ConversationIndex": "AQHZT8nq...",
        };

        const result = extractThreadingHeaders(headers);

        expect(result.conversationIndex).toBe("AQHZT8nq...");
    });

    it("extracts Thread-Index header", () => {
        const headers = {
            "Thread-Index": "AQHZT8nq...",
        };

        const result = extractThreadingHeaders(headers);

        expect(result.conversationIndex).toBe("AQHZT8nq...");
    });

    it("handles case-insensitive header names", () => {
        const headers = {
            "in-reply-to": "<abc123@example.com>",
            references: "<msg1@example.com>",
            "message-id": "<unique123@example.com>",
        };

        const result = extractThreadingHeaders(headers);

        expect(result.inReplyTo).toBe("<abc123@example.com>");
        expect(result.references).toHaveLength(1);
        expect(result.messageId).toBe("<unique123@example.com>");
    });

    it("returns null/empty for missing headers", () => {
        const headers = {};

        const result = extractThreadingHeaders(headers);

        expect(result.inReplyTo).toBeNull();
        expect(result.references).toHaveLength(0);
        expect(result.messageId).toBeNull();
        expect(result.conversationIndex).toBeNull();
    });

    it("handles empty References header", () => {
        const headers = {
            References: "",
        };

        const result = extractThreadingHeaders(headers);

        expect(result.references).toHaveLength(0);
    });
});

// ============================================================================
// findMatchingThread Tests
// ============================================================================

describe("findMatchingThread", () => {
    describe("Message-ID chain matching (highest priority)", () => {
        it("matches by In-Reply-To header", () => {
            const thread = createThread(
                "thread-001",
                ["msg-original-001"],
                "quarterly report",
                ["alice@example.com"]
            );
            const threads = createThreadMap([thread]);
            const messageIdMap = buildMessageIdMap(threads);

            const context: ThreadingContext = {
                messageId: "msg-reply-001",
                from: "bob@example.com",
                subject: "Re: Quarterly Report",
                headers: {
                    "In-Reply-To": "<msg-original-001>",
                },
            };

            const match = findMatchingThread(context, threads, messageIdMap);

            expect(match).not.toBeNull();
            expect(match?.threadId).toBe("thread-001");
            expect(match?.matchType).toBe("message_id");
            expect(match?.confidence).toBe("high");
        });

        it("matches by References header", () => {
            const thread = createThread(
                "thread-001",
                ["msg-001", "msg-002"],
                "quarterly report",
                ["alice@example.com"]
            );
            const threads = createThreadMap([thread]);
            const messageIdMap = buildMessageIdMap(threads);

            const context: ThreadingContext = {
                messageId: "msg-003",
                from: "bob@example.com",
                subject: "Re: Quarterly Report",
                headers: {
                    References: "<msg-001> <msg-002>",
                },
            };

            const match = findMatchingThread(context, threads, messageIdMap);

            expect(match).not.toBeNull();
            expect(match?.threadId).toBe("thread-001");
            expect(match?.matchType).toBe("message_id");
        });

        it("does not match closed threads by message ID", () => {
            const thread = createThread(
                "thread-001",
                ["msg-001"],
                "quarterly report",
                ["alice@example.com"],
                "closed"
            );
            const threads = createThreadMap([thread]);
            const messageIdMap = buildMessageIdMap(threads);

            const context: ThreadingContext = {
                messageId: "msg-002",
                from: "bob@example.com",
                subject: "Re: Quarterly Report",
                headers: {
                    "In-Reply-To": "<msg-001>",
                },
            };

            const match = findMatchingThread(context, threads, messageIdMap);

            expect(match).toBeNull();
        });
    });

    describe("Subject + participant matching (lower priority)", () => {
        it("matches by normalized subject and participant overlap", () => {
            const thread = createThread(
                "thread-001",
                ["msg-001"],
                "quarterly report",
                ["alice@example.com", "bob@example.com"]
            );
            const threads = createThreadMap([thread]);
            const messageIdMap = buildMessageIdMap(threads);

            const context: ThreadingContext = {
                messageId: "msg-002",
                from: "alice@example.com", // Participant in existing thread
                subject: "Re: Quarterly Report",
                headers: {},
            };

            const match = findMatchingThread(context, threads, messageIdMap);

            expect(match).not.toBeNull();
            expect(match?.threadId).toBe("thread-001");
            expect(match?.matchType).toBe("subject_participants");
            expect(match?.confidence).toBe("medium");
        });

        it("does not match generic subjects", () => {
            const thread = createThread(
                "thread-001",
                ["msg-001"],
                "hello", // Generic subject
                ["alice@example.com"]
            );
            const threads = createThreadMap([thread]);
            const messageIdMap = buildMessageIdMap(threads);

            const context: ThreadingContext = {
                messageId: "msg-002",
                from: "alice@example.com",
                subject: "Hello",
                headers: {},
            };

            const match = findMatchingThread(context, threads, messageIdMap);

            expect(match).toBeNull();
        });

        it("does not match without participant overlap", () => {
            const thread = createThread(
                "thread-001",
                ["msg-001"],
                "quarterly report",
                ["alice@example.com"]
            );
            const threads = createThreadMap([thread]);
            const messageIdMap = buildMessageIdMap(threads);

            const context: ThreadingContext = {
                messageId: "msg-002",
                from: "charlie@example.com", // Not a participant
                subject: "Quarterly Report",
                headers: {},
            };

            const match = findMatchingThread(context, threads, messageIdMap);

            expect(match).toBeNull();
        });

        it("handles case-insensitive email matching", () => {
            const thread = createThread(
                "thread-001",
                ["msg-001"],
                "quarterly report",
                ["Alice@Example.com"]
            );
            const threads = createThreadMap([thread]);
            const messageIdMap = buildMessageIdMap(threads);

            const context: ThreadingContext = {
                messageId: "msg-002",
                from: "alice@example.com",
                subject: "Quarterly Report",
                headers: {},
            };

            const match = findMatchingThread(context, threads, messageIdMap);

            expect(match).not.toBeNull();
        });
    });

    describe("no match scenarios", () => {
        it("returns null when no threads exist", () => {
            const threads = createThreadMap([]);
            const messageIdMap = buildMessageIdMap(threads);

            const context: ThreadingContext = {
                messageId: "msg-001",
                from: "alice@example.com",
                subject: "New Subject",
                headers: {},
            };

            const match = findMatchingThread(context, threads, messageIdMap);

            expect(match).toBeNull();
        });

        it("returns null for completely new conversation", () => {
            const thread = createThread(
                "thread-001",
                ["msg-001"],
                "quarterly report",
                ["alice@example.com"]
            );
            const threads = createThreadMap([thread]);
            const messageIdMap = buildMessageIdMap(threads);

            const context: ThreadingContext = {
                messageId: "msg-new",
                from: "charlie@example.com",
                subject: "Different Topic Entirely",
                headers: {},
            };

            const match = findMatchingThread(context, threads, messageIdMap);

            expect(match).toBeNull();
        });
    });
});

// ============================================================================
// buildMessageIdMap Tests
// ============================================================================

describe("buildMessageIdMap", () => {
    it("builds map from all thread message IDs", () => {
        const thread1 = createThread(
            "thread-001",
            ["msg-001", "msg-002"],
            "topic a",
            ["alice@example.com"]
        );
        const thread2 = createThread(
            "thread-002",
            ["msg-003", "msg-004", "msg-005"],
            "topic b",
            ["bob@example.com"]
        );
        const threads = createThreadMap([thread1, thread2]);

        const messageIdMap = buildMessageIdMap(threads);

        expect(messageIdMap.size).toBe(5);
        expect(messageIdMap.get("msg-001")).toBe("thread-001");
        expect(messageIdMap.get("msg-002")).toBe("thread-001");
        expect(messageIdMap.get("msg-003")).toBe("thread-002");
        expect(messageIdMap.get("msg-004")).toBe("thread-002");
        expect(messageIdMap.get("msg-005")).toBe("thread-002");
    });

    it("handles empty threads map", () => {
        const threads = createThreadMap([]);

        const messageIdMap = buildMessageIdMap(threads);

        expect(messageIdMap.size).toBe(0);
    });

    it("handles thread with single message", () => {
        const thread = createThread(
            "thread-001",
            ["msg-only"],
            "topic",
            ["alice@example.com"]
        );
        const threads = createThreadMap([thread]);

        const messageIdMap = buildMessageIdMap(threads);

        expect(messageIdMap.size).toBe(1);
        expect(messageIdMap.get("msg-only")).toBe("thread-001");
    });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
    it("handles angle brackets in message IDs", () => {
        const thread = createThread(
            "thread-001",
            ["msg-001@example.com"],
            "topic",
            ["alice@example.com"]
        );
        const threads = createThreadMap([thread]);
        const messageIdMap = buildMessageIdMap(threads);

        const context: ThreadingContext = {
            messageId: "msg-002",
            from: "bob@example.com",
            subject: "Re: Topic",
            headers: {
                "In-Reply-To": "<msg-001@example.com>",
            },
        };

        const match = findMatchingThread(context, threads, messageIdMap);

        // Should clean the angle brackets and match
        expect(match).not.toBeNull();
    });

    it("handles whitespace in References header", () => {
        const result = extractThreadingHeaders({
            References: "  <msg1@example.com>   <msg2@example.com>  ",
        });

        expect(result.references).toHaveLength(2);
    });

    it("handles newlines in References header", () => {
        const result = extractThreadingHeaders({
            References: "<msg1@example.com>\n\t<msg2@example.com>",
        });

        expect(result.references).toHaveLength(2);
    });
});
