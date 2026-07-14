import { describe, expect, test } from "bun:test";
import { deriveStatus } from "../packages/server/src/sessions";

describe("deriveStatus", () => {
  test("no live pid is always ended, regardless of turn state", () => {
    expect(deriveStatus(false, true, false, new Date().toISOString(), Date.now())).toBe("ended");
    expect(deriveStatus(false, false, false, null, Date.now())).toBe("ended");
  });

  test("live pid with an incomplete turn is running", () => {
    expect(deriveStatus(true, false, false, new Date().toISOString(), Date.now())).toBe("running");
  });

  test("turn just completed is running, not waiting_input, inside the grace window", () => {
    const now = Date.parse("2026-07-06T12:00:05.000Z");
    const lastActivityAt = "2026-07-06T12:00:00.000Z"; // 5s ago, grace default is 6000ms
    expect(deriveStatus(true, true, false, lastActivityAt, now)).toBe("running");
  });

  test("turn completed with no pending question settles into idle past the grace window, never waiting_input", () => {
    const now = Date.parse("2026-07-06T12:00:10.000Z");
    const lastActivityAt = "2026-07-06T12:00:00.000Z"; // 10s ago
    expect(deriveStatus(true, true, false, lastActivityAt, now)).toBe("idle");
  });

  test("turn complete with no lastActivityAt and no pending question skips the debounce and reports idle", () => {
    expect(deriveStatus(true, true, false, null, Date.now())).toBe("idle");
  });

  test("an unresolved AskUserQuestion is waiting_input even though the turn is not complete", () => {
    expect(deriveStatus(true, false, true, new Date().toISOString(), Date.now())).toBe("waiting_input");
  });

  test("an unresolved AskUserQuestion stays waiting_input regardless of elapsed idle time", () => {
    const now = Date.parse("2026-07-06T12:00:10.000Z");
    const lastActivityAt = "2026-07-06T12:00:00.000Z";
    expect(deriveStatus(true, true, true, lastActivityAt, now)).toBe("waiting_input");
  });
});
