import { describe, expect, test } from "bun:test";
import { pairProcessesToTranscripts, type TranscriptCandidate } from "../packages/server/src/sessions";
import { parseElapsedSeconds, type ClaudeProcess } from "../packages/server/src/processes";

function makeProcess(overrides: Partial<ClaudeProcess> = {}): ClaudeProcess {
  return { pid: 1, command: "claude", cwd: "/repo", startedSecondsAgo: 0, ...overrides };
}

function makeCandidate(overrides: Partial<TranscriptCandidate> = {}): TranscriptCandidate {
  return { filePath: "/repo/a.jsonl", lastActivityAt: null, ...overrides };
}

describe("pairProcessesToTranscripts", () => {
  test("a single process in a cwd pairs with the single transcript sharing that cwd", () => {
    const processesByCwd = new Map([["/repo", [makeProcess({ pid: 42 })]]]);
    const transcriptsByCwd = new Map([["/repo", [makeCandidate({ filePath: "/repo/a.jsonl" })]]]);

    const result = pairProcessesToTranscripts(processesByCwd, transcriptsByCwd);

    expect(result.get("/repo/a.jsonl")).toBe(42);
  });

  test("the most-recently-started process pairs with the most-recently-active transcript, not by array order", () => {
    // A stale, 3-day-old transcript and a resumed process that only just started: the resumed
    // process's own recent activity (a fresh transcript) must win the recency slot, not whichever
    // pid happened to come first in `ps`'s listing order.
    const oldProcess = makeProcess({ pid: 100, startedSecondsAgo: 999_999 });
    const newProcess = makeProcess({ pid: 200, startedSecondsAgo: 5 });
    // Deliberately listed in an order that would produce the wrong pairing under naive index-zip.
    const processesByCwd = new Map([["/repo", [oldProcess, newProcess]]]);

    const staleTranscript = makeCandidate({ filePath: "/repo/stale.jsonl", lastActivityAt: "2026-07-10T00:00:00.000Z" });
    const freshTranscript = makeCandidate({ filePath: "/repo/fresh.jsonl", lastActivityAt: "2026-07-13T00:00:00.000Z" });
    const transcriptsByCwd = new Map([["/repo", [staleTranscript, freshTranscript]]]);

    const result = pairProcessesToTranscripts(processesByCwd, transcriptsByCwd);

    expect(result.get("/repo/fresh.jsonl")).toBe(200);
    expect(result.get("/repo/stale.jsonl")).toBe(100);
  });

  test("more processes than transcripts leaves the extra processes unmatched", () => {
    const processesByCwd = new Map([["/repo", [makeProcess({ pid: 1 }), makeProcess({ pid: 2 })]]]);
    const transcriptsByCwd = new Map([["/repo", [makeCandidate({ filePath: "/repo/only.jsonl" })]]]);

    const result = pairProcessesToTranscripts(processesByCwd, transcriptsByCwd);

    expect(result.size).toBe(1);
    expect(result.get("/repo/only.jsonl")).toBe(1);
  });

  test("more transcripts than processes leaves the extra (older) transcripts unmatched", () => {
    const processesByCwd = new Map([["/repo", [makeProcess({ pid: 1, startedSecondsAgo: 5 })]]]);
    const recent = makeCandidate({ filePath: "/repo/recent.jsonl", lastActivityAt: "2026-07-13T00:00:00.000Z" });
    const older = makeCandidate({ filePath: "/repo/older.jsonl", lastActivityAt: "2026-07-01T00:00:00.000Z" });
    const transcriptsByCwd = new Map([["/repo", [older, recent]]]);

    const result = pairProcessesToTranscripts(processesByCwd, transcriptsByCwd);

    expect(result.get("/repo/recent.jsonl")).toBe(1);
    expect(result.has("/repo/older.jsonl")).toBe(false);
  });

  test("processes and transcripts in different cwds never cross-pair", () => {
    const processesByCwd = new Map([
      ["/repo-a", [makeProcess({ pid: 1 })]],
      ["/repo-b", [makeProcess({ pid: 2 })]],
    ]);
    const transcriptsByCwd = new Map([
      ["/repo-a", [makeCandidate({ filePath: "/repo-a/a.jsonl" })]],
      ["/repo-b", [makeCandidate({ filePath: "/repo-b/b.jsonl" })]],
    ]);

    const result = pairProcessesToTranscripts(processesByCwd, transcriptsByCwd);

    expect(result.get("/repo-a/a.jsonl")).toBe(1);
    expect(result.get("/repo-b/b.jsonl")).toBe(2);
  });

  test("a cwd with processes but no matching transcripts produces no pairing", () => {
    const processesByCwd = new Map([["/repo", [makeProcess({ pid: 1 })]]]);
    const transcriptsByCwd = new Map<string, TranscriptCandidate[]>();

    const result = pairProcessesToTranscripts(processesByCwd, transcriptsByCwd);

    expect(result.size).toBe(0);
  });
});

describe("parseElapsedSeconds", () => {
  test("parses mm:ss", () => {
    expect(parseElapsedSeconds("02:30")).toBe(150);
  });

  test("parses hh:mm:ss", () => {
    expect(parseElapsedSeconds("01:02:03")).toBe(3723);
  });

  test("parses dd-hh:mm:ss", () => {
    expect(parseElapsedSeconds("2-01:00:00")).toBe(2 * 86400 + 3600);
  });

  test("parses bare seconds", () => {
    expect(parseElapsedSeconds("45")).toBe(45);
  });

  test("returns 0 for unparseable input rather than throwing", () => {
    expect(parseElapsedSeconds("not-a-time")).toBe(0);
  });
});
