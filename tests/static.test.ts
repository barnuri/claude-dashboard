import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StaticFileServer } from "../packages/server/src/static";

const tempDirs: string[] = [];

function makeDist(): string {
    const root = mkdtempSync(join(tmpdir(), "static-server-"));
    tempDirs.push(root);
    mkdirSync(join(root, "assets"), { recursive: true });
    writeFileSync(join(root, "index.html"), "<html></html>");
    writeFileSync(join(root, "assets", "app.js"), "console.log(1)");
    return root;
}

afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe("StaticFileServer.resolve", () => {
    test("resolves an existing nested asset", () => {
        const root = makeDist();
        const server = new StaticFileServer(root);

        expect(server.resolve("/assets/app.js")).toBe(join(root, "assets", "app.js"));
    });

    test("serves index.html for the root path", () => {
        const root = makeDist();
        const server = new StaticFileServer(root);

        expect(server.resolve("/")).toBe(join(root, "index.html"));
    });

    test("SPA-falls back to index.html for unknown routes", () => {
        const root = makeDist();
        const server = new StaticFileServer(root);

        expect(server.resolve("/sessions/abc123")).toBe(join(root, "index.html"));
    });

    test("blocks path traversal via ../", () => {
        const root = makeDist();
        const server = new StaticFileServer(root);

        expect(server.resolve("/../../etc/passwd")).toBe(join(root, "index.html"));
    });

    test("rejects encoded traversal that escapes the root", () => {
        const root = makeDist();
        const server = new StaticFileServer(root);

        const resolved = server.resolve("/%2e%2e/%2e%2e/secret");
        expect(resolved).toBe(join(root, "index.html"));
    });

    test("returns null for malformed percent-encoding", () => {
        const root = makeDist();
        const server = new StaticFileServer(root);

        expect(server.resolve("/%E0%A4%A")).toBeNull();
    });

    test("hasRoot reflects directory existence", () => {
        const root = makeDist();
        expect(new StaticFileServer(root).hasRoot()).toBe(true);
        expect(new StaticFileServer(join(root, "nope")).hasRoot()).toBe(false);
    });
});

describe("StaticFileServer.serve cache headers", () => {
    test("hashed assets are cached forever and immutable", async () => {
        const root = makeDist();
        const server = new StaticFileServer(root);

        const response = await server.serve("/assets/app.js");

        expect(response?.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    });

    test("index.html always revalidates, so a stale copy can't reference deleted assets", async () => {
        const root = makeDist();
        const server = new StaticFileServer(root);

        const response = await server.serve("/");

        expect(response?.headers.get("Cache-Control")).toBe("no-cache");
    });

    test("the SPA fallback (unknown route -> index.html) also always revalidates", async () => {
        const root = makeDist();
        const server = new StaticFileServer(root);

        const response = await server.serve("/sessions/abc123");

        expect(response?.headers.get("Cache-Control")).toBe("no-cache");
    });
});
