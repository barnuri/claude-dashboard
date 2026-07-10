import { realpathSync } from "node:fs";

interface LogEntry {
  logPath: string;
  cwd: string;
}

const logEntryByPid = new Map<number, LogEntry>();

/**
 * Resolve symlinks (e.g. macOS's `/tmp` -> `/private/tmp`) so a launch-time cwd and the cwd
 * later reported for the same directory compare equal. Falls back to a trailing-slash-stripped
 * raw path if the directory no longer exists (realpath requires the path to exist).
 */
function normalizeCwd(cwd: string): string {
  const trimmed = cwd.replace(/\/+$/, "") || "/";
  try {
    return realpathSync(trimmed);
  } catch {
    return trimmed;
  }
}

/** Remember which log file a launched `claude` process is writing to, so later snapshot builds can offer it as a live output stream. */
export function registerLaunchedLog(pid: number, logPath: string, cwd: string): void {
  logEntryByPid.set(pid, { logPath, cwd: normalizeCwd(cwd) });
}

/**
 * Look up the log file for a live pid, but only trust the cached entry if the process's current
 * cwd still matches what was recorded at launch time — guards against the OS reusing a pid for an
 * unrelated process before the registry entry is pruned, which would otherwise misattribute one
 * session's output to another.
 */
export function getLogPathForPid(pid: number, currentCwd: string): string | null {
  const entry = logEntryByPid.get(pid);
  if (!entry || entry.cwd !== normalizeCwd(currentCwd)) return null;
  return entry.logPath;
}

/** Drop entries for pids that are no longer running, so this map doesn't grow forever across the server's lifetime. */
export function pruneDeadLogEntries(livePids: ReadonlySet<number>): void {
  for (const pid of logEntryByPid.keys()) {
    if (!livePids.has(pid)) {
      logEntryByPid.delete(pid);
    }
  }
}
