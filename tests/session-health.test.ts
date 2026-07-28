import { describe, expect, test } from "bun:test";
import type { SessionSummary } from "@claude-dashboard/shared";
import { deriveSessionHealth, isRecentlyEnded } from "../packages/web/src/utils/sessionHealth";

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s1",
    cwd: "/tmp/project",
    projectDirName: "-tmp-project",
    gitBranch: null,
    model: "claude-opus-4-8",
    cliVersion: null,
    title: null,
    startedAt: null,
    lastActivityAt: new Date(0).toISOString(),
    status: "running",
    pid: 123,
    lastAction: null,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      contextTokens: 0,
      contextLimit: 200_000,
    },
    cost: { totalUsd: 0, inputUsd: 0, outputUsd: 0, cacheWriteUsd: 0, cacheReadUsd: 0 },
    messageCount: 0,
    transcriptPath: "/tmp/project/s1.jsonl",
    hasPendingPermissionRequest: false,
    logPath: null,
    taskBoard: [],
    lastTurnOutputTokens: null,
    ...overrides,
  };
}

describe("deriveSessionHealth", () => {
  test("running session is green/running", () => {
    expect(deriveSessionHealth(makeSession({ status: "running" })).level).toBe("running");
  });

  test("waiting_input session is waiting", () => {
    expect(deriveSessionHealth(makeSession({ status: "waiting_input" })).level).toBe("waiting");
  });

  test("idle session is idle", () => {
    expect(deriveSessionHealth(makeSession({ status: "idle" })).level).toBe("idle");
  });

  test("ended session is ended and dimmed", () => {
    const health = deriveSessionHealth(makeSession({ status: "ended", pid: null }));
    expect(health.level).toBe("ended");
    expect(health.dimmed).toBe(true);
  });

  test("errored last action escalates a running session to critical", () => {
    const session = makeSession({
      status: "running",
      lastAction: { type: "tool_result", summary: "boom", isError: true, at: new Date(0).toISOString() },
    });
    expect(deriveSessionHealth(session).level).toBe("critical");
  });

  test("context at/above 90% is critical", () => {
    const session = makeSession({
      status: "running",
      usage: { ...makeSession().usage, contextTokens: 185_000, contextLimit: 200_000 },
    });
    expect(deriveSessionHealth(session).level).toBe("critical");
  });

  test("context between 75% and 90% is serious", () => {
    const session = makeSession({
      status: "running",
      usage: { ...makeSession().usage, contextTokens: 160_000, contextLimit: 200_000 },
    });
    expect(deriveSessionHealth(session).level).toBe("serious");
  });

  test("critical takes priority over waiting", () => {
    const session = makeSession({
      status: "waiting_input",
      usage: { ...makeSession().usage, contextTokens: 190_000, contextLimit: 200_000 },
    });
    expect(deriveSessionHealth(session).level).toBe("critical");
  });

  test("ended takes priority even with an errored last action", () => {
    const session = makeSession({
      status: "ended",
      pid: null,
      lastAction: { type: "tool_result", summary: "boom", isError: true, at: new Date(0).toISOString() },
    });
    expect(deriveSessionHealth(session).level).toBe("ended");
  });
});

describe("isRecentlyEnded", () => {
  const now = Date.parse("2026-07-03T12:00:00Z");

  test("ended within the window passes", () => {
    const session = makeSession({ status: "ended", pid: null, lastActivityAt: "2026-07-03T10:00:00Z" });
    expect(isRecentlyEnded(session, 4, now)).toBe(true);
  });

  test("ended before the window fails", () => {
    const session = makeSession({ status: "ended", pid: null, lastActivityAt: "2026-07-03T04:00:00Z" });
    expect(isRecentlyEnded(session, 4, now)).toBe(false);
  });

  test("non-ended session is never recently-ended", () => {
    const session = makeSession({ status: "running", lastActivityAt: "2026-07-03T11:59:00Z" });
    expect(isRecentlyEnded(session, 4, now)).toBe(false);
  });

  test("ended with no activity timestamp fails safe", () => {
    const session = makeSession({ status: "ended", pid: null, lastActivityAt: null });
    expect(isRecentlyEnded(session, 4, now)).toBe(false);
  });

  test("zero-hour window excludes everything", () => {
    const session = makeSession({ status: "ended", pid: null, lastActivityAt: "2026-07-03T11:59:59Z" });
    expect(isRecentlyEnded(session, 0, now)).toBe(false);
  });
});
