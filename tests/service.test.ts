import { describe, expect, spyOn, test } from "bun:test";
import { ServiceManager } from "../scripts/service";

const paths = {
    bunPath: "/usr/local/bin/bun",
    repoRoot: "/home/user/claude-dashboard",
    logDir: "/home/user/.claude-dashboard/logs",
};

interface ServiceManagerInternals {
    isLaunchdLoaded(uid: number): Promise<boolean>;
    waitUntilLaunchdUnloaded(uid: number, timeoutMs?: number, pollIntervalMs?: number): Promise<void>;
    bootstrapLaunchdWithRetry(uid: number, plistPath: string, attempts?: number): Promise<void>;
    installLaunchd(): Promise<void>;
}

function internals(manager: ServiceManager): ServiceManagerInternals {
    return manager as unknown as ServiceManagerInternals;
}

/** Stubs `ServiceManager`'s injected spawn dependency so launchd tests never shell out for real. */
function createSpawnStub(handler: (cmd: readonly string[]) => number) {
    const calls: string[][] = [];
    const spawn = (cmd: readonly string[]) => {
        calls.push([...cmd]);
        return { exited: Promise.resolve(handler(cmd)) };
    };
    return { spawn, calls };
}

describe("ServiceManager.buildLaunchdPlist", () => {
    const plist = new ServiceManager(paths, "darwin").buildLaunchdPlist();

    test("includes the KeepAlive watchdog flag", () => {
        expect(plist).toContain("<key>KeepAlive</key>");
        expect(plist).toContain("<true/>");
    });

    test("starts at login via RunAtLoad", () => {
        expect(plist).toContain("<key>RunAtLoad</key>");
    });

    test("runs bun with the repo working directory", () => {
        expect(plist).toContain(`<string>${paths.bunPath}</string>`);
        expect(plist).toContain(`<string>${paths.repoRoot}</string>`);
        expect(plist).toContain("<string>serve</string>");
    });

    test("points logs at the configured log directory", () => {
        expect(plist).toContain(`${paths.logDir}/service.out.log`);
        expect(plist).toContain(`${paths.logDir}/service.err.log`);
    });

    test("pins the service to port 3333 via EnvironmentVariables", () => {
        expect(plist).toContain("<key>EnvironmentVariables</key>");
        expect(plist).toContain("<key>PORT</key>");
        expect(plist).toContain("<string>3333</string>");
    });
});

describe("ServiceManager.buildSystemdUnit", () => {
    const unit = new ServiceManager(paths, "linux").buildSystemdUnit();

    test("always restarts as its watchdog", () => {
        expect(unit).toContain("Restart=always");
    });

    test("runs bun serve from the repo root", () => {
        expect(unit).toContain(`WorkingDirectory=${paths.repoRoot}`);
        expect(unit).toContain(`ExecStart=${paths.bunPath} run serve`);
    });

    test("installs into the default login target", () => {
        expect(unit).toContain("WantedBy=default.target");
    });

    test("pins the service to port 3333 via Environment", () => {
        expect(unit).toContain("Environment=PORT=3333");
    });
});

describe("ServiceManager launchd race-condition handling", () => {
    test("waitUntilLaunchdUnloaded returns once isLaunchdLoaded flips to false", async () => {
        let printCalls = 0;
        const { spawn } = createSpawnStub((cmd) => {
            if (cmd[1] !== "print") {
                return 0;
            }
            printCalls++;
            return printCalls < 3 ? 0 : 1;
        });
        const manager = new ServiceManager(paths, "darwin", spawn);

        await internals(manager).waitUntilLaunchdUnloaded(501, 1000, 5);

        expect(printCalls).toBe(3);
    });

    test("bootstrapLaunchdWithRetry retries on transient failure and succeeds within attempts", async () => {
        let bootstrapCalls = 0;
        const { spawn } = createSpawnStub((cmd) => {
            if (cmd[1] !== "bootstrap") {
                return 0;
            }
            bootstrapCalls++;
            return bootstrapCalls < 2 ? 1 : 0;
        });
        const manager = new ServiceManager(paths, "darwin", spawn);

        await internals(manager).bootstrapLaunchdWithRetry(501, "/tmp/fake.plist", 3);

        expect(bootstrapCalls).toBe(2);
    });

    test("bootstrapLaunchdWithRetry throws after exhausting all attempts", async () => {
        const { spawn, calls } = createSpawnStub(() => 1);
        const manager = new ServiceManager(paths, "darwin", spawn);

        await expect(internals(manager).bootstrapLaunchdWithRetry(501, "/tmp/fake.plist", 2)).rejects.toThrow(/command failed/);
        expect(calls.filter((cmd) => cmd[1] === "bootstrap")).toHaveLength(2);
    });

    test("restart falls back to installLaunchd() when the agent is not currently loaded", async () => {
        const { spawn, calls } = createSpawnStub((cmd) => (cmd[1] === "print" ? 1 : 0));
        const manager = new ServiceManager(paths, "darwin", spawn);
        const installSpy = spyOn(internals(manager), "installLaunchd").mockImplementation(async () => {});

        await manager.restart();

        expect(installSpy).toHaveBeenCalledTimes(1);
        expect(calls.some((cmd) => cmd[1] === "kickstart")).toBe(false);
        installSpy.mockRestore();
    });
});

describe("ServiceManager platform guards", () => {
    test("install rejects an unsupported platform", async () => {
        const manager = new ServiceManager(paths, "win32");
        await expect(manager.install()).rejects.toThrow(/Unsupported platform/);
    });

    test("uninstall rejects an unsupported platform", async () => {
        const manager = new ServiceManager(paths, "win32");
        await expect(manager.uninstall()).rejects.toThrow(/Unsupported platform/);
    });

    test("restart rejects an unsupported platform", async () => {
        const manager = new ServiceManager(paths, "win32");
        await expect(manager.restart()).rejects.toThrow(/Unsupported platform/);
    });
});
