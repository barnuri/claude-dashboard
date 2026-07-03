import { homedir } from "node:os";
import { join } from "node:path";

export const CLAUDE_HOME = process.env.CLAUDE_HOME ?? join(homedir(), ".claude");
export const PROJECTS_DIR = join(CLAUDE_HOME, "projects");
export const PORT = Number(process.env.PORT ?? 4317);

/** How often to re-scan the process table and rebuild the dashboard snapshot. */
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 2000);
