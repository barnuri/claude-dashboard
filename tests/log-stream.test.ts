import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogStreamResponse } from "../packages/server/src/logStream";

function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  return reader.read().then(({ value }) => new TextDecoder().decode(value));
}

describe("createLogStreamResponse", () => {
  test("sends the log file's existing content immediately on connect", async () => {
    const dir = mkdtempSync(join(tmpdir(), "logstream-"));
    const logPath = join(dir, "session.log");
    writeFileSync(logPath, "hello from claude\n");

    const response = createLogStreamResponse(logPath);
    const reader = response.body!.getReader();
    const chunk = await readChunk(reader);
    expect(chunk).toContain("hello from claude");

    reader.cancel();
    rmSync(dir, { recursive: true, force: true });
  });

  test("streams appended content as a follow-up SSE event", async () => {
    const dir = mkdtempSync(join(tmpdir(), "logstream-"));
    const logPath = join(dir, "session.log");
    writeFileSync(logPath, "line one\n");

    const response = createLogStreamResponse(logPath);
    const reader = response.body!.getReader();
    await readChunk(reader); // initial content

    appendFileSync(logPath, "line two\n");
    const chunk = await readChunk(reader);
    expect(chunk).toContain("line two");

    reader.cancel();
    rmSync(dir, { recursive: true, force: true });
  });

  test("uses text/event-stream content type", () => {
    const dir = mkdtempSync(join(tmpdir(), "logstream-"));
    const logPath = join(dir, "session.log");
    writeFileSync(logPath, "");

    const response = createLogStreamResponse(logPath);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    response.body?.cancel();
    rmSync(dir, { recursive: true, force: true });
  });
});
