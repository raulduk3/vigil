/**
 * Unit tests for thread detection and grouping
 *
 * Tests per SDD requirements:
 * - FR-8: Thread Creation and Association
 * - Thread Grouping Algorithm
 */

import { describe, test, expect } from "bun:test";
import {
  findMatchingThread,
  isGenericSubject,
  buildMessageIdMap,
  matchesClosedThread,
  type ThreadingContext,
} from "@/watcher/thread-detection";
import type { ThreadState } from "@/watcher/runtime";

// Helper to create test thread
function createThread(overrides: Partial<ThreadState> = {}): ThreadState {
  return {
    thread_id: "t1",
    watcher_id: "w1",
    trigger_type: "hard_deadline",
    opened_at: Date.now(),
    last_activity_at: Date.now(),
    status: "open",
    closed_at: null,
    message_ids: ["msg_1"],
    participants: ["sender@example.com"],
    normalized_subject: "test subject",
    original_sender: "sender@example.com",
    original_sent_at: Date.now(),
    hard_deadline_event_id: null,
    soft_deadline_event_id: null,
    last_urgency_state: "ok",
    last_alert_urgency: null,
    ...overrides,
  };
}

// Helper to create threading context
function createContext(overrides: Partial<ThreadingContext> = {}): ThreadingContext {
  return {
    messageId: "msg_new",
    from: "sender@example.com",
    subject: "Test Subject",
    headers: {},
    ...overrides,
  };
}

describe("findMatchingThread (FR-8: Thread Grouping Algorithm)", () => {
  describe("Priority 1: Message-ID Chaining", () => {
    test("should match thread via In-Reply-To header", () => {
      const thread = createThread({ message_ids: ["msg_original"] });
      const threads = new Map([["t1", thread]]);
      const messageIdMap = buildMessageIdMap(threads);

      const context = createContext({
        headers: { "In-Reply-To": "<msg_original>" },
      });

      const result = findMatchingThread(context, threads, messageIdMap);

      expect(result).not.toBeNull();
      expect(result?.threadId).toBe("t1");
      expect(result?.matchType).toBe("message_id");
      expect(result?.confidence).toBe("high");
    });

    test("should match thread via References header", () => {
      const thread = createThread({ message_ids: ["msg_1", "msg_2"] });
      const threads = new Map([["t1", thread]]);
      const messageIdMap = buildMessageIdMap(threads);

      const context = createContext({
        headers: { References: "<msg_1> <msg_2>" },
      });

      const result = findMatchingThread(context, threads, messageIdMap);

      expect(result).not.toBeNull();
      expect(result?.threadId).toBe("t1");
      expect(result?.matchType).toBe("message_id");
    });

    test("should handle message IDs with angle brackets", () => {
      const thread = createThread({ message_ids: ["msg_test@example.com"] });
      const threads = new Map([["t1", thread]]);
      const messageIdMap = buildMessageIdMap(threads);

      const context = createContext({
        headers: { "In-Reply-To": "<msg_test@example.com>" },
      });

      const result = findMatchingThread(context, threads, messageIdMap);
      expect(result?.threadId).toBe("t1");
    });

    test("should not match closed thread (create new thread instead)", () => {
      const thread = createThread({
        status: "closed",
        closed_at: Date.now(),
        message_ids: ["msg_original"],
      });
      const threads = new Map([["t1", thread]]);
      const messageIdMap = buildMessageIdMap(threads);

      const context = createContext({
        headers: { "In-Reply-To": "<msg_original>" },
      });

      const result = findMatchingThread(context, threads, messageIdMap);
      expect(result).toBeNull(); // No match - closed thread
    });
  });

  describe("Priority 3: Subject + Participant Overlap", () => {
    test("should match thread via subject and participant overlap", () => {
      const thread = createThread({
        normalized_subject: "project update",
        participants: ["alice@example.com", "bob@example.com"],
      });
      const threads = new Map([["t1", thread]]);
      const messageIdMap = new Map<string, string>();

      const context = createContext({
        from: "alice@example.com",
        subject: "Re: Project Update",
        headers: {},
      });

      const result = findMatchingThread(context, threads, messageIdMap);

      expect(result).not.toBeNull();
      expect(result?.threadId).toBe("t1");
      expect(result?.matchType).toBe("subject_participants");
      expect(result?.confidence).toBe("medium");
    });

    test("should not match on generic subject alone", () => {
      const thread = createThread({
        normalized_subject: "question",
        participants: ["alice@example.com"],
      });
      const threads = new Map([["t1", thread]]);
      const messageIdMap = new Map<string, string>();

      const context = createContext({
        from: "alice@example.com",
        subject: "Question",
        headers: {},
      });

      const result = findMatchingThread(context, threads, messageIdMap);
      expect(result).toBeNull();
    });

    test("should require participant overlap for subject match", () => {
      const thread = createThread({
        normalized_subject: "project update",
        participants: ["alice@example.com"],
      });
      const threads = new Map([["t1", thread]]);
      const messageIdMap = new Map<string, string>();

      const context = createContext({
        from: "stranger@example.com", // Not a participant
        subject: "Project Update",
        headers: {},
      });

      const result = findMatchingThread(context, threads, messageIdMap);
      expect(result).toBeNull();
    });
  });

  describe("Thread Matching Priority Order", () => {
    test("should prefer Message-ID match over subject match", () => {
      const thread1 = createThread({
        thread_id: "t1",
        message_ids: ["msg_ref"],
        normalized_subject: "different subject",
      });
      const thread2 = createThread({
        thread_id: "t2",
        message_ids: [],
        normalized_subject: "test subject",
        participants: ["sender@example.com"],
      });

      const threads = new Map([
        ["t1", thread1],
        ["t2", thread2],
      ]);
      const messageIdMap = buildMessageIdMap(threads);

      const context = createContext({
        subject: "Test Subject",
        headers: { "In-Reply-To": "<msg_ref>" },
      });

      const result = findMatchingThread(context, threads, messageIdMap);
      expect(result?.threadId).toBe("t1"); // Message-ID match wins
    });
  });

  test("should return null when no match found", () => {
    const thread = createThread();
    const threads = new Map([["t1", thread]]);
    const messageIdMap = buildMessageIdMap(threads);

    const context = createContext({
      from: "stranger@other.com",
      subject: "Completely Different Subject",
      headers: {},
    });

    const result = findMatchingThread(context, threads, messageIdMap);
    expect(result).toBeNull();
  });

  test("should handle empty threads map", () => {
    const threads = new Map<string, ThreadState>();
    const messageIdMap = new Map<string, string>();

    const context = createContext();
    const result = findMatchingThread(context, threads, messageIdMap);
    expect(result).toBeNull();
  });
});

