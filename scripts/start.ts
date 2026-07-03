import { join } from "node:path";
import type { Subprocess } from "bun";
import { isDistStale } from "./dist-freshness";

/**
 * Runs the dashboard in a production-style-but-live mode from a single command:
 *  1. Builds the web UI first if `packages/web/dist` is missing or stale.
 *  2. Starts the server with `bun --watch` so server-source edits restart it.
 *  3. Runs `vite build --watch` so client-source edits rebuild `dist`, which the running
 *     server then serves.
 * The server serves the built UI and the API/WS on the same port (see the server entry).
 *
 * Defaults to port 3334 so a local `bun start` never collides with an installed system
 * service (which runs on 3333). An explicit `PORT` env var still wins.
 */
export class DevOrchestrator {
    /** Default port for a local run; distinct from the service's 3333. */
    private static readonly LOCAL_PORT = "3334";

    private readonly serverDir: string;
    private readonly webDir: string;
    private readonly webSrc: string;
    private readonly webDist: string;
    private readonly port: string;
    private readonly children: Subprocess[] = [];
    private shuttingDown = false;

    constructor(repoRoot: string) {
        this.serverDir = join(repoRoot, "packages", "server");
        this.webDir = join(repoRoot, "packages", "web");
        this.webSrc = join(this.webDir, "src");
        this.webDist = join(this.webDir, "dist");
        this.port = process.env.PORT ?? DevOrchestrator.LOCAL_PORT;
    }

    async run(): Promise<void> {
        this.installSignalHandlers();
        await this.buildIfStale();
        this.startClientWatcher();
        this.startServerWatcher();
        await this.waitForChildren();
    }

    private async buildIfStale(): Promise<void> {
        if (!isDistStale(this.webDist, this.webSrc)) {
            console.log("[start] web dist is fresh — skipping initial build");
            return;
        }

        console.log("[start] web dist missing or stale — building…");
        const build = Bun.spawn(["bun", "run", "build"], {
            cwd: this.webDir,
            stdout: "inherit",
            stderr: "inherit",
        });
        const code = await build.exited;
        if (code !== 0) {
            throw new Error(`web build failed with exit code ${code}`);
        }
    }

    private startClientWatcher(): void {
        console.log("[start] watching client — rebuilding dist on change");
        this.track(
            Bun.spawn(["bun", "x", "vite", "build", "--watch"], {
                cwd: this.webDir,
                stdout: "inherit",
                stderr: "inherit",
            }),
        );
    }

    private startServerWatcher(): void {
        console.log(`[start] starting server with --watch on port ${this.port}`);
        this.track(
            Bun.spawn(["bun", "--watch", "src/index.ts"], {
                cwd: this.serverDir,
                stdout: "inherit",
                stderr: "inherit",
                env: { ...process.env, PORT: this.port },
            }),
        );
    }

    private track(child: Subprocess): void {
        this.children.push(child);
    }

    private async waitForChildren(): Promise<void> {
        await Promise.race(this.children.map((child) => child.exited));
        this.shutdown();
    }

    private installSignalHandlers(): void {
        const stop = () => this.shutdown();
        process.on("SIGINT", stop);
        process.on("SIGTERM", stop);
    }

    private shutdown(): void {
        if (this.shuttingDown) {
            return;
        }
        this.shuttingDown = true;
        for (const child of this.children) {
            child.kill();
        }
        process.exit(0);
    }
}

if (import.meta.main) {
    const orchestrator = new DevOrchestrator(join(import.meta.dir, ".."));
    await orchestrator.run();
}
