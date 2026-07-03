import { describe, expect, test } from "bun:test";
import { folderColor } from "../packages/web/src/utils/folderColor";

describe("folderColor", () => {
  test("is deterministic — same path always yields the same color", () => {
    const a = folderColor("/home/dev/projects/payments-api");
    const b = folderColor("/home/dev/projects/payments-api");
    expect(a).toBe(b);
  });

  test("returns a hex color string", () => {
    expect(folderColor("/any/path")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("different folders can map to different colors", () => {
    const colors = new Set(
      ["/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h"].map((p) => folderColor(p))
    );
    // With 8 distinct inputs against a 12-color palette we expect more than one bucket.
    expect(colors.size).toBeGreaterThan(1);
  });

  test("the empty path is handled without throwing", () => {
    expect(() => folderColor("")).not.toThrow();
    expect(folderColor("")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
