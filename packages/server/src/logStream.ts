import { closeSync, openSync, readSync, statSync, watch, type FSWatcher } from "node:fs";

/** Cap the initial payload sent on connect so a large pre-existing log file doesn't get loaded in full. */
const INITIAL_TAIL_BYTES = 64 * 1024;

function readNewBytes(logPath: string, offset: number): { text: string; newOffset: number } {
  const stat = statSync(logPath);
  if (stat.size <= offset) return { text: "", newOffset: offset };

  const length = stat.size - offset;
  const fd = openSync(logPath, "r");
  try {
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, offset);
    return { text: buffer.toString("utf8"), newOffset: stat.size };
  } finally {
    closeSync(fd);
  }
}

/** Stream a launched session's log file to the client as Server-Sent Events: the existing tail first, then new writes as they land. */
export function createLogStreamResponse(logPath: string): Response {
  let offset = 0;
  try {
    offset = Math.max(0, statSync(logPath).size - INITIAL_TAIL_BYTES);
  } catch {
    offset = 0;
  }

  let watcher: FSWatcher | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const sendNewContent = () => {
        let result;
        try {
          result = readNewBytes(logPath, offset);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(message)}\n\n`));
          return;
        }
        offset = result.newOffset;
        if (!result.text) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(result.text)}\n\n`));
      };

      sendNewContent();
      try {
        watcher = watch(logPath, { persistent: false }, sendNewContent);
        watcher.on("error", (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          try {
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(message)}\n\n`));
          } catch {
            // controller may already be closed; nothing more to do
          }
          watcher?.close();
        });
      } catch {
        watcher = null;
      }
    },
    cancel() {
      watcher?.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
