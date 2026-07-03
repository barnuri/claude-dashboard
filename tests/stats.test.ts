import { describe, expect, test } from "bun:test";
import { PeriodStatsBuilder } from "../packages/server/src/stats";
import type { TurnUsage } from "../packages/server/src/transcript";

const NOW = Date.parse("2026-07-03T12:00:00Z");

function turn(hoursAgo: number, overrides: Partial<TurnUsage> = {}): TurnUsage {
  return {
    at: new Date(NOW - hoursAgo * 60 * 60 * 1000).toISOString(),
    model: "claude-opus-4-8",
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 0,
    cacheCreation5m: 0,
    cacheCreation1h: 0,
    ...overrides,
  };
}

describe("PeriodStatsBuilder", () => {
  test("empty input yields zeroed stats for every period", () => {
    const stats = new PeriodStatsBuilder(NOW).build();
    for (const period of ["24h", "7d", "14d", "30d", "all"] as const) {
      expect(stats[period].sessionCount).toBe(0);
      expect(stats[period].totalInputTokens).toBe(0);
      expect(stats[period].totalCostUsd).toBe(0);
    }
  });

  test("a recent turn lands in every window", () => {
    const builder = new PeriodStatsBuilder(NOW);
    builder.addSession("s1", [turn(1)]);
    const stats = builder.build();
    for (const period of ["24h", "7d", "14d", "30d", "all"] as const) {
      expect(stats[period].totalInputTokens).toBe(1000);
      expect(stats[period].totalOutputTokens).toBe(500);
      expect(stats[period].sessionCount).toBe(1);
    }
  });

  test("a turn older than a window is excluded from it but included in wider ones", () => {
    const builder = new PeriodStatsBuilder(NOW);
    builder.addSession("s1", [turn(48)]); // 2 days ago
    const stats = builder.build();
    expect(stats["24h"].totalInputTokens).toBe(0);
    expect(stats["24h"].sessionCount).toBe(0);
    expect(stats["7d"].totalInputTokens).toBe(1000);
    expect(stats["all"].totalInputTokens).toBe(1000);
  });

  test("a session with turns in a window is counted once", () => {
    const builder = new PeriodStatsBuilder(NOW);
    builder.addSession("s1", [turn(1), turn(2), turn(3)]);
    const stats = builder.build();
    expect(stats["24h"].sessionCount).toBe(1);
    expect(stats["24h"].totalInputTokens).toBe(3000);
  });

  test("distinct sessions are counted separately", () => {
    const builder = new PeriodStatsBuilder(NOW);
    builder.addSession("s1", [turn(1)]);
    builder.addSession("s2", [turn(2)]);
    expect(builder.build()["24h"].sessionCount).toBe(2);
  });

  test("cache-creation tokens sum 5m and 1h buckets", () => {
    const builder = new PeriodStatsBuilder(NOW);
    builder.addSession("s1", [turn(1, { cacheCreation5m: 200, cacheCreation1h: 300 })]);
    expect(builder.build()["24h"].totalCacheCreationTokens).toBe(500);
  });

  test("turns with an unparseable timestamp are skipped", () => {
    const builder = new PeriodStatsBuilder(NOW);
    builder.addSession("s1", [turn(1, { at: "not-a-date" })]);
    expect(builder.build()["all"].totalInputTokens).toBe(0);
  });

  test("cost is positive for a priced turn", () => {
    const builder = new PeriodStatsBuilder(NOW);
    builder.addSession("s1", [turn(1)]);
    expect(builder.build()["24h"].totalCostUsd).toBeGreaterThan(0);
  });
});
