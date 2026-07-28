import {
  calculateCost,
  resolveModelPricing,
  STATS_PERIODS,
  type DashboardSnapshot,
  type PeriodStats,
  type SessionSummary,
  type StatsPeriod,
} from "@claude-dashboard/shared";
import type { FeedResponse } from "../api/client";

const now = () => Date.now();
const isoMinutesAgo = (min: number) => new Date(now() - min * 60_000).toISOString();
const isoSecondsAgo = (sec: number) => new Date(now() - sec * 1000).toISOString();

function usdFor(model: string | null, tokens: { in: number; out: number; cacheRead: number; cache5m: number; cache1h: number }) {
  const pricing = resolveModelPricing(model);
  const cost = calculateCost(
    { inputTokens: tokens.in, outputTokens: tokens.out, cacheRead: tokens.cacheRead, cacheCreation5m: tokens.cache5m, cacheCreation1h: tokens.cache1h },
    pricing
  );
  return { cost, contextLimit: pricing.contextLimit };
}

interface SeedSession extends Omit<SessionSummary, "cost" | "usage"> {
  tokens: { in: number; out: number; cacheRead: number; cache5m: number; cache1h: number };
  /** Fraction (0-1) of the model's context window currently occupied, for the gauge. */
  contextFraction: number;
}

function buildSeedSessions(): SeedSession[] {
  return [
    {
      id: "demo-api-refactor",
      cwd: "/home/dev/projects/payments-api",
      projectDirName: "-home-dev-projects-payments-api",
      gitBranch: "feat/idempotency-keys",
      model: "claude-opus-4-8",
      cliVersion: "2.1.199",
      title: "Add idempotency keys to payments API",
      startedAt: isoMinutesAgo(38),
      lastActivityAt: isoSecondsAgo(4),
      status: "running",
      pid: 48213,
      lastAction: {
        type: "tool_use",
        summary: "Bash: bun test src/payments --coverage",
        toolName: "Bash",
        at: isoSecondsAgo(4),
      },
      messageCount: 61,
      transcriptPath: "~/.claude/projects/-home-dev-projects-payments-api/8f2c1a.jsonl",
      hasPendingPermissionRequest: false,
      logPath: null,
      taskBoard: [],
      lastTurnOutputTokens: null,
      tokens: { in: 9800, out: 61200, cacheRead: 22_400_000, cache5m: 120_000, cache1h: 980_000 },
      contextFraction: 0.4,
    },
    {
      id: "demo-dashboard-ui",
      cwd: "/home/dev/projects/claude-dashboard",
      projectDirName: "-home-dev-projects-claude-dashboard",
      gitBranch: "claude/sessions-dashboard-hwc736",
      model: "claude-sonnet-5",
      cliVersion: "2.1.199",
      title: "Polish the sessions dashboard UI",
      startedAt: isoMinutesAgo(90),
      lastActivityAt: isoSecondsAgo(20),
      status: "waiting_input",
      pid: 51022,
      lastAction: {
        type: "text",
        summary: "Added the token-mix donut chart and wired up the kill confirmation flow. Anything else before I move on?",
        at: isoSecondsAgo(20),
      },
      messageCount: 140,
      transcriptPath: "~/.claude/projects/-home-dev-projects-claude-dashboard/76ef81.jsonl",
      hasPendingPermissionRequest: false,
      logPath: null,
      taskBoard: [],
      lastTurnOutputTokens: null,
      tokens: { in: 8600, out: 97_600, cacheRead: 56_400_000, cache5m: 20_000, cache1h: 832_000 },
      contextFraction: 0.44,
    },
    {
      id: "demo-data-pipeline",
      cwd: "/home/dev/projects/etl-pipeline",
      projectDirName: "-home-dev-projects-etl-pipeline",
      gitBranch: "main",
      model: "claude-sonnet-5",
      cliVersion: "2.1.199",
      title: "Debug nightly ETL pipeline failures",
      startedAt: isoMinutesAgo(15),
      lastActivityAt: isoSecondsAgo(2),
      status: "running",
      pid: 51890,
      lastAction: { type: "thinking", summary: "Thinking…", at: isoSecondsAgo(2) },
      messageCount: 24,
      transcriptPath: "~/.claude/projects/-home-dev-projects-etl-pipeline/9a11bc.jsonl",
      hasPendingPermissionRequest: false,
      logPath: null,
      taskBoard: [],
      lastTurnOutputTokens: null,
      tokens: { in: 3100, out: 14_800, cacheRead: 2_100_000, cache5m: 410_000, cache1h: 0 },
      contextFraction: 0.22,
    },
    {
      id: "demo-mobile-app",
      cwd: "/home/dev/projects/mobile-app",
      projectDirName: "-home-dev-projects-mobile-app",
      gitBranch: "bugfix/push-notifications",
      model: "claude-haiku-4-5",
      cliVersion: "2.1.199",
      title: "Fix push notification delivery on iOS",
      startedAt: isoMinutesAgo(240),
      lastActivityAt: isoMinutesAgo(41),
      status: "ended",
      pid: null,
      lastAction: {
        type: "text",
        summary: "Fixed the notification permission race condition on Android 14 and added a regression test.",
        at: isoMinutesAgo(41),
      },
      messageCount: 33,
      transcriptPath: "~/.claude/projects/-home-dev-projects-mobile-app/c04ef2.jsonl",
      hasPendingPermissionRequest: false,
      logPath: null,
      taskBoard: [],
      lastTurnOutputTokens: null,
      tokens: { in: 4200, out: 21_000, cacheRead: 900_000, cache5m: 0, cache1h: 210_000 },
      contextFraction: 0.31,
    },
    {
      id: "demo-infra-terraform",
      cwd: "/home/dev/projects/infra",
      projectDirName: "-home-dev-projects-infra",
      gitBranch: "main",
      model: "claude-opus-4-8",
      cliVersion: "2.1.199",
      title: "Provision staging cluster with Terraform",
      startedAt: isoMinutesAgo(12),
      lastActivityAt: isoSecondsAgo(9),
      status: "running",
      pid: 52210,
      lastAction: {
        type: "tool_result",
        summary: "Error: Cycle: aws_iam_role.app -> aws_iam_policy.app -> aws_iam_role.app",
        isError: true,
        at: isoSecondsAgo(9),
      },
      messageCount: 18,
      transcriptPath: "~/.claude/projects/-home-dev-projects-infra/e77aa1.jsonl",
      hasPendingPermissionRequest: false,
      logPath: null,
      taskBoard: [],
      lastTurnOutputTokens: null,
      tokens: { in: 5200, out: 9800, cacheRead: 1_200_000, cache5m: 300_000, cache1h: 0 },
      contextFraction: 0.85,
    },
  ];
}

