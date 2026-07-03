import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CreateSessionRequest, CreateSessionResponse } from "@claude-dashboard/shared";

const LOG_DIR = join(homedir(), ".claude-dashboard", "logs");

export class LaunchError extends Error {}

/**
 * Spawn `claude` as a detached, non-interactive background process in the requested directory.
 * The run shows up in the dashboard like any other session once it writes its transcript file.
 * To attach interactively afterwards, run `claude --resume <sessionId>` in a real terminal.
 */
export async function launchSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
  const cwd = req.cwd?.trim();
  if (!cwd) throw new LaunchError("cwd is required");
  if (!req.prompt?.trim()) throw new LaunchError("prompt is required");
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw new LaunchError(`Directory does not exist: ${cwd}`);
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = join(LOG_DIR, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.log`);

  const args = ["claude", "-p", req.prompt];
  if (req.model) args.push("--model", req.model);
  if (req.permissionMode) args.push("--permission-mode", req.permissionMode);

  let proc;
  try {
    proc = Bun.spawn(args, {
      cwd,
      stdin: "ignore",
      stdout: Bun.file(logPath),
      stderr: Bun.file(logPath),
      env: process.env,
    });
  } catch (err: any) {
    throw new LaunchError(`Failed to spawn claude: ${err?.message ?? err}`);
  }

  proc.unref();

  return { pid: proc.pid, cwd, logPath };
}
