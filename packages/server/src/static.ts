import { existsSync, statSync } from "node:fs";
import { normalize, join, resolve, sep } from "node:path";

/**
 * Serves the built web UI (a `vite build` output directory) as static files, with
 * single-page-app fallback: any path that does not resolve to a real file inside the
 * root returns `index.html`, so client-side routes work on direct navigation.
 *
 * Path traversal is blocked — a resolved path that escapes the root is rejected.
 */
export class StaticFileServer {
    private readonly root: string;

    constructor(root: string) {
        this.root = resolve(root);
    }

    /** True when the configured root directory actually exists on disk. */
    hasRoot(): boolean {
        return existsSync(this.root);
    }

    /**
     * Resolve a request URL pathname to an absolute file path within the root, or `null`
     * when the path escapes the root. Falls back to `index.html` for anything that is not
     * an existing file (SPA routing).
     */
    resolve(pathname: string): string | null {
        const decoded = this.safeDecode(pathname);
        if (decoded === null) {
            return null;
        }

        const relative = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
        const candidate = resolve(join(this.root, relative));
        if (!this.isInsideRoot(candidate)) {
            return null;
        }

        if (this.isFile(candidate)) {
            return candidate;
        }

        return join(this.root, "index.html");
    }

    /** Build a `Response` for the given pathname, or `null` when the path is rejected. */
    async serve(pathname: string): Promise<Response | null> {
        const filePath = this.resolve(pathname);
        if (filePath === null) {
            return null;
        }

        const file = Bun.file(filePath);
        if (!(await file.exists())) {
            return new Response("Not found", { status: 404 });
        }

        return new Response(file, { headers: { "Cache-Control": this.cacheControlFor(filePath) } });
    }

    /**
     * Vite content-hashes filenames under `assets/`, so a given filename's content never
     * changes and can be cached forever. Everything else (`index.html`, the SPA fallback,
     * unhashed files like `favicon.svg`) must always revalidate — otherwise a browser holding
     * a stale `index.html` after a rebuild will reference deleted hashed asset filenames and
     * 404, leaving a blank page.
     */
    private cacheControlFor(filePath: string): string {
        const relative = filePath.slice(this.root.length + 1);
        const isHashedAsset = relative.split(sep)[0] === "assets";
        return isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache";
    }

    private safeDecode(pathname: string): string | null {
        try {
            return decodeURIComponent(pathname);
        } catch {
            return null;
        }
    }

    private isInsideRoot(candidate: string): boolean {
        return candidate === this.root || candidate.startsWith(this.root + sep);
    }

    private isFile(candidate: string): boolean {
        return existsSync(candidate) && statSync(candidate).isFile();
    }
}
