import { describe, expect, test } from "bun:test";
import { MockDataProvider } from "../packages/server/src/mock";

const NOW = Date.parse("2026-07-03T12:00:00Z");

describe("MockDataProvider.buildSnapshot", () => {
  const snapshot = new MockDataProvider().buildSnapshot(NOW);

  test("returns several sessions with no real machine paths", () => {
    expect(snapshot.sessions.length).toBeGreaterThanOrEqual(4);
    for (const session of snapshot.sessions) {
      expect(session.cwd.startsWith("/home/dev/")).toBe(true);
      expect(session.transcriptPath.startsWith("/home/dev/")).toBe(true);
    }
  });

  test("includes active statuses for the demo's Active filter", () => {
    const statuses = new Set(snapshot.sessions.map((s) => s.status));
    expect(statuses.has("running")).toBe(true);
    expect(statuses.has("waiting_input")).toBe(true);
    expect(statuses.has("ended")).toBe(true);
  });

  test("includes at least one session matching the demo's 'claude' search text", () => {
    const matches = snapshot.sessions.filter((s) => s.cwd.includes("claude"));
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test("active sessions have pids, ended sessions do not", () => {
    for (const session of snapshot.sessions) {
      if (session.status === "ended") {
        expect(session.pid).toBeNull();
      } else {
        expect(session.pid).not.toBeNull();
      }
    }
  });

  test("totals aggregate session usage, cost, and running count", () => {
    const expectedCost = snapshot.sessions.reduce((sum, s) => sum + s.cost.totalUsd, 0);
    const expectedRunning = snapshot.sessions.filter((s) => s.status !== "ended").length;
    expect(snapshot.totals.sessionCount).toBe(snapshot.sessions.length);
    expect(snapshot.totals.totalCostUsd).toBeCloseTo(expectedCost, 6);
    expect(snapshot.totals.runningCount).toBe(expectedRunning);
    expect(snapshot.totals.totalInputTokens).toBeGreaterThan(0);
    expect(snapshot.totals.totalOutputTokens).toBeGreaterThan(0);
    expect(snapshot.totals.totalCacheReadTokens).toBeGreaterThan(0);
  });

  test("period stats are non-zero so stat tiles and token mix render", () => {
    for (const period of ["24h", "7d", "all"] as const) {
      const stats = snapshot.statsByPeriod[period];
      expect(stats.sessionCount).toBeGreaterThan(0);
      expect(stats.totalCostUsd).toBeGreaterThan(0);
      expect(stats.totalInputTokens + stats.totalOutputTokens).toBeGreaterThan(0);
    }
  });

  test("is deterministic for a fixed now", () => {
    const again = new MockDataProvider().buildSnapshot(NOW);
    expect(again).toEqual(snapshot);
  });
});

describe("MockDataProvider.getFeed", () => {
  const provider = new MockDataProvider();

  test("returns a plausible timeline for a known session", () => {
    const feed = provider.getFeed("mock-claude-dashboard", 60, NOW);
    expect(feed.length).toBeGreaterThanOrEqual(10);
    const roles = new Set(feed.map((item) => item.role));
    expect(roles.has("user")).toBe(true);
    expect(roles.has("assistant")).toBe(true);
    const timestamps = feed.map((item) => Date.parse(item.at));
    const sorted = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(sorted);
  });

  test("respects the limit parameter", () => {
    const feed = provider.getFeed("mock-claude-dashboard", 5, NOW);
    expect(feed.length).toBe(5);
  });

  test("returns an empty feed for unknown session ids", () => {
    expect(provider.getFeed("no-such-session", 60, NOW)).toEqual([]);
  });
});
