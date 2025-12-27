/**
 * Unit tests for Scheduler module
 *
 * Tests per SDD requirements:
 * - MR-Scheduler-1: TIME_TICK generation
 * - MR-Scheduler-2: Report scheduling
 * - FR-15: Report Generation
 */

import { describe, test, expect } from "bun:test";
import {
  generateTimeTicks,
  shouldGenerateReport,
  parseReportingTime,
  getDayNumber,
  getNextTickTime,
  validateSchedulerConfig,
  DEFAULT_SCHEDULER_CONFIG,
  type SchedulerConfig,
} from "@/scheduler/scheduler";
import type { WatcherPolicy } from "@/events/types";

// Helper to create test policy
function createPolicy(
  overrides: Partial<WatcherPolicy> = {}
): WatcherPolicy {
  return {
    allowed_senders: [],
    silence_threshold_hours: 72,
    deadline_warning_hours: 24,
    deadline_critical_hours: 2,
    notification_channels: [],
    reporting_cadence: "daily",
    reporting_recipients: ["report@example.com"],
    reporting_time: "09:00:00Z",
    ...overrides,
  };
}

describe("generateTimeTicks (MR-Scheduler-1)", () => {
  test("should generate TIME_TICK for each active watcher", () => {
    const watcherIds = ["w1", "w2", "w3"];
    const tickTimestamp = Date.now();

    const ticks = generateTimeTicks(watcherIds, tickTimestamp);

    expect(ticks.length).toBe(3);
    expect(ticks[0]).toEqual({
      watcher_id: "w1",
      tick_timestamp: tickTimestamp,
    });
    expect(ticks[1]).toEqual({
      watcher_id: "w2",
      tick_timestamp: tickTimestamp,
    });
  });

  test("should return empty array for no active watchers", () => {
    const ticks = generateTimeTicks([], Date.now());
    expect(ticks).toEqual([]);
  });

  test("should use consistent tick timestamp for all watchers", () => {
    const watcherIds = ["w1", "w2"];
    const tickTimestamp = 1735084800000; // Fixed timestamp

    const ticks = generateTimeTicks(watcherIds, tickTimestamp);

    expect(ticks[0]?.tick_timestamp).toBe(tickTimestamp);
    expect(ticks[1]?.tick_timestamp).toBe(tickTimestamp);
  });

  test("should handle large number of watchers", () => {
    const watcherIds = Array.from({ length: 1000 }, (_, i) => `w${i}`);
    const tickTimestamp = Date.now();

    const start = performance.now();
    const ticks = generateTimeTicks(watcherIds, tickTimestamp);
    const duration = performance.now() - start;

    expect(ticks.length).toBe(1000);
    expect(duration).toBeLessThan(10); // Should be very fast
  });
});

describe("shouldGenerateReport (FR-15: Report Generation)", () => {
  describe("Daily Reports", () => {
    test("should generate report at scheduled time", () => {
      const policy = createPolicy({
        reporting_cadence: "daily",
        reporting_time: "09:00:00Z",
      });

      // December 25, 2025, 9:15 AM UTC
      const currentTime = Date.UTC(2025, 11, 25, 9, 15, 0);
      const lastReportTime = null;

      const result = shouldGenerateReport(policy, currentTime, lastReportTime);

      expect(result.shouldGenerate).toBe(true);
      expect(result.reason).toBe("No previous report");
    });

    test("should not generate before scheduled time", () => {
      const policy = createPolicy({
        reporting_cadence: "daily",
        reporting_time: "09:00:00Z",
      });

      // December 25, 2025, 8:30 AM UTC (before 9 AM)
      const currentTime = Date.UTC(2025, 11, 25, 8, 30, 0);
      const lastReportTime = null;

      const result = shouldGenerateReport(policy, currentTime, lastReportTime);

      expect(result.shouldGenerate).toBe(false);
      expect(result.reason).toBe("Before scheduled report time");
    });

    test("should not generate duplicate daily report", () => {
      const policy = createPolicy({
        reporting_cadence: "daily",
        reporting_time: "09:00:00Z",
      });

      // December 25, 2025, 10:00 AM UTC
      const currentTime = Date.UTC(2025, 11, 25, 10, 0, 0);
      // Report already generated today at 9:05 AM
      const lastReportTime = Date.UTC(2025, 11, 25, 9, 5, 0);

      const result = shouldGenerateReport(policy, currentTime, lastReportTime);

      expect(result.shouldGenerate).toBe(false);
      expect(result.reason).toBe("Report already generated today");
    });

    test("should generate report on new day", () => {
      const policy = createPolicy({
        reporting_cadence: "daily",
        reporting_time: "09:00:00Z",
      });

      // December 26, 2025, 9:15 AM UTC
      const currentTime = Date.UTC(2025, 11, 26, 9, 15, 0);
      // Last report was December 25
      const lastReportTime = Date.UTC(2025, 11, 25, 9, 5, 0);

      const result = shouldGenerateReport(policy, currentTime, lastReportTime);

      expect(result.shouldGenerate).toBe(true);
      expect(result.reason).toBe("Daily report due");
    });

    test("should provide next scheduled time", () => {
      const policy = createPolicy({
        reporting_cadence: "daily",
        reporting_time: "09:00:00Z",
      });

      const currentTime = Date.UTC(2025, 11, 25, 9, 15, 0);
      const result = shouldGenerateReport(policy, currentTime, null);

      expect(result.nextScheduledTime).not.toBeNull();
      // Next should be December 26, 9 AM
      const nextDate = new Date(result.nextScheduledTime!);
      expect(nextDate.getUTCDate()).toBe(26);
      expect(nextDate.getUTCHours()).toBe(9);
    });
  });

  describe("Weekly Reports", () => {
    test("should generate weekly report on scheduled day", () => {
      const policy = createPolicy({
        reporting_cadence: "weekly",
        reporting_day: "monday",
        reporting_time: "09:00:00Z",
      });

      // December 22, 2025 is a Monday, 9:15 AM UTC
      const currentTime = Date.UTC(2025, 11, 22, 9, 15, 0);
      const lastReportTime = null;

      const result = shouldGenerateReport(policy, currentTime, lastReportTime);

      expect(result.shouldGenerate).toBe(true);
    });

    test("should not generate on wrong day", () => {
      const policy = createPolicy({
        reporting_cadence: "weekly",
        reporting_day: "monday",
        reporting_time: "09:00:00Z",
      });

      // December 23, 2025 is a Tuesday
      const currentTime = Date.UTC(2025, 11, 23, 9, 15, 0);

      const result = shouldGenerateReport(policy, currentTime, null);

      expect(result.shouldGenerate).toBe(false);
      expect(result.reason).toBe("Not the scheduled day");
    });

    test("should provide next scheduled time for weekly report", () => {
      const policy = createPolicy({
        reporting_cadence: "weekly",
        reporting_day: "monday",
        reporting_time: "09:00:00Z",
      });

      // December 23, 2025 is Tuesday
      const currentTime = Date.UTC(2025, 11, 23, 9, 15, 0);
      const result = shouldGenerateReport(policy, currentTime, null);

      expect(result.nextScheduledTime).not.toBeNull();
      // Next Monday is December 29
      const nextDate = new Date(result.nextScheduledTime!);
      expect(nextDate.getUTCDate()).toBe(29);
    });
  });

  describe("On-Demand Reports", () => {
    test("should not auto-generate for on_demand cadence", () => {
      const policy = createPolicy({
        reporting_cadence: "on_demand",
      });

      const currentTime = Date.now();
      const result = shouldGenerateReport(policy, currentTime, null);

      expect(result.shouldGenerate).toBe(false);
      expect(result.reason).toBe("Reporting cadence is on_demand");
      expect(result.nextScheduledTime).toBeNull();
    });
  });
});

