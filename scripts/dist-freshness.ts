import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Latest mtime (ms) across every file in a directory tree, or `null` when empty/missing. */
function newestMtime(dir: string): number | null {
    if (!existsSync(dir)) {
        return null;
    }

    let newest: number | null = null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        const candidate = entry.isDirectory()
            ? newestMtime(full)
            : statSync(full).mtimeMs;
        if (candidate !== null && (newest === null || candidate > newest)) {
            newest = candidate;
        }
    }
    return newest;
}

/**
 * Decide whether the built UI in `distDir` is stale relative to `srcDir`.
 *
 * Stale when the dist directory is missing/empty, or when any source file is newer than
 * the newest file already in dist — i.e. a rebuild is required to reflect the sources.
 */
export function isDistStale(distDir: string, srcDir: string): boolean {
    const distNewest = newestMtime(distDir);
    if (distNewest === null) {
        return true;
    }

    const srcNewest = newestMtime(srcDir);
    if (srcNewest === null) {
        return false;
    }

    return srcNewest > distNewest;
}
