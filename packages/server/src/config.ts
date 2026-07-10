import { homedir } from "node:os";
import { join } from "node:path";

export const CLAUDE_HOME =
    process.env.CLAUDE_HOME ?? join(homedir(), ".claude");
export const PROJECTS_DIR = join(CLAUDE_HOME, "projects");
export const PORT = Number(process.env.PORT ?? 3333);

/** Listen on all network interfaces by default so the dashboard is reachable from other devices on the LAN, not just localhost. */
export const HOST = process.env.HOST ?? "0.0.0.0";

/** Serve synthetic demo data instead of scanning ~/.claude and the process table. */
export const MOCK_MODE = process.env.CLAUDE_DASHBOARD_MOCK === "1";

/** Directory holding the built web UI (`vite build` output) that the server serves. */
export const WEB_DIST =
    process.env.WEB_DIST ??
    join(import.meta.dir, "..", "..", "web", "dist");

/** How often to re-scan the process table and rebuild the dashboard snapshot. */
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 2000);

/** Grace period after a turn looks complete before reporting "waiting_input" — absorbs write lag from compaction, subagent/hook activity, etc. */
export const WAITING_INPUT_GRACE_MS = Number(process.env.WAITING_INPUT_GRACE_MS ?? 6000);
