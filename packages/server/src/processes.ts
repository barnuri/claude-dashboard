import { readlinkSync } from "node:fs";
import type { KillOutcome } from "@claude-dashboard/shared";

export interface ClaudeProcess {
  pid: number;
  command: string;
  cwd: string | null;
  /** Seconds since the process started — used to disambiguate which of several processes sharing a cwd is the most recent. */
  startedSecondsAgo: number;
}

function looksLikeClaudeBinary(firstToken: string): boolean {
  const base = firstToken.split("/").pop() ?? firstToken;
  return base === "claude" || base === "claude.exe";
}

/** Parse `ps`'s `etime` column (`[[dd-]hh:]mm:ss`) into total elapsed seconds. */
export function parseElapsedSeconds(etime: string): number {
  const dayMatch = etime.match(/^(\d+)-(.+)$/);
  const days = dayMatch ? Number(dayMatch[1]) : 0;
  const rest = dayMatch ? dayMatch[2]! : etime;
  const parts = rest.split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) return 0;
  const seconds =
    parts.length === 3
      ? parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
      : parts.length === 2
        ? parts[0]! * 60 + parts[1]!
        : parts[0] ?? 0;
  return days * 86400 + seconds;
}

function getCwdForPid(pid: number): string | null {
  if (process.platform === "linux") {
    try {
      return readlinkSync(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  }
  if (process.platform === "darwin") {
    try {
      const proc = Bun.spawnSync(["lsof", "-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
      const out = proc.stdout.toString();
      const line = out.split("\n").find((l) => l.startsWith("n"));
      return line ? line.slice(1) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Scan the process table for running `claude` CLI processes and resolve each one's working directory. */
export async function listClaudeProcesses(): Promise<ClaudeProcess[]> {
  const args =
    process.platform === "darwin"
      ? ["ps", "-axo", "pid=,etime=,command="]
      : ["ps", "-eo", "pid=,etime=,args="];

  let output: string;
  try {
    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "ignore" });
    output = await new Response(proc.stdout).text();
    await proc.exited;
  } catch {
    return [];
  }

  const results: ClaudeProcess[] = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const startedSecondsAgo = parseElapsedSeconds(match[2]!);
    const command = match[3] ?? "";
    const firstToken = command.split(/\s+/, 1)[0] ?? "";
    if (!looksLikeClaudeBinary(firstToken)) continue;
    // Exclude this dashboard's own shell/setup wrappers that merely reference "claude" in passing.
    if (pid === process.pid) continue;
    results.push({ pid, command, cwd: getCwdForPid(pid), startedSecondsAgo });
  }
  return results;
}

export function killProcess(pid: number, signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): KillOutcome {
  try {
    process.kill(pid, signal);
    return "killed";
  } catch (err: any) {
    if (err?.code === "ESRCH") return "not_found";
    if (err?.code === "EPERM") return "permission_denied";
    return "error";
  }
}
