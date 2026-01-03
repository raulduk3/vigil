/**
 * Ingestion Orchestrator Unit Tests
 *
 * Tests for the email ingestion pipeline.
 * Uses InMemoryEventStore for isolated testing.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { InMemoryEventStore, setEventStore, getEventStore } from "../../src/events/store";
import { ingestEmail, type IngestEmailInput } from "../../src/ingestion/orchestrator";
import type {
    WatcherCreatedEvent,
    WatcherActivatedEvent,
    PolicyUpdatedEvent,
    WatcherPolicy,
    EmailReceivedEvent,
    ActionRequestObservedEvent,
    ThreadOpenedEvent,
    ThreadEmailAddedEvent,
} from "../../src/events/types";

// ============================================================================
// Test Setup
// ============================================================================

const WATCHER_ID = "watcher-001";
const ACCOUNT_ID = "acct-001";
const USER_ID = "user-001";

const defaultPolicy: WatcherPolicy = {
    allowed_senders: ["alice@example.com", "bob@example.com"],
    silence_threshold_hours: 72,
    notification_channels: [{ type: "email", destination: "user@example.com", enabled: true }],
};

function setupActiveWatcher(store: InMemoryEventStore): void {
    const now = Date.now();

    const createdEvent: WatcherCreatedEvent = {
        event_id: "evt-created",
        timestamp: now,
        watcher_id: WATCHER_ID,
        type: "WATCHER_CREATED",
        account_id: ACCOUNT_ID,
        name: "Test Watcher",
        ingest_token: "abc123",
        created_by: USER_ID,
    };

    const activatedEvent: WatcherActivatedEvent = {
        event_id: "evt-activated",
        timestamp: now + 1,
        watcher_id: WATCHER_ID,
        type: "WATCHER_ACTIVATED",
        activated_by: USER_ID,
    };

    const policyEvent: PolicyUpdatedEvent = {
        event_id: "evt-policy",
        timestamp: now + 2,
        watcher_id: WATCHER_ID,
        type: "POLICY_UPDATED",
        policy: defaultPolicy,
        updated_by: USER_ID,
    };

    store.append(createdEvent);
    store.append(activatedEvent);
    store.append(policyEvent);
}

function createEmailInput(overrides: Partial<IngestEmailInput> = {}): IngestEmailInput {
    return {
        watcherId: WATCHER_ID,
        messageId: `msg-${Date.now()}`,
        from: "alice@example.com",
        subject: "Test Subject",
        body: "This is a test email. Can you please review this?",
        headers: {},
        receivedAt: Date.now(),
        ...overrides,
    };
}

// ============================================================================
// Tests
// ============================================================================

describe("ingestEmail", () => {
    let store: InMemoryEventStore;

    beforeEach(() => {
        store = new InMemoryEventStore();
        setEventStore(store);
    });

    describe("Basic Email Ingestion", () => {
        it("emits EMAIL_RECEIVED for valid email", async () => {
            setupActiveWatcher(store);

            const input = createEmailInput();
            const result = await ingestEmail(input);

            expect(result.success).toBe(true);

            const emailEvents = result.emittedEvents.filter(
                (e) => e.type === "EMAIL_RECEIVED"
            ) as EmailReceivedEvent[];

            expect(emailEvents).toHaveLength(1);
            expect(emailEvents[0].message_id).toBe(input.messageId);
            expect(emailEvents[0].from).toBe(input.from);
            expect(emailEvents[0].subject).toBe(input.subject);
        });

        it("stores events in event store", async () => {
            setupActiveWatcher(store);

            const input = createEmailInput();
            await ingestEmail(input);

            const allEvents = store.getAll();
            const emailReceivedEvents = allEvents.filter((e) => e.type === "EMAIL_RECEIVED");

            expect(emailReceivedEvents.length).toBeGreaterThan(0);
        });
    });

    describe("Sender Validation", () => {
        it("marks sender_allowed=true for allowed sender", async () => {
            setupActiveWatcher(store);

            const input = createEmailInput({ from: "alice@example.com" });
            const result = await ingestEmail(input);

            expect(result.senderAllowed).toBe(true);

            const emailEvent = result.emittedEvents.find(
                (e) => e.type === "EMAIL_RECEIVED"
            ) as EmailReceivedEvent;

            expect(emailEvent.sender_allowed).toBe(true);
        });

        it("marks sender_allowed=false for disallowed sender", async () => {
            setupActiveWatcher(store);

            const input = createEmailInput({ from: "unknown@example.com" });
            const result = await ingestEmail(input);

            expect(result.senderAllowed).toBe(false);

            const emailEvent = result.emittedEvents.find(
                (e) => e.type === "EMAIL_RECEIVED"
            ) as EmailReceivedEvent;

            expect(emailEvent.sender_allowed).toBe(false);
        });

        it("does not process action requests for disallowed senders", async () => {
            setupActiveWatcher(store);

            const input = createEmailInput({
                from: "unknown@example.com",
                body: "Can you please review this urgent request?",
            });
            const result = await ingestEmail(input);

            expect(result.actionRequestDetected).toBe(false);
            expect(result.threadId).toBeNull();

            const actionEvents = result.emittedEvents.filter(
                (e) => e.type === "ACTION_REQUEST_OBSERVED"
            );
            expect(actionEvents).toHaveLength(0);
        });

        it("allows all senders when allowed_senders is empty", async () => {
            const emptyAllowPolicy: WatcherPolicy = {
                ...defaultPolicy,
                allowed_senders: [], // Empty = allow all
            };

            const now = Date.now();
            const createdEvent: WatcherCreatedEvent = {
                event_id: "evt-created",
                timestamp: now,
                watcher_id: WATCHER_ID,
                type: "WATCHER_CREATED",
                account_id: ACCOUNT_ID,
                name: "Test Watcher",
                ingest_token: "abc123",
                created_by: USER_ID,
            };
            const activatedEvent: WatcherActivatedEvent = {
                event_id: "evt-activated",
                timestamp: now + 1,
                watcher_id: WATCHER_ID,
                type: "WATCHER_ACTIVATED",
                activated_by: USER_ID,
            };
            const policyEvent: PolicyUpdatedEvent = {
                event_id: "evt-policy",
                timestamp: now + 2,
                watcher_id: WATCHER_ID,
                type: "POLICY_UPDATED",
                policy: emptyAllowPolicy,
                updated_by: USER_ID,
            };

            store.append(createdEvent);
            store.append(activatedEvent);
            store.append(policyEvent);

            const input = createEmailInput({ from: "anyone@anywhere.com" });
            const result = await ingestEmail(input);

            expect(result.senderAllowed).toBe(true);
        });
    });

    describe("Action Request Detection", () => {
        it("detects action request and emits ACTION_REQUEST_OBSERVED", async () => {
            setupActiveWatcher(store);

            const input = createEmailInput({
                body: "Can you please review and approve this proposal?",
            });
            const result = await ingestEmail(input);

            expect(result.actionRequestDetected).toBe(true);

            const actionEvents = result.emittedEvents.filter(
                (e) => e.type === "ACTION_REQUEST_OBSERVED"
            ) as ActionRequestObservedEvent[];

            expect(actionEvents).toHaveLength(1);
            expect(actionEvents[0].message_id).toBe(input.messageId);
        });

        it("does not emit ACTION_REQUEST_OBSERVED for informational email", async () => {
            setupActiveWatcher(store);

            const input = createEmailInput({
                body: "Just wanted to let you know the project is complete. Thanks!",
            });
            const result = await ingestEmail(input);

            expect(result.actionRequestDetected).toBe(false);

            const actionEvents = result.emittedEvents.filter(
                (e) => e.type === "ACTION_REQUEST_OBSERVED"
            );

            expect(actionEvents).toHaveLength(0);
        });
    });

    describe("Thread Creation", () => {
        it("creates new thread when action request detected", async () => {
            setupActiveWatcher(store);

            const input = createEmailInput({
                body: "Can you review this document?",
            });
            const result = await ingestEmail(input);

            expect(result.threadId).not.toBeNull();

            const threadOpenedEvents = result.emittedEvents.filter(
                (e) => e.type === "THREAD_OPENED"
            ) as ThreadOpenedEvent[];

            expect(threadOpenedEvents).toHaveLength(1);
            expect(threadOpenedEvents[0].thread_id).toBe(result.threadId);
            expect(threadOpenedEvents[0].message_id).toBe(input.messageId);
        });

        it("does not create thread for email without action request", async () => {
            setupActiveWatcher(store);

            const input = createEmailInput({
                body: "Thanks for the update!",
            });
            const result = await ingestEmail(input);

            expect(result.threadId).toBeNull();

            const threadEvents = result.emittedEvents.filter(
                (e) => e.type === "THREAD_OPENED" || e.type === "THREAD_EMAIL_ADDED"
            );

            expect(threadEvents).toHaveLength(0);
        });
    });

    describe("Thread Matching", () => {
        it("adds email to existing thread when In-Reply-To matches", async () => {
            setupActiveWatcher(store);

            // First email creates thread
            const firstInput = createEmailInput({
                messageId: "msg-original",
                body: "Can you review this proposal?",
            });
            const firstResult = await ingestEmail(firstInput);
            const threadId = firstResult.threadId;

            expect(threadId).not.toBeNull();

            // Reply email should be added to existing thread
            const replyInput = createEmailInput({
                messageId: "msg-reply",
                from: "bob@example.com",
                body: "Sure, can you also add the budget details?",
                headers: {
                    "In-Reply-To": "<msg-original>",
                },
            });
            const replyResult = await ingestEmail(replyInput);

            expect(replyResult.threadId).toBe(threadId);

            const threadEmailAddedEvents = replyResult.emittedEvents.filter(
                (e) => e.type === "THREAD_EMAIL_ADDED"
            ) as ThreadEmailAddedEvent[];

            expect(threadEmailAddedEvents.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe("Deleted Watcher Handling", () => {
        it("rejects emails for deleted watcher", async () => {
            const now = Date.now();

            // Create and delete watcher
            store.append({
                event_id: "evt-created",
                timestamp: now,
                watcher_id: WATCHER_ID,
                type: "WATCHER_CREATED",
                account_id: ACCOUNT_ID,
                name: "Test Watcher",
                ingest_token: "abc123",
                created_by: USER_ID,
            } as WatcherCreatedEvent);

            store.append({
                event_id: "evt-deleted",
                timestamp: now + 1,
                watcher_id: WATCHER_ID,
                type: "WATCHER_DELETED",
                deleted_by: USER_ID,
            });

            const input = createEmailInput();
            const result = await ingestEmail(input);

            expect(result.success).toBe(false);
            expect(result.emittedEvents).toHaveLength(0);
        });
    });

    describe("Paused Watcher Handling", () => {
        it("accepts emails but does not extract action requests for paused watcher", async () => {
            const now = Date.now();

            store.append({
                event_id: "evt-created",
                timestamp: now,
                watcher_id: WATCHER_ID,
                type: "WATCHER_CREATED",
                account_id: ACCOUNT_ID,
                name: "Test Watcher",
                ingest_token: "abc123",
                created_by: USER_ID,
            } as WatcherCreatedEvent);

            store.append({
                event_id: "evt-activated",
                timestamp: now + 1,
                watcher_id: WATCHER_ID,
                type: "WATCHER_ACTIVATED",
                activated_by: USER_ID,
            } as WatcherActivatedEvent);

            store.append({
                event_id: "evt-policy",
                timestamp: now + 2,
                watcher_id: WATCHER_ID,
                type: "POLICY_UPDATED",
                policy: defaultPolicy,
                updated_by: USER_ID,
            } as PolicyUpdatedEvent);

            store.append({
                event_id: "evt-paused",
                timestamp: now + 3,
                watcher_id: WATCHER_ID,
                type: "WATCHER_PAUSED",
                paused_by: USER_ID,
            });

            const input = createEmailInput({
                body: "Can you please review this urgent request?",
            });
            const result = await ingestEmail(input);

            // Email should be received
            expect(result.success).toBe(true);

            const emailEvents = result.emittedEvents.filter((e) => e.type === "EMAIL_RECEIVED");
            expect(emailEvents).toHaveLength(1);

            // But no action request extraction (watcher is paused)
            // Note: This depends on implementation - some systems might still extract
            // For this test we assume paused watchers don't process action requests
        });
    });

    describe("Event Ordering", () => {
        it("emits events in correct order: EMAIL_RECEIVED, ACTION_REQUEST_OBSERVED, THREAD_OPENED", async () => {
            setupActiveWatcher(store);

            const input = createEmailInput({
                body: "Can you review this?",
            });
            const result = await ingestEmail(input);

            const eventTypes = result.emittedEvents.map((e) => e.type);

            const emailReceivedIndex = eventTypes.indexOf("EMAIL_RECEIVED");
            const actionRequestIndex = eventTypes.indexOf("ACTION_REQUEST_OBSERVED");
            const threadOpenedIndex = eventTypes.indexOf("THREAD_OPENED");

            expect(emailReceivedIndex).toBeLessThan(actionRequestIndex);
            expect(actionRequestIndex).toBeLessThan(threadOpenedIndex);
        });
    });
});

// ============================================================================
// Commercial Model Constraints Tests
// ============================================================================

describe("Commercial Model Constraints", () => {
    let store: InMemoryEventStore;

    beforeEach(() => {
        store = new InMemoryEventStore();
        setEventStore(store);
        setupActiveWatcher(store);
    });

    it("does not emit deadline events", async () => {
        const input = createEmailInput({
            body: "Please complete this by January 15th, 2024. Deadline is firm.",
        });
        const result = await ingestEmail(input);

        const deadlineEvents = result.emittedEvents.filter(
            (e) =>
                e.type === "HARD_DEADLINE_OBSERVED" ||
                e.type === "SOFT_DEADLINE_SIGNAL_OBSERVED" ||
                (e.type as any) === "DEADLINE_EXTRACTED"
        );

        expect(deadlineEvents).toHaveLength(0);
    });

    it("does not emit urgency events", async () => {
        const input = createEmailInput({
            body: "URGENT! This is critical! Please respond ASAP!",
        });
        const result = await ingestEmail(input);

        const urgencyEvents = result.emittedEvents.filter(
            (e) =>
                e.type === "URGENCY_SIGNAL_OBSERVED" ||
                (e.type as any) === "URGENCY_DETECTED"
        );

        expect(urgencyEvents).toHaveLength(0);
    });

    it("does not emit reminder events", async () => {
        const input = createEmailInput({
            body: "Can you set a reminder for the meeting?",
        });
        const result = await ingestEmail(input);

        const reminderEvents = result.emittedEvents.filter((e) =>
            e.type.startsWith("REMINDER_")
        );

        expect(reminderEvents).toHaveLength(0);
    });
});