describe("parseReportingTime", () => {
  test("should parse standard time format", () => {
    expect(parseReportingTime("09:00:00Z")).toEqual({ hours: 9, minutes: 0 });
    expect(parseReportingTime("14:30:00Z")).toEqual({ hours: 14, minutes: 30 });
  });

  test("should parse short time format", () => {
    expect(parseReportingTime("09:00")).toEqual({ hours: 9, minutes: 0 });
    expect(parseReportingTime("23:59")).toEqual({ hours: 23, minutes: 59 });
  });

  test("should return default for undefined", () => {
    expect(parseReportingTime(undefined)).toEqual({ hours: 9, minutes: 0 });
  });

  test("should return default for invalid format", () => {
    expect(parseReportingTime("invalid")).toEqual({ hours: 9, minutes: 0 });
  });
});

describe("getDayNumber", () => {
  test("should return correct day numbers", () => {
    expect(getDayNumber("monday")).toBe(1);
    expect(getDayNumber("tuesday")).toBe(2);
    expect(getDayNumber("wednesday")).toBe(3);
    expect(getDayNumber("thursday")).toBe(4);
    expect(getDayNumber("friday")).toBe(5);
    expect(getDayNumber("saturday")).toBe(6);
    expect(getDayNumber("sunday")).toBe(7);
  });

  test("should handle case insensitivity", () => {
    expect(getDayNumber("Monday")).toBe(1);
    expect(getDayNumber("FRIDAY")).toBe(5);
  });

  test("should default to Monday for unknown day", () => {
    expect(getDayNumber("unknown")).toBe(1);
  });
});

describe("getNextTickTime", () => {
  test("should calculate next tick at interval boundary", () => {
    const config: SchedulerConfig = {
      tickIntervalMs: 15 * 60 * 1000, // 15 minutes
      timezone: "UTC",
    };

    // Current time: 10:07:30 AM
    const currentTime = Date.UTC(2025, 11, 25, 10, 7, 30);
    const nextTick = getNextTickTime(config, currentTime);

    // Next tick should be 10:15 AM
    const nextDate = new Date(nextTick);
    expect(nextDate.getUTCMinutes()).toBe(15);
    expect(nextDate.getUTCHours()).toBe(10);
  });

  test("should return same time if exactly on boundary", () => {
    const config: SchedulerConfig = {
      tickIntervalMs: 15 * 60 * 1000,
      timezone: "UTC",
    };

    // Exactly on 15-minute boundary
    const currentTime = Date.UTC(2025, 11, 25, 10, 15, 0);
    const nextTick = getNextTickTime(config, currentTime);

    expect(nextTick).toBe(currentTime);
  });
});

describe("validateSchedulerConfig", () => {
  test("should accept valid config", () => {
    const result = validateSchedulerConfig(DEFAULT_SCHEDULER_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("should reject tick interval less than 60 seconds", () => {
    const config: SchedulerConfig = {
      tickIntervalMs: 30000, // 30 seconds
      timezone: "UTC",
    };
    const result = validateSchedulerConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Tick interval must be at least 60 seconds");
  });

  test("should reject tick interval greater than 24 hours", () => {
    const config: SchedulerConfig = {
      tickIntervalMs: 25 * 60 * 60 * 1000, // 25 hours
      timezone: "UTC",
    };
    const result = validateSchedulerConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Tick interval must be less than 24 hours");
  });
});

describe("Scheduler Performance", () => {
  test("should generate ticks for 10,000 watchers in < 50ms", () => {
    const watcherIds = Array.from({ length: 10000 }, (_, i) => `w${i}`);
    const tickTimestamp = Date.now();

    const start = performance.now();
    generateTimeTicks(watcherIds, tickTimestamp);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
  });
});
