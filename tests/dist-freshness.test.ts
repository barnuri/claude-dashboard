import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDistStale } from "../scripts/dist-freshness";

const tempDirs: string[] = [];

function makeRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "dist-freshness-"));
    tempDirs.push(root);
    return root;
}

function writeFileWithMtime(path: string, content: string, mtimeMs: number): void {
    writeFileSync(path, content);
    const seconds = mtimeMs / 1000;
    utimesSync(path, seconds, seconds);
}

afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe("isDistStale", () => {
    test("stale when dist directory is missing", () => {
        const root = makeRoot();
        const src = join(root, "src");
        mkdirSync(src, { recursive: true });
        writeFileSync(join(src, "a.ts"), "x");

        expect(isDistStale(join(root, "dist"), src)).toBe(true);
    });

    test("stale when dist exists but is empty", () => {
        const root = makeRoot();
        const src = join(root, "src");
        const dist = join(root, "dist");
        mkdirSync(src, { recursive: true });
        mkdirSync(dist, { recursive: true });
        writeFileSync(join(src, "a.ts"), "x");

        expect(isDistStale(dist, src)).toBe(true);
    });

    test("stale when a source file is newer than the newest dist file", () => {
        const root = makeRoot();
        const src = join(root, "src");
        const dist = join(root, "dist");
        mkdirSync(src, { recursive: true });
        mkdirSync(dist, { recursive: true });

        writeFileWithMtime(join(dist, "bundle.js"), "old", 1_000_000);
        writeFileWithMtime(join(src, "a.ts"), "new", 2_000_000);

        expect(isDistStale(dist, src)).toBe(true);
    });

    test("fresh when dist is newer than all source files", () => {
        const root = makeRoot();
        const src = join(root, "src");
        const dist = join(root, "dist");
        mkdirSync(src, { recursive: true });
        mkdirSync(dist, { recursive: true });

        writeFileWithMtime(join(src, "a.ts"), "src", 1_000_000);
        writeFileWithMtime(join(dist, "bundle.js"), "built", 2_000_000);

        expect(isDistStale(dist, src)).toBe(false);
    });

    test("fresh when there are no source files", () => {
        const root = makeRoot();
        const src = join(root, "src");
        const dist = join(root, "dist");
        mkdirSync(src, { recursive: true });
        mkdirSync(dist, { recursive: true });
        writeFileSync(join(dist, "bundle.js"), "built");

        expect(isDistStale(dist, src)).toBe(false);
    });

    test("recurses into nested source directories", () => {
        const root = makeRoot();
        const src = join(root, "src");
        const dist = join(root, "dist");
        const nested = join(src, "components");
        mkdirSync(nested, { recursive: true });
        mkdirSync(dist, { recursive: true });

        writeFileWithMtime(join(dist, "bundle.js"), "built", 1_000_000);
        writeFileWithMtime(join(nested, "deep.tsx"), "new", 3_000_000);

        expect(isDistStale(dist, src)).toBe(true);
    });
});