const FEED_TEMPLATES: Record<string, FeedResponse["feed"]> = {};

function buildSnapshot(): DashboardSnapshot {
  const sessions: SessionSummary[] = buildSeedSessions().map((seed) => {
    const { tokens, contextFraction, ...rest } = seed;
    const { cost, contextLimit } = usdFor(seed.model, tokens);
    return {
      ...rest,
      usage: {
        inputTokens: tokens.in,
        outputTokens: tokens.out,
        cacheCreationTokens: tokens.cache5m + tokens.cache1h,
        cacheReadTokens: tokens.cacheRead,
        contextTokens: Math.round(contextLimit * contextFraction),
        contextLimit,
      },
      cost: {
        totalUsd: cost.totalUsd,
        inputUsd: cost.inputUsd,
        outputUsd: cost.outputUsd,
        cacheWriteUsd: cost.cacheWriteUsd,
        cacheReadUsd: cost.cacheReadUsd,
      },
    };
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

  // All mock sessions "started" within the last few hours, so every rolling window
  // (24h/7d/14d/30d/all) sees the same activity — good enough for a static demo.
  const statsByPeriod = Object.fromEntries(
    STATS_PERIODS.map((period): [StatsPeriod, PeriodStats] => [
      period,
      {
        period,
        sessionCount: totals.sessionCount,
        totalCostUsd: totals.totalCostUsd,
        totalInputTokens: totals.totalInputTokens,
        totalOutputTokens: totals.totalOutputTokens,
        totalCacheReadTokens: totals.totalCacheReadTokens,
        totalCacheCreationTokens: totals.totalCacheCreationTokens,
      },
    ])
  ) as Record<StatsPeriod, PeriodStats>;

  return { generatedAt: new Date().toISOString(), sessions, totals, statsByPeriod };
}

const DEMO_FEED: FeedResponse["feed"] = [
  { role: "user", type: "user_message", summary: "Add retry with backoff to the webhook dispatcher.", at: isoMinutesAgo(6) },
  { role: "assistant", type: "thinking", summary: "Thinking…", at: isoMinutesAgo(6) },
  { role: "assistant", type: "text", summary: "I'll add exponential backoff with jitter and cap retries at 5.", at: isoMinutesAgo(6) },
  { role: "assistant", type: "tool_use", summary: "Edit: src/webhooks/dispatcher.ts", toolName: "Edit", at: isoMinutesAgo(5) },
  { role: "user", type: "tool_result", summary: "Applied 1 edit to dispatcher.ts", at: isoMinutesAgo(5) },
  { role: "assistant", type: "tool_use", summary: "Bash: bun test src/webhooks", toolName: "Bash", at: isoMinutesAgo(4) },
  { role: "user", type: "tool_result", summary: "12 pass, 0 fail", at: isoMinutesAgo(4) },
  { role: "assistant", type: "text", summary: "All webhook tests pass. Want me to also add a metrics counter for retried deliveries?", at: isoSecondsAgo(20) },
];

/**
 * A tiny in-memory "backend" used only for the static GitHub Pages build, where there's no
 * real Bun server or filesystem to read from. State mutates locally (kill/launch/ticking
 * token counters) so the UI feels alive without a network round trip.
 */
class DemoStore {
  private snapshot: DashboardSnapshot = buildSnapshot();
  private listeners = new Set<(snapshot: DashboardSnapshot) => void>();

  constructor() {
    setInterval(() => this.tick(), 2500);
  }

  private tick() {
    this.snapshot = {
      ...this.snapshot,
      generatedAt: new Date().toISOString(),
      sessions: this.snapshot.sessions.map((s) => {
        if (s.status === "ended") return s;
        const bump = Math.random() < 0.7;
        const outputTokens = s.usage.outputTokens + (bump ? Math.floor(Math.random() * 400) : 0);
        const pricing = resolveModelPricing(s.model);
        const cost = calculateCost(
          {
            inputTokens: s.usage.inputTokens,
            outputTokens,
            cacheRead: s.usage.cacheReadTokens,
            cacheCreation5m: 0,
            cacheCreation1h: s.usage.cacheCreationTokens,
          },
          pricing
        );
        return {
          ...s,
          lastActivityAt: bump ? new Date().toISOString() : s.lastActivityAt,
          usage: { ...s.usage, outputTokens },
          cost: { totalUsd: cost.totalUsd, inputUsd: cost.inputUsd, outputUsd: cost.outputUsd, cacheWriteUsd: cost.cacheWriteUsd, cacheReadUsd: cost.cacheReadUsd },
        };
      }),
    };
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l(this.snapshot);
  }

  getSnapshot(): DashboardSnapshot {
    return this.snapshot;
  }

  subscribe(cb: (snapshot: DashboardSnapshot) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getFeed(id: string): FeedResponse {
    const session = this.snapshot.sessions.find((s) => s.id === id) ?? this.snapshot.sessions[0]!;
    return { session, feed: FEED_TEMPLATES[id] ?? DEMO_FEED };
  }

  kill(pid: number) {
    this.snapshot = {
      ...this.snapshot,
      sessions: this.snapshot.sessions.map((s) =>
        s.pid === pid
          ? { ...s, status: "ended", pid: null, lastAction: { type: "unknown", summary: "Session stopped from the dashboard.", at: new Date().toISOString() } }
          : s
      ),
    };
    this.emit();
  }

  launch(cwd: string, prompt: string, model?: string) {
    const id = `demo-launched-${Date.now()}`;
    const usedModel = model || "claude-opus-4-8";
    const pricing = resolveModelPricing(usedModel);
    const session: SessionSummary = {
      id,
      cwd,
      projectDirName: cwd.replace(/\//g, "-"),
      gitBranch: null,
      model: usedModel,
      cliVersion: "2.1.199",
      title: prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      status: "running",
      pid: 60000 + Math.floor(Math.random() * 1000),
      lastAction: { type: "user_message", summary: prompt, at: new Date().toISOString() },
      usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, contextTokens: 0, contextLimit: pricing.contextLimit },
      cost: { totalUsd: 0, inputUsd: 0, outputUsd: 0, cacheWriteUsd: 0, cacheReadUsd: 0 },
      messageCount: 1,
      transcriptPath: `~/.claude/projects/${cwd.replace(/\//g, "-")}/${id}.jsonl`,
      hasPendingPermissionRequest: false,
      logPath: null,
      taskBoard: [],
      lastTurnOutputTokens: null,
    };
    this.snapshot = {
      ...this.snapshot,
      sessions: [session, ...this.snapshot.sessions],
      totals: { ...this.snapshot.totals, sessionCount: this.snapshot.totals.sessionCount + 1, runningCount: this.snapshot.totals.runningCount + 1 },
    };
    this.emit();
    return { pid: session.pid!, cwd, logPath: "(simulated — demo mode doesn't spawn a real process)" };
  }
}

export const demoStore = new DemoStore();
