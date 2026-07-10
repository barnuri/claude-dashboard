import { afterEach, describe, expect, test } from "bun:test";
import { getLogPathForPid, pruneDeadLogEntries, registerLaunchedLog } from "../packages/server/src/logRegistry";

const CWD = "/tmp/project";

// The registry is a module-level singleton, so always clear it after each test to avoid
// leaking entries into other tests running in the same process.
afterEach(() => {
  pruneDeadLogEntries(new Set());
});

describe("logRegistry", () => {
  test("returns null for a pid that was never registered", () => {
    expect(getLogPathForPid(999_001, CWD)).toBeNull();
  });

  test("returns the registered log path for a known pid with a matching cwd", () => {
    registerLaunchedLog(999_002, "/tmp/some.log", CWD);
    expect(getLogPathForPid(999_002, CWD)).toBe("/tmp/some.log");
  });

  test("re-registering a pid overwrites its log path", () => {
    registerLaunchedLog(999_003, "/tmp/first.log", CWD);
    registerLaunchedLog(999_003, "/tmp/second.log", CWD);
    expect(getLogPathForPid(999_003, CWD)).toBe("/tmp/second.log");
  });

  test("pruning removes entries whose pid is no longer live", () => {
    registerLaunchedLog(999_004, "/tmp/dead.log", CWD);
    registerLaunchedLog(999_005, "/tmp/alive.log", CWD);
    pruneDeadLogEntries(new Set([999_005]));
    expect(getLogPathForPid(999_004, CWD)).toBeNull();
    expect(getLogPathForPid(999_005, CWD)).toBe("/tmp/alive.log");
  });

  test("rejects a cached entry if the current cwd doesn't match what was registered — guards against pid reuse", () => {
    registerLaunchedLog(999_006, "/tmp/original.log", CWD);
    expect(getLogPathForPid(999_006, "/tmp/a-different-project")).toBeNull();
  });

  test("normalizes trailing slashes when comparing cwd", () => {
    registerLaunchedLog(999_007, "/tmp/some.log", "/tmp/project/");
    expect(getLogPathForPid(999_007, "/tmp/project")).toBe("/tmp/some.log");
  });
});
