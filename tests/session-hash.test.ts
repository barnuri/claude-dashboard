import { describe, expect, test } from "bun:test";
import { buildSessionHash, parseSessionHash } from "../packages/web/src/utils/sessionHash";

describe("parseSessionHash", () => {
  test("extracts the id from a session hash", () => {
    expect(parseSessionHash("#/session/abc-123")).toBe("abc-123");
  });

  test("returns null for the empty, root, and unrelated hashes", () => {
    expect(parseSessionHash("")).toBeNull();
    expect(parseSessionHash("#")).toBeNull();
    expect(parseSessionHash("#/other/route")).toBeNull();
  });

  test("returns null when the id segment is empty", () => {
    expect(parseSessionHash("#/session/")).toBeNull();
  });

  test("round-trips ids that need URI encoding", () => {
    const id = "id with spaces/slash";
    expect(parseSessionHash(buildSessionHash(id))).toBe(id);
  });
});
