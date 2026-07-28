import { describe, expect, test } from "bun:test";
import type { SessionSummary } from "@claude-dashboard/shared";
import { sortSessions } from "../packages/web/src/utils/sessionSort";

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s",
    cwd: "/tmp/project",
    projectDirName: "-tmp-project",
    gitBranch: null,
    model: "claude-opus-4-8",
    cliVersion: null,
    title: null,
    startedAt: null,
    lastActivityAt: new Date(0).toISOString(),
    status: "running",
    pid: 1,
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
    transcriptPath: "/tmp/project/s.jsonl",
    hasPendingPermissionRequest: false,
    logPath: null,
    taskBoard: [],
    lastTurnOutputTokens: null,
    ...overrides,
  };
}

describe("sortSessions", () => {
  test("orders by state: waiting → attention(red) → running → idle → ended", () => {
    const ended = makeSession({ id: "ended", status: "ended", pid: null });
    const running = makeSession({ id: "running", status: "running" });
    const idle = makeSession({ id: "idle", status: "idle" });
    const waiting = makeSession({ id: "waiting", status: "waiting_input" });
    const attention = makeSession({
      id: "attention",
      status: "running",
      lastAction: { type: "tool_result", summary: "err", isError: true, at: new Date(0).toISOString() },
    });

    const sorted = sortSessions([ended, running, idle, waiting, attention]);
    expect(sorted.map((s) => s.id)).toEqual(["waiting", "attention", "running", "idle", "ended"]);
  });

  test("within the same state, more recent activity sorts first", () => {
    const older = makeSession({ id: "older", status: "running", lastActivityAt: "2026-07-03T10:00:00Z" });
    const newer = makeSession({ id: "newer", status: "running", lastActivityAt: "2026-07-03T11:00:00Z" });
    const sorted = sortSessions([older, newer]);
    expect(sorted.map((s) => s.id)).toEqual(["newer", "older"]);
  });

  test("is a stable, pure function — does not mutate its input", () => {
    const input = [
      makeSession({ id: "a", status: "ended", pid: null }),
      makeSession({ id: "b", status: "waiting_input" }),
    ];
    const snapshot = input.map((s) => s.id);
    sortSessions(input);
    expect(input.map((s) => s.id)).toEqual(snapshot);
  });

  test("equal state and activity fall back to a deterministic id order", () => {
    const a = makeSession({ id: "aaa", status: "running", lastActivityAt: "2026-07-03T10:00:00Z" });
    const b = makeSession({ id: "bbb", status: "running", lastActivityAt: "2026-07-03T10:00:00Z" });
    expect(sortSessions([b, a]).map((s) => s.id)).toEqual(["aaa", "bbb"]);
  });
});
