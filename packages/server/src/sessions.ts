import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  calculateCost,
  resolveModelPricing,
  type DashboardSnapshot,
  type SessionStatus,
  type SessionSummary,
} from "@claude-dashboard/shared";
import { PROJECTS_DIR, WAITING_INPUT_GRACE_MS } from "./config";
import { parseTranscriptFile } from "./transcript";
import { listClaudeProcesses, type ClaudeProcess } from "./processes";
import { PeriodStatsBuilder } from "./stats";
import { getLogPathForPid, pruneDeadLogEntries } from "./logRegistry";

/** Best-effort decode of a Claude Code project directory name back into an absolute path. */
function decodeProjectDirName(dirName: string): string {
  return dirName.startsWith("-") ? dirName.replace(/-/g, "/") : dirName;
}

function normalizePath(p: string): string {
  return p.replace(/\/+$/, "") || "/";
}

interface TranscriptFile {
  filePath: string;
  fallbackId: string;
  projectDirName: string;
  mtimeMs: number;
}

function listTranscriptFiles(): TranscriptFile[] {
  let projectDirs: string[];
  try {
    projectDirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }

  const files: TranscriptFile[] = [];
  for (const dirName of projectDirs) {
    const dirPath = join(PROJECTS_DIR, dirName);
    let entries: string[];
    try {
      entries = readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      const filePath = join(dirPath, name);
      let mtimeMs = 0;
      try {
        mtimeMs = statSync(filePath).mtimeMs;
      } catch {
        continue;
      }
      files.push({ filePath, fallbackId: name.replace(/\.jsonl$/, ""), projectDirName: dirName, mtimeMs });
    }
  }
  return files;
}

/**
 * "waiting_input" ("Needs you") is reserved for a genuine block on the user — an unresolved
 * `AskUserQuestion` call — which can happen even mid-turn (its stop_reason is "tool_use", not
 * "end_turn"), so that check runs before the turnComplete branch. A cleanly finished turn with no
 * pending question is never "waiting_input": it settles into "idle" once a short grace window
 * (absorbing write lag from compaction, subagent/hook activity) has passed with no further
 * transcript activity.
 */
export function deriveStatus(
  hasLivePid: boolean,
  turnComplete: boolean,
  awaitingUserQuestion: boolean,
  lastActivityAt: string | null,
  now: number
): SessionStatus {
  if (!hasLivePid) return "ended";
  if (awaitingUserQuestion) return "waiting_input";
  if (!turnComplete) return "running";
  if (!lastActivityAt) return "idle";

  const elapsedMs = now - Date.parse(lastActivityAt);
  return elapsedMs < WAITING_INPUT_GRACE_MS ? "running" : "idle";
}

export interface TranscriptCandidate {
  filePath: string;
  lastActivityAt: string | null;
}

/**
 * Assigns each live process to the most-recently-active, not-yet-claimed transcript sharing its
 * cwd. There's no real OS-level link between a `claude` process and "which transcript file it's
 * writing to" — this is a best-effort heuristic. Pairing the most-recently-*started* process with
 * the most-recently-*active* transcript (rather than raw, unordered `ps` listing order) is the
 * best signal available when several processes share a cwd.
 */
export function pairProcessesToTranscripts(
  processesByCwd: ReadonlyMap<string, readonly ClaudeProcess[]>,
  transcriptsByCwd: ReadonlyMap<string, readonly TranscriptCandidate[]>
): Map<string, number> {
  const pidByFilePath = new Map<string, number>();
  for (const [cwd, cwdProcesses] of processesByCwd) {
    const pids = cwdProcesses.slice().sort((a, b) => a.startedSecondsAgo - b.startedSecondsAgo);
    const candidates = (transcriptsByCwd.get(cwd) ?? []).slice().sort((a, b) => {
      const aTime = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bTime = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return bTime - aTime;
    });
    for (let i = 0; i < pids.length && i < candidates.length; i++) {
      pidByFilePath.set(candidates[i]!.filePath, pids[i]!.pid);
    }
  }
  return pidByFilePath;
}

const MAX_SESSIONS = 300;