describe("isGenericSubject", () => {
  test("should identify generic subjects", () => {
    expect(isGenericSubject("question")).toBe(true);
    expect(isGenericSubject("update")).toBe(true);
    expect(isGenericSubject("fyi")).toBe(true);
    expect(isGenericSubject("hi")).toBe(true);
    expect(isGenericSubject("thanks")).toBe(true);
    expect(isGenericSubject("help")).toBe(true);
    expect(isGenericSubject("urgent")).toBe(true);
    expect(isGenericSubject("")).toBe(true);
  });

  test("should not flag specific subjects as generic", () => {
    expect(isGenericSubject("invoice #12345")).toBe(false);
    expect(isGenericSubject("project alpha deadline")).toBe(false);
    expect(isGenericSubject("contract review needed")).toBe(false);
    expect(isGenericSubject("q4 budget discussion")).toBe(false);
  });
});

describe("buildMessageIdMap", () => {
  test("should build map from threads", () => {
    const threads = new Map<string, ThreadState>([
      ["t1", createThread({ thread_id: "t1", message_ids: ["m1", "m2"] })],
      ["t2", createThread({ thread_id: "t2", message_ids: ["m3"] })],
    ]);

    const map = buildMessageIdMap(threads);

    expect(map.get("m1")).toBe("t1");
    expect(map.get("m2")).toBe("t1");
    expect(map.get("m3")).toBe("t2");
  });

  test("should handle empty threads", () => {
    const threads = new Map<string, ThreadState>();
    const map = buildMessageIdMap(threads);
    expect(map.size).toBe(0);
  });

  test("should handle threads with no messages", () => {
    const threads = new Map<string, ThreadState>([
      ["t1", createThread({ message_ids: [] })],
    ]);
    const map = buildMessageIdMap(threads);
    expect(map.size).toBe(0);
  });
});

describe("matchesClosedThread (FR-9: Terminal State)", () => {
  test("should detect when message references closed thread", () => {
    const closedThread = createThread({
      status: "closed",
      closed_at: Date.now(),
      message_ids: ["msg_closed"],
    });
    const threads = new Map([["t1", closedThread]]);
    const messageIdMap = buildMessageIdMap(threads);

    const context = createContext({
      headers: { "In-Reply-To": "<msg_closed>" },
    });

    expect(matchesClosedThread(context, threads, messageIdMap)).toBe(true);
  });

  test("should return false for open thread reference", () => {
    const openThread = createThread({
      status: "open",
      message_ids: ["msg_open"],
    });
    const threads = new Map([["t1", openThread]]);
    const messageIdMap = buildMessageIdMap(threads);

    const context = createContext({
      headers: { "In-Reply-To": "<msg_open>" },
    });

    expect(matchesClosedThread(context, threads, messageIdMap)).toBe(false);
  });

  test("should return false when no reference to any thread", () => {
    const threads = new Map<string, ThreadState>();
    const messageIdMap = new Map<string, string>();

    const context = createContext({
      headers: { "In-Reply-To": "<unknown_msg>" },
    });

    expect(matchesClosedThread(context, threads, messageIdMap)).toBe(false);
  });
});

describe("Thread Detection Performance", () => {
  test("should detect thread among 10,000 threads within 100ms", () => {
    // Create 10,000 threads
    const threads = new Map<string, ThreadState>();
    for (let i = 0; i < 10000; i++) {
      threads.set(
        `t${i}`,
        createThread({
          thread_id: `t${i}`,
          message_ids: [`msg_${i}`],
          normalized_subject: `subject ${i}`,
          participants: [`user${i}@example.com`],
        })
      );
    }
    const messageIdMap = buildMessageIdMap(threads);

    // Try to match message referencing thread in the middle
    const context = createContext({
      headers: { "In-Reply-To": "<msg_5000>" },
    });

    const start = performance.now();
    const result = findMatchingThread(context, threads, messageIdMap);
    const duration = performance.now() - start;

    expect(result?.threadId).toBe("t5000");
    expect(duration).toBeLessThan(100);
  });
});
