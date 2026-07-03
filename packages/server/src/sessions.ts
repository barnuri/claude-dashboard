import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  calculateCost,
  resolveModelPricing,
  type DashboardSnapshot,
  type SessionStatus,
  type SessionSummary,
} from "@claude-dashboard/shared";
import { PROJECTS_DIR } from "./config";
import { parseTranscriptFile } from "./transcript";
import { listClaudeProcesses } from "./processes";
import { PeriodStatsBuilder } from "./stats";

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

function deriveStatus(hasLivePid: boolean, turnComplete: boolean): SessionStatus {
  if (!hasLivePid) return "ended";
  return turnComplete ? "waiting_input" : "running";
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
  const pidByFilePath = new Map<string, number>();
  const processesByCwd = new Map<string, number[]>();
  for (const proc of processes) {
    if (!proc.cwd) continue;
    const cwd = normalizePath(proc.cwd);
    const list = processesByCwd.get(cwd) ?? [];
    list.push(proc.pid);
    processesByCwd.set(cwd, list);
  }
  for (const [cwd, pids] of processesByCwd) {
    const candidates = (groups.get(cwd) ?? []).slice().sort((a, b) => {
      const aTime = a.parsed.lastActivityAt ? Date.parse(a.parsed.lastActivityAt) : 0;
      const bTime = b.parsed.lastActivityAt ? Date.parse(b.parsed.lastActivityAt) : 0;
      return bTime - aTime;
    });
    for (let i = 0; i < pids.length && i < candidates.length; i++) {
      pidByFilePath.set(candidates[i]!.tf.filePath, pids[i]!);
    }
  }

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
      startedAt: parsed.startedAt,
      lastActivityAt: parsed.lastActivityAt,
      status: deriveStatus(pid !== null, parsed.turnComplete),
      pid,
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
