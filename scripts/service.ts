import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

interface ServicePaths {
    readonly bunPath: string;
    readonly repoRoot: string;
    readonly logDir: string;
}

/**
 * Installs, uninstalls, and generates the OS service definition that keeps the dashboard
 * running on boot/login with an always-restart watchdog:
 *  - macOS → a launchd user agent (`KeepAlive` + `RunAtLoad`).
 *  - Linux → a systemd user unit (`Restart=always`).
 * The service runs `bun run serve`, which serves the built UI plus API/WS on the port.
 */
export class ServiceManager {
    private static readonly LABEL = "com.claude-dashboard.server";
    /** The installed service always listens on 3333; local `bun start` uses 3334. */
    private static readonly SERVICE_PORT = "3333";

    private readonly paths: ServicePaths;
    private readonly os: NodeJS.Platform;

    constructor(paths: ServicePaths, os: NodeJS.Platform = platform()) {
        this.paths = paths;
        this.os = os;
    }

    /** launchd plist XML that runs the server, restarts it on exit, and starts at login. */
    buildLaunchdPlist(): string {
        const { bunPath, repoRoot, logDir } = this.paths;
        return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${ServiceManager.LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${bunPath}</string>
        <string>run</string>
        <string>serve</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${repoRoot}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>${ServiceManager.SERVICE_PORT}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${join(logDir, "service.out.log")}</string>
    <key>StandardErrorPath</key>
    <string>${join(logDir, "service.err.log")}</string>
</dict>
</plist>
`;
    }

    /** systemd user unit that runs the server and restarts it whenever it stops. */
    buildSystemdUnit(): string {
        const { bunPath, repoRoot } = this.paths;
        return `[Unit]
Description=Claude Sessions Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=${repoRoot}
Environment=PORT=${ServiceManager.SERVICE_PORT}
ExecStart=${bunPath} run serve
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
`;
    }

    async install(): Promise<void> {
        if (this.os === "darwin") {
            mkdirSync(this.paths.logDir, { recursive: true });
            await this.installLaunchd();
            return;
        }
        if (this.os === "linux") {
            mkdirSync(this.paths.logDir, { recursive: true });
            await this.installSystemd();
            return;
        }
        throw new Error(`Unsupported platform for service install: ${this.os}`);
    }

    async uninstall(): Promise<void> {
        if (this.os === "darwin") {
            await this.uninstallLaunchd();
            return;
        }
        if (this.os === "linux") {
            await this.uninstallSystemd();
            return;
        }
        throw new Error(`Unsupported platform for service uninstall: ${this.os}`);
    }

    /**
     * Restart the running service so it picks up the latest code on disk. The service runs
     * from the repo, so a code change only needs the server restarted (and the web UI
     * rebuilt if the client changed) — not a full reinstall.
     */
    async restart(): Promise<void> {
        if (this.os === "darwin") {
            const uid = process.getuid?.() ?? 0;
            await this.runLaunchctl(["kickstart", "-k", `gui/${uid}/${ServiceManager.LABEL}`], false);
            console.log("[service] restarted launchd agent");
            return;
        }
        if (this.os === "linux") {
            await this.runSystemctl(["restart", `${ServiceManager.LABEL}.service`]);
            console.log("[service] restarted systemd unit");
            return;
        }
        throw new Error(`Unsupported platform for service restart: ${this.os}`);
    }

    private launchdPlistPath(): string {
        return join(homedir(), "Library", "LaunchAgents", `${ServiceManager.LABEL}.plist`);
    }

    private systemdUnitPath(): string {
        return join(homedir(), ".config", "systemd", "user", `${ServiceManager.LABEL}.service`);
    }

    private async installLaunchd(): Promise<void> {
        const plistPath = this.launchdPlistPath();
        mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
        await this.runLaunchctl(["bootout", `gui/${process.getuid?.() ?? 0}/${ServiceManager.LABEL}`], true);
        writeFileSync(plistPath, this.buildLaunchdPlist());
        await this.runLaunchctl(["bootstrap", `gui/${process.getuid?.() ?? 0}`, plistPath], false);
        console.log(`[service] installed launchd agent at ${plistPath}`);
        console.log(`[service] dashboard will start at login and be kept alive by launchd`);
    }

    private async uninstallLaunchd(): Promise<void> {
        const plistPath = this.launchdPlistPath();
        await this.runLaunchctl(["bootout", `gui/${process.getuid?.() ?? 0}/${ServiceManager.LABEL}`], true);
        if (existsSync(plistPath)) {
            rmSync(plistPath);
        }
        console.log(`[service] removed launchd agent ${ServiceManager.LABEL}`);
    }

    private async installSystemd(): Promise<void> {
        const unitPath = this.systemdUnitPath();
        mkdirSync(join(homedir(), ".config", "systemd", "user"), { recursive: true });
        writeFileSync(unitPath, this.buildSystemdUnit());
        await this.runSystemctl(["daemon-reload"]);
        await this.runSystemctl(["enable", "--now", `${ServiceManager.LABEL}.service`]);
        console.log(`[service] installed systemd user unit at ${unitPath}`);
        console.log(`[service] dashboard enabled at login and restarted on failure`);
    }

    private async uninstallSystemd(): Promise<void> {
        const unitPath = this.systemdUnitPath();
        await this.runSystemctl(["disable", "--now", `${ServiceManager.LABEL}.service`], true);
        if (existsSync(unitPath)) {
            rmSync(unitPath);
        }
        await this.runSystemctl(["daemon-reload"], true);
        console.log(`[service] removed systemd user unit ${ServiceManager.LABEL}`);
    }

    private async runLaunchctl(args: readonly string[], ignoreFailure: boolean): Promise<void> {
        await this.run(["launchctl", ...args], ignoreFailure);
    }

    private async runSystemctl(args: readonly string[], ignoreFailure = false): Promise<void> {
        await this.run(["systemctl", "--user", ...args], ignoreFailure);
    }

    private async run(cmd: readonly string[], ignoreFailure: boolean): Promise<void> {
        const proc = Bun.spawn([...cmd], { stdout: "inherit", stderr: "inherit" });
        const code = await proc.exited;
        if (code !== 0 && !ignoreFailure) {
            throw new Error(`command failed (${code}): ${cmd.join(" ")}`);
        }
    }
}

const action = process.argv[2];
if (import.meta.main) {
    if (action !== "install" && action !== "uninstall" && action !== "restart") {
        console.error("usage: bun run scripts/service.ts <install|uninstall|restart>");
        process.exit(1);
    }

    const manager = new ServiceManager({
        bunPath: process.execPath,
        repoRoot: join(import.meta.dir, ".."),
        logDir: join(homedir(), ".claude-dashboard", "logs"),
    });

    if (action === "install") {
        await manager.install();
    } else if (action === "uninstall") {
        await manager.uninstall();
    } else {
        await manager.restart();
    }
}
