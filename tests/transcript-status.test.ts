import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTranscriptFile } from "../packages/server/src/transcript";

const tempDirs: string[] = [];

function writeTranscript(lines: object[]): string {
  const dir = mkdtempSync(join(tmpdir(), "transcript-"));
  tempDirs.push(dir);
  const file = join(dir, "session.jsonl");
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n"));
  return file;
}

function assistantLine(stopReason: string | null, blockType = "text"): object {
  return {
    type: "assistant",
    timestamp: "2026-07-03T12:00:00.000Z",
    message: {
      id: `m-${Math.round(Math.random() * 1e9)}`,
      model: "claude-opus-4-8",
      stop_reason: stopReason,
      content: [blockType === "text" ? { type: "text", text: "done" } : { type: "tool_use", name: "Bash", input: {} }],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  };
}

function askUserQuestionLine(toolUseId: string): object {
  return {
    type: "assistant",
    timestamp: "2026-07-03T12:00:00.000Z",
    message: {
      id: `m-${Math.round(Math.random() * 1e9)}`,
      model: "claude-opus-4-8",
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: toolUseId, name: "AskUserQuestion", input: {} }],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  };
}

function toolResultLine(toolUseId: string): object {
  return {
    type: "user",
    timestamp: "2026-07-03T12:01:00.000Z",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseId, content: "answered" }],
    },
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("parseTranscriptFile turnComplete (from message.stop_reason)", () => {
  test("end_turn marks the turn complete (session is waiting on the user)", () => {
    const file = writeTranscript([assistantLine("end_turn")]);
    const parsed = parseTranscriptFile(file, "fallback");
    expect(parsed?.turnComplete).toBe(true);
  });

  test("a mid-turn tool_use (stop_reason=tool_use) is NOT complete — still running", () => {
    const file = writeTranscript([assistantLine("tool_use", "tool_use")]);
    const parsed = parseTranscriptFile(file, "fallback");
    expect(parsed?.turnComplete).toBe(false);
  });

  test("refusal and max_tokens also complete the turn", () => {
    expect(parseTranscriptFile(writeTranscript([assistantLine("refusal")]), "f")?.turnComplete).toBe(true);
    expect(parseTranscriptFile(writeTranscript([assistantLine("max_tokens")]), "f")?.turnComplete).toBe(true);
  });

  test("a trailing user message resets turnComplete to false", () => {
    const file = writeTranscript([
      assistantLine("end_turn"),
      { type: "user", timestamp: "2026-07-03T12:01:00.000Z", message: { role: "user", content: "next" } },
    ]);
    expect(parseTranscriptFile(file, "f")?.turnComplete).toBe(false);
  });

  test("null stop_reason (streaming/incomplete) is not complete", () => {
    const file = writeTranscript([assistantLine(null)]);
    expect(parseTranscriptFile(file, "f")?.turnComplete).toBe(false);
  });
});

describe("parseTranscriptFile awaitingUserQuestion", () => {
  test("a normal completed turn with no tool calls is not awaiting a question", () => {
    const file = writeTranscript([assistantLine("end_turn")]);
    expect(parseTranscriptFile(file, "f")?.awaitingUserQuestion).toBe(false);
  });

  test("an unresolved AskUserQuestion tool_use is awaiting a question", () => {
    const file = writeTranscript([askUserQuestionLine("toolu_1")]);
    expect(parseTranscriptFile(file, "f")?.awaitingUserQuestion).toBe(true);
  });

  test("a resolved AskUserQuestion (matching tool_result arrived) is no longer awaiting", () => {
    const file = writeTranscript([askUserQuestionLine("toolu_1"), toolResultLine("toolu_1")]);
    expect(parseTranscriptFile(file, "f")?.awaitingUserQuestion).toBe(false);
  });

  test("an unrelated tool_use (e.g. Bash) never counts as awaiting a question", () => {
    const file = writeTranscript([assistantLine("tool_use", "tool_use")]);
    expect(parseTranscriptFile(file, "f")?.awaitingUserQuestion).toBe(false);
  });

  test("a tool_result for an unrelated tool_use id doesn't clear a genuinely pending question", () => {
    const file = writeTranscript([askUserQuestionLine("toolu_1"), toolResultLine("toolu_other")]);
    expect(parseTranscriptFile(file, "f")?.awaitingUserQuestion).toBe(true);
  });
});
