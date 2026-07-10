import { describe, expect, test } from "bun:test";
import { deriveStatus } from "../packages/server/src/sessions";

describe("deriveStatus", () => {
  test("no live pid is always ended, regardless of turn state", () => {
    expect(deriveStatus(false, true, new Date().toISOString(), Date.now())).toBe("ended");
    expect(deriveStatus(false, false, null, Date.now())).toBe("ended");
  });

  test("live pid with an incomplete turn is running", () => {
    expect(deriveStatus(true, false, new Date().toISOString(), Date.now())).toBe("running");
  });

  test("turn just completed is idle, not waiting_input, inside the grace window", () => {
    const now = Date.parse("2026-07-06T12:00:05.000Z");
    const lastActivityAt = "2026-07-06T12:00:00.000Z"; // 5s ago, grace default is 6000ms
    expect(deriveStatus(true, true, lastActivityAt, now)).toBe("idle");
  });

  test("turn completed and past the grace window is waiting_input", () => {
    const now = Date.parse("2026-07-06T12:00:10.000Z");
    const lastActivityAt = "2026-07-06T12:00:00.000Z"; // 10s ago
    expect(deriveStatus(true, true, lastActivityAt, now)).toBe("waiting_input");
  });

  test("turn complete with no lastActivityAt skips the debounce and reports waiting_input", () => {
    expect(deriveStatus(true, true, null, Date.now())).toBe("waiting_input");
  });
});
