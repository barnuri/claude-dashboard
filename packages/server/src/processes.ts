import { readlinkSync } from "node:fs";

export interface ClaudeProcess {
  pid: number;
  command: string;
  cwd: string | null;
}

function looksLikeClaudeBinary(firstToken: string): boolean {
  const base = firstToken.split("/").pop() ?? firstToken;
  return base === "claude" || base === "claude.exe";
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
  const args = process.platform === "darwin" ? ["ps", "-axo", "pid=,command="] : ["ps", "-eo", "pid=,args="];

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
    const match = line.match(/^(\d+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const command = match[2] ?? "";
    const firstToken = command.split(/\s+/, 1)[0] ?? "";
    if (!looksLikeClaudeBinary(firstToken)) continue;
    // Exclude this dashboard's own shell/setup wrappers that merely reference "claude" in passing.
    if (pid === process.pid) continue;
    results.push({ pid, command, cwd: getCwdForPid(pid) });
  }
  return results;
}

export type KillOutcome = "killed" | "not_found" | "permission_denied" | "error";

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
