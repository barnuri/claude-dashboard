import { describe, expect, test } from "bun:test";
import { ServiceManager } from "../scripts/service";

const paths = {
    bunPath: "/usr/local/bin/bun",
    repoRoot: "/home/user/claude-dashboard",
    logDir: "/home/user/.claude-dashboard/logs",
};

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
});
