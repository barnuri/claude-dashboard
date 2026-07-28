import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTranscriptFile } from "../packages/server/src/transcript";

const tempDirs: string[] = [];

function writeTranscript(lines: object[]): string {
  const dir = mkdtempSync(join(tmpdir(), "transcript-taskboard-"));
  tempDirs.push(dir);
  const file = join(dir, "session.jsonl");
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n"));
  return file;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const AT = "2026-07-28T12:00:00.000Z";

function assistantToolUse(id: string, name: string, input: unknown): object {
  return {
    type: "assistant",
    timestamp: AT,
    message: { id: `m-${id}`, content: [{ type: "tool_use", id, name, input }] },
  };
}

function userToolResult(toolUseId: string, content: string): object {
  return {
    type: "user",
    timestamp: AT,
    message: { content: [{ type: "tool_result", tool_use_id: toolUseId, content }] },
  };
}

describe("parseTranscriptFile taskBoard — TaskCreate", () => {
  test("learns the assigned id and starting status from the paired tool_result", () => {
    const file = writeTranscript([
      assistantToolUse("tu_1", "TaskCreate", { subject: "Diff master vs prod: control-plane", description: "..." }),
      userToolResult("tu_1", "Task #1 created successfully: Diff master vs prod: control-plane"),
    ]);

    const board = parseTranscriptFile(file, "f")?.taskBoard;
    expect(board).toEqual([{ id: "1", subject: "Diff master vs prod: control-plane", status: "pending" }]);
  });

  test("a TaskCreate with no matching or malformed result is dropped, not crashed on", () => {
    const file = writeTranscript([
      assistantToolUse("tu_1", "TaskCreate", { subject: "Orphaned task" }),
      userToolResult("tu_1", "unexpected format, no task id here"),
    ]);

    expect(parseTranscriptFile(file, "f")?.taskBoard).toEqual([]);
  });
});

describe("parseTranscriptFile taskBoard — TaskUpdate", () => {
  test("applies status changes directly from the tool_use input, without waiting for a result", () => {
    const file = writeTranscript([
      assistantToolUse("tu_1", "TaskCreate", { subject: "Write tests" }),
      userToolResult("tu_1", "Task #1 created successfully: Write tests"),
      assistantToolUse("tu_2", "TaskUpdate", { taskId: "1", status: "in_progress" }),
    ]);

    expect(parseTranscriptFile(file, "f")?.taskBoard).toEqual([
      { id: "1", subject: "Write tests", status: "in_progress" },
    ]);
  });

  test("status: deleted removes the task from the board", () => {
    const file = writeTranscript([
      assistantToolUse("tu_1", "TaskCreate", { subject: "Write tests" }),
      userToolResult("tu_1", "Task #1 created successfully: Write tests"),
      assistantToolUse("tu_2", "TaskUpdate", { taskId: "1", status: "deleted" }),
    ]);

    expect(parseTranscriptFile(file, "f")?.taskBoard).toEqual([]);
  });

  test("an update for an unknown task id with no subject is dropped (can't reconstruct it)", () => {
    const file = writeTranscript([assistantToolUse("tu_1", "TaskUpdate", { taskId: "99", status: "completed" })]);

    expect(parseTranscriptFile(file, "f")?.taskBoard).toEqual([]);
  });
});

describe("parseTranscriptFile taskBoard — TaskList (authoritative overlay)", () => {
  test("overlays full board state from the TaskList result, including tasks this session never created", () => {
    const file = writeTranscript([
      assistantToolUse("tu_1", "TaskList", {}),
      userToolResult(
        "tu_1",
        "#1 [completed] Diff master vs prod: control-plane (diff-control-plane)\n" +
          "#2 [pending] Diff master vs prod: agent-runner-langchain-1\n" +
          "#3 [in_progress] Diff master vs prod: backoffice"
      ),
    ]);

    expect(parseTranscriptFile(file, "f")?.taskBoard).toEqual([
      { id: "1", subject: "Diff master vs prod: control-plane (diff-control-plane)", status: "completed" },
      { id: "2", subject: "Diff master vs prod: agent-runner-langchain-1", status: "pending" },
      { id: "3", subject: "Diff master vs prod: backoffice", status: "in_progress" },
    ]);
  });

  test("keeps a subject that legitimately ends in parenthesized text intact, rather than truncating it as an owner suffix", () => {
    const file = writeTranscript([
      assistantToolUse("tu_1", "TaskList", {}),
      userToolResult("tu_1", "#3 [pending] Diff master vs prod: agent-runner-langchain-1-streaming (helm-streaming variant)"),
    ]);

    expect(parseTranscriptFile(file, "f")?.taskBoard).toEqual([
      {
        id: "3",
        subject: "Diff master vs prod: agent-runner-langchain-1-streaming (helm-streaming variant)",
        status: "pending",
      },
    ]);
  });

  test("refreshes status for a task this session already knew about", () => {
    const file = writeTranscript([
      assistantToolUse("tu_1", "TaskCreate", { subject: "Write tests" }),
      userToolResult("tu_1", "Task #1 created successfully: Write tests"),
      assistantToolUse("tu_2", "TaskList", {}),
      userToolResult("tu_2", "#1 [completed] Write tests"),
    ]);

    expect(parseTranscriptFile(file, "f")?.taskBoard).toEqual([
      { id: "1", subject: "Write tests", status: "completed" },
    ]);
  });

  test("a TaskList result with no parseable lines leaves prior state untouched", () => {
    const file = writeTranscript([
      assistantToolUse("tu_1", "TaskCreate", { subject: "Write tests" }),
      userToolResult("tu_1", "Task #1 created successfully: Write tests"),
      assistantToolUse("tu_2", "TaskList", {}),
      userToolResult("tu_2", "No tasks found."),
    ]);

    expect(parseTranscriptFile(file, "f")?.taskBoard).toEqual([{ id: "1", subject: "Write tests", status: "pending" }]);
  });
});

describe("parseTranscriptFile taskBoard — TaskGet", () => {
  test("applies a single task's detail dump", () => {
    const file = writeTranscript([
      assistantToolUse("tu_1", "TaskGet", { taskId: "2" }),
      userToolResult("tu_1", "Task #2: Diff master vs prod: agent-runner-langchain-1\nStatus: pending\nDescription: find the revision"),
    ]);

    expect(parseTranscriptFile(file, "f")?.taskBoard).toEqual([
      { id: "2", subject: "Diff master vs prod: agent-runner-langchain-1", status: "pending" },
    ]);
  });
});

describe("parseTranscriptFile taskBoard — ordering and unrelated tools", () => {
  test("returns tasks sorted by numeric id regardless of the order they were learned in", () => {
    const file = writeTranscript([
      assistantToolUse("tu_1", "TaskList", {}),
      userToolResult("tu_1", "#3 [pending] third\n#1 [pending] first\n#2 [pending] second"),
    ]);

    expect(parseTranscriptFile(file, "f")?.taskBoard.map((t) => t.id)).toEqual(["1", "2", "3"]);
  });

  test("unrelated tool calls (e.g. Bash) never populate the task board", () => {
    const file = writeTranscript([
      assistantToolUse("tu_1", "Bash", { command: "ls" }),
      userToolResult("tu_1", "file1\nfile2"),
    ]);

    expect(parseTranscriptFile(file, "f")?.taskBoard).toEqual([]);
  });
});
