import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTranscriptFeed } from "../packages/server/src/transcript";

const tempDirs: string[] = [];

function writeTranscript(lines: object[]): string {
  const dir = mkdtempSync(join(tmpdir(), "transcript-feed-"));
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

const AT = "2026-07-26T12:00:00.000Z";

function assistantLine(content: object[]): object {
  return { type: "assistant", timestamp: AT, message: { content } };
}

function userLine(content: object[] | string): object {
  return { type: "user", timestamp: AT, message: { content } };
}

describe("getTranscriptFeed", () => {
  test("emits one item per content block, not just the first", () => {
    const file = writeTranscript([
      assistantLine([
        { type: "text", text: "Let me check that file." },
        { type: "tool_use", name: "Read", input: { file_path: "/tmp/a.ts" } },
      ]),
    ]);

    const feed = getTranscriptFeed(file);
    expect(feed).toHaveLength(2);
    expect(feed[0].type).toBe("text");
    expect(feed[1].type).toBe("tool_use");
    expect(feed[1].toolName).toBe("Read");
  });

  test("attaches full detail for long text while summary stays truncated", () => {
    const longText = "x".repeat(500);
    const file = writeTranscript([assistantLine([{ type: "text", text: longText }])]);

    const feed = getTranscriptFeed(file);
    expect(feed[0].summary.length).toBeLessThan(150);
    expect(feed[0].detail).toBe(longText);
  });

  test("caps detail at 4000 chars with ellipsis", () => {
    const hugeText = "y".repeat(10_000);
    const file = writeTranscript([assistantLine([{ type: "text", text: hugeText }])]);

    const feed = getTranscriptFeed(file);
    expect(feed[0].detail?.length).toBe(4000);
    expect(feed[0].detail?.endsWith("…")).toBe(true);
  });

  test("carries toolUseId on tool_use and tool_result items for client-side pairing", () => {
    const file = writeTranscript([
      assistantLine([
        { type: "tool_use", id: "tu_1", name: "Read", input: { file_path: "/a" } },
        { type: "tool_use", id: "tu_2", name: "Read", input: { file_path: "/b" } },
      ]),
      userLine([{ type: "tool_result", tool_use_id: "tu_1", content: "result A" }]),
      userLine([{ type: "tool_result", tool_use_id: "tu_2", content: "result B" }]),
    ]);

    const feed = getTranscriptFeed(file);
    expect(feed.map((f) => f.toolUseId)).toEqual(["tu_1", "tu_2", "tu_1", "tu_2"]);
  });

  test("attaches detail for tool results and plain-string user messages", () => {
    const file = writeTranscript([
      userLine([{ type: "tool_result", content: "tool output body", is_error: false }]),
      userLine("please fix the bug"),
    ]);

    const feed = getTranscriptFeed(file);
    expect(feed[0].type).toBe("tool_result");
    expect(feed[0].detail).toBe("tool output body");
    expect(feed[1].type).toBe("user_message");
    expect(feed[1].detail).toBe("please fix the bug");
  });

  test("skips meta lines and unparsable lines, honors limit", () => {
    const lines: object[] = [{ type: "queue-operation", timestamp: AT }];
    for (let i = 0; i < 5; i++) {
      lines.push(assistantLine([{ type: "text", text: `turn ${i}` }]));
    }
    const file = writeTranscript(lines);
    writeFileSync(file, `not json\n${lines.map((l) => JSON.stringify(l)).join("\n")}`);

    const feed = getTranscriptFeed(file, 3);
    expect(feed).toHaveLength(3);
    expect(feed[2].summary).toBe("turn 4");
  });

  test("returns empty array for a missing file", () => {
    expect(getTranscriptFeed("/nonexistent/nope.jsonl")).toEqual([]);
  });
});