export async function buildDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [transcriptFiles, processes] = await Promise.all([
    Promise.resolve(listTranscriptFiles()),
    listClaudeProcesses(),
  ]);

  const parsedByFile = transcriptFiles
    .map((tf) => ({ tf, parsed: parseTranscriptFile(tf.filePath, tf.fallbackId) }))
    .filter((x): x is { tf: TranscriptFile; parsed: NonNullable<ReturnType<typeof parseTranscriptFile>> } => x.parsed !== null)
    .sort((a, b) => b.tf.mtimeMs - a.tf.mtimeMs)
    .slice(0, MAX_SESSIONS);

  // Group transcripts by resolved cwd so live processes can be matched to the right file.
  const groups = new Map<string, typeof parsedByFile>();
  for (const entry of parsedByFile) {
    const cwd = normalizePath(entry.parsed.cwd ?? decodeProjectDirName(entry.tf.projectDirName));
    const list = groups.get(cwd) ?? [];
    list.push(entry);
    groups.set(cwd, list);
  }

  // Assign each live process to the most-recently-active, not-yet-claimed transcript sharing its cwd.
  const processesByCwd = new Map<string, ClaudeProcess[]>();
  for (const proc of processes) {
    if (!proc.cwd) continue;
    const cwd = normalizePath(proc.cwd);
    const list = processesByCwd.get(cwd) ?? [];
    list.push(proc);
    processesByCwd.set(cwd, list);
  }
  const transcriptsByCwd = new Map<string, TranscriptCandidate[]>();
  for (const [cwd, entries] of groups) {
    transcriptsByCwd.set(
      cwd,
      entries.map((entry) => ({ filePath: entry.tf.filePath, lastActivityAt: entry.parsed.lastActivityAt }))
    );
  }
  const pidByFilePath = pairProcessesToTranscripts(processesByCwd, transcriptsByCwd);

  pruneDeadLogEntries(new Set(processes.map((p) => p.pid)));

  const now = Date.now();
  const sessions: SessionSummary[] = parsedByFile.map(({ tf, parsed }) => {
    const pid = pidByFilePath.get(tf.filePath) ?? null;
    const pricing = resolveModelPricing(parsed.model);
    const cost = calculateCost(
      {
        inputTokens: parsed.usage.inputTokens,
        outputTokens: parsed.usage.outputTokens,
        cacheRead: parsed.usage.cacheReadTokens,
        cacheCreation5m: parsed.usage.cacheCreation5m,
        cacheCreation1h: parsed.usage.cacheCreation1h,
      },
      pricing
    );

    const cwd = parsed.cwd ?? decodeProjectDirName(tf.projectDirName);

    return {
      id: parsed.sessionId,
      cwd,
      projectDirName: tf.projectDirName,
      gitBranch: parsed.gitBranch,
      model: parsed.model,
      cliVersion: parsed.cliVersion,
      title: parsed.title,
      startedAt: parsed.startedAt,
      lastActivityAt: parsed.lastActivityAt,
      status: deriveStatus(pid !== null, parsed.turnComplete, parsed.awaitingUserQuestion, parsed.lastActivityAt, now),
      pid,
      logPath: pid !== null ? getLogPathForPid(pid, cwd) : null,
      lastAction: parsed.lastAction,
      usage: {
        inputTokens: parsed.usage.inputTokens,
        outputTokens: parsed.usage.outputTokens,
        cacheCreationTokens: parsed.usage.cacheCreation5m + parsed.usage.cacheCreation1h,
        cacheReadTokens: parsed.usage.cacheReadTokens,
        contextTokens: parsed.lastTurnContextTokens,
        contextLimit: pricing.contextLimit,
      },
      cost: {
        totalUsd: cost.totalUsd,
        inputUsd: cost.inputUsd,
        outputUsd: cost.outputUsd,
        cacheWriteUsd: cost.cacheWriteUsd,
        cacheReadUsd: cost.cacheReadUsd,
      },
      messageCount: parsed.messageCount,
      transcriptPath: tf.filePath,
      hasPendingPermissionRequest: false,
    };
  });

  sessions.sort((a, b) => {
    const aTime = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
    const bTime = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
    return bTime - aTime;
  });

  const totals = sessions.reduce(
    (acc, s) => {
      acc.totalCostUsd += s.cost.totalUsd;
      acc.totalInputTokens += s.usage.inputTokens;
      acc.totalOutputTokens += s.usage.outputTokens;
      acc.totalCacheReadTokens += s.usage.cacheReadTokens;
      acc.totalCacheCreationTokens += s.usage.cacheCreationTokens;
      if (s.status !== "ended") acc.runningCount += 1;
      return acc;
    },
    {
      sessionCount: sessions.length,
      runningCount: 0,
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
    }
  );

  const statsBuilder = new PeriodStatsBuilder();
  for (const { parsed } of parsedByFile) {
    statsBuilder.addSession(parsed.sessionId, parsed.turns);
  }

  return {
    generatedAt: new Date().toISOString(),
    sessions,
    totals,
    statsByPeriod: statsBuilder.build(),
  };
}
