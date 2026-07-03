import {
  calculateCost,
  resolveModelPricing,
  type DashboardSnapshot,
  type SessionStatus,
  type SessionSummary,
  type TranscriptFeedItem,
} from "@claude-dashboard/shared";
import type { TurnUsage } from "./transcript";
import { PeriodStatsBuilder } from "./stats";

interface MockSessionSpec {
  readonly id: string;
  readonly cwd: string;
  readonly gitBranch: string;
  readonly model: string;
  readonly title: string;
  readonly status: SessionStatus;
  readonly pid: number | null;
  readonly startedMinutesAgo: number;
  readonly lastActivityMinutesAgo: number;
  readonly turnCount: number;
  /** Per-turn token profile; multiplied out across turnCount deterministic turns. */
  readonly perTurn: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheCreationTokens: number;
  };
  readonly lastActionSummary: string;
}

interface MockFeedStep {
  readonly role: "assistant" | "user";
  readonly type: TranscriptFeedItem["type"];
  readonly summary: string;
  readonly toolName?: string;
  readonly minutesAgo: number;
}

/**
 * Synthetic dashboard data used when CLAUDE_DASHBOARD_MOCK=1 (demo recordings),
 * so nothing from the real machine — paths, branches, processes — is exposed.
 * Timestamps are fixed offsets from "now" so the demo always looks freshly active.
 */
export class MockDataProvider {
  private static readonly SESSION_SPECS: readonly MockSessionSpec[] = [
    {
      id: "mock-claude-dashboard",
      cwd: "/home/dev/projects/claude-dashboard",
      gitBranch: "feature/session-drawer",
      model: "claude-fable-5",
      title: "Add live session detail drawer",
      status: "running",
      pid: 48213,
      startedMinutesAgo: 96,
      lastActivityMinutesAgo: 0,
      turnCount: 26,
      perTurn: { inputTokens: 1400, outputTokens: 900, cacheReadTokens: 52000, cacheCreationTokens: 3800 },
      lastActionSummary: "Edit: packages/web/src/components/SessionDrawer.tsx",
    },
    {
      id: "mock-api-gateway",
      cwd: "/home/dev/projects/api-gateway",
      gitBranch: "fix/rate-limit-headers",
      model: "claude-sonnet-5",
      title: "Fix rate limit header propagation",
      status: "waiting_input",
      pid: 48377,
      startedMinutesAgo: 210,
      lastActivityMinutesAgo: 4,
      turnCount: 18,
      perTurn: { inputTokens: 1100, outputTokens: 650, cacheReadTokens: 34000, cacheCreationTokens: 2600 },
      lastActionSummary: "All 42 tests passing — ready for review. Want me to open a PR?",
    },
    {
      id: "mock-claude-agents",
      cwd: "/home/dev/projects/claude-agents",
      gitBranch: "main",
      model: "claude-opus-4-8",
      title: "Prototype multi-agent research workflow",
      status: "running",
      pid: 48590,
      startedMinutesAgo: 42,
      lastActivityMinutesAgo: 1,
      turnCount: 12,
      perTurn: { inputTokens: 1800, outputTokens: 1200, cacheReadTokens: 41000, cacheCreationTokens: 5200 },
      lastActionSummary: "Bash: bun test agents/planner.test.ts",
    },
    {
      id: "mock-billing-service",
      cwd: "/home/dev/projects/billing-service",
      gitBranch: "chore/invoice-retries",
      model: "claude-sonnet-5",
      title: "Add retry policy to invoice worker",
      status: "ended",
      pid: null,
      startedMinutesAgo: 9 * 60,
      lastActivityMinutesAgo: 7 * 60,
      turnCount: 22,
      perTurn: { inputTokens: 1000, outputTokens: 700, cacheReadTokens: 28000, cacheCreationTokens: 2400 },
      lastActionSummary: "Done — retry policy with exponential backoff merged into the worker.",
    },
    {
      id: "mock-mobile-app",
      cwd: "/home/dev/projects/mobile-app",
      gitBranch: "feature/offline-sync",
      model: "claude-haiku-4-5",
      title: "Investigate offline sync conflicts",
      status: "ended",
      pid: null,
      startedMinutesAgo: 30 * 60,
      lastActivityMinutesAgo: 28 * 60,
      turnCount: 15,
      perTurn: { inputTokens: 900, outputTokens: 500, cacheReadTokens: 18000, cacheCreationTokens: 1500 },
      lastActionSummary: "Wrote conflict-resolution notes to docs/offline-sync.md.",
    },
    {
      id: "mock-docs-site",
      cwd: "/home/dev/projects/docs-site",
      gitBranch: "main",
      model: "claude-sonnet-5",
      title: "Refresh getting-started guide",
      status: "ended",
      pid: null,
      startedMinutesAgo: 4 * 24 * 60,
      lastActivityMinutesAgo: 4 * 24 * 60 - 50,
      turnCount: 10,
      perTurn: { inputTokens: 800, outputTokens: 600, cacheReadTokens: 12000, cacheCreationTokens: 1300 },
      lastActionSummary: "Updated quickstart examples for the new CLI flags.",
    },
  ];

  private static readonly FEED_SCRIPT: readonly MockFeedStep[] = [
    { role: "user", type: "user_message", summary: "Pick up the next task from the plan and implement it.", minutesAgo: 34 },
    { role: "assistant", type: "thinking", summary: "Thinking…", minutesAgo: 33 },
    { role: "assistant", type: "tool_use", summary: "Read: src/components/SessionList.tsx", toolName: "Read", minutesAgo: 32 },
    { role: "user", type: "tool_result", summary: "Read 212 lines", minutesAgo: 32 },
    { role: "assistant", type: "text", summary: "The list renders from the snapshot — I'll add a drawer that opens on row click.", minutesAgo: 30 },
    { role: "assistant", type: "tool_use", summary: "Edit: src/components/SessionDrawer.tsx", toolName: "Edit", minutesAgo: 26 },
    { role: "user", type: "tool_result", summary: "File updated successfully", minutesAgo: 26 },
    { role: "assistant", type: "tool_use", summary: "Bash: bun test", toolName: "Bash", minutesAgo: 20 },
    { role: "user", type: "tool_result", summary: "42 pass, 0 fail (312ms)", minutesAgo: 19 },
    { role: "assistant", type: "text", summary: "All tests pass. The drawer now streams the live activity timeline.", minutesAgo: 18 },
    { role: "user", type: "user_message", summary: "Nice — also make Escape close it.", minutesAgo: 12 },
    { role: "assistant", type: "tool_use", summary: "Edit: src/components/SessionDrawer.tsx", toolName: "Edit", minutesAgo: 9 },
    { role: "user", type: "tool_result", summary: "File updated successfully", minutesAgo: 9 },
    { role: "assistant", type: "tool_use", summary: "Bash: bun test", toolName: "Bash", minutesAgo: 4 },
    { role: "user", type: "tool_result", summary: "42 pass, 0 fail (298ms)", minutesAgo: 3 },
    { role: "assistant", type: "text", summary: "Escape now closes the drawer and returns focus to the session row.", minutesAgo: 2 },
  ];

  buildSnapshot(now: number = Date.now()): DashboardSnapshot {
    const specs = MockDataProvider.SESSION_SPECS;
    const statsBuilder = new PeriodStatsBuilder(now);
    const sessions: SessionSummary[] = specs.map((spec) => {
      const turns = this.buildTurns(spec, now);
      statsBuilder.addSession(spec.id, turns);
      return this.buildSession(spec, turns, now);
    });

    const totals = sessions.reduce(
      (acc, s) => {
        acc.totalCostUsd += s.cost.totalUsd;
        acc.totalInputTokens += s.usage.inputTokens;
        acc.totalOutputTokens += s.usage.outputTokens;
        acc.totalCacheReadTokens += s.usage.cacheReadTokens;
        acc.totalCacheCreationTokens += s.usage.cacheCreationTokens;
        if (s.status !== "ended") {
          acc.runningCount += 1;
        }
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

    return {
      generatedAt: new Date(now).toISOString(),
      sessions,
      totals,
      statsByPeriod: statsBuilder.build(),
    };
  }

  getFeed(sessionId: string, limit = 60, now: number = Date.now()): TranscriptFeedItem[] {
    const spec = MockDataProvider.SESSION_SPECS.find((s) => s.id === sessionId);
    if (!spec) {
      return [];
    }
    const items = MockDataProvider.FEED_SCRIPT.map((step) => ({
      type: step.type,
      summary: step.summary,
      ...(step.toolName ? { toolName: step.toolName } : {}),
      ...(step.type === "tool_result" ? { isError: false } : {}),
      at: this.minutesAgoIso(now, spec.lastActivityMinutesAgo + step.minutesAgo),
      role: step.role,
    }));
    return items.slice(-limit);
  }

  private buildTurns(spec: MockSessionSpec, now: number): TurnUsage[] {
    const startMs = now - spec.startedMinutesAgo * 60_000;
    const endMs = now - spec.lastActivityMinutesAgo * 60_000;
    const stepMs = spec.turnCount > 1 ? (endMs - startMs) / (spec.turnCount - 1) : 0;
    return Array.from({ length: spec.turnCount }, (_, i) => ({
      at: new Date(startMs + stepMs * i).toISOString(),
      model: spec.model,
      inputTokens: spec.perTurn.inputTokens,
      outputTokens: spec.perTurn.outputTokens,
      cacheReadTokens: spec.perTurn.cacheReadTokens,
      cacheCreation5m: spec.perTurn.cacheCreationTokens,
      cacheCreation1h: 0,
    }));
  }

  private buildSession(spec: MockSessionSpec, turns: TurnUsage[], now: number): SessionSummary {
    const pricing = resolveModelPricing(spec.model, now);
    const usage = turns.reduce(
      (acc, t) => {
        acc.inputTokens += t.inputTokens;
        acc.outputTokens += t.outputTokens;
        acc.cacheReadTokens += t.cacheReadTokens;
        acc.cacheCreationTokens += t.cacheCreation5m + t.cacheCreation1h;
        return acc;
      },
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
    );
    const cost = calculateCost(
      {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheRead: usage.cacheReadTokens,
        cacheCreation5m: usage.cacheCreationTokens,
        cacheCreation1h: 0,
      },
      pricing
    );
    const lastTurn = turns[turns.length - 1];
    const lastActivityAt = this.minutesAgoIso(now, spec.lastActivityMinutesAgo);

    return {
      id: spec.id,
      cwd: spec.cwd,
      projectDirName: spec.cwd.replace(/\//g, "-"),
      gitBranch: spec.gitBranch,
      model: spec.model,
      cliVersion: "2.5.0",
      title: spec.title,
      startedAt: this.minutesAgoIso(now, spec.startedMinutesAgo),
      lastActivityAt,
      status: spec.status,
      pid: spec.pid,
      lastAction: {
        type: spec.status === "running" ? "tool_use" : "text",
        summary: spec.lastActionSummary,
        at: lastActivityAt,
      },
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
        cacheReadTokens: usage.cacheReadTokens,
        contextTokens: lastTurn ? lastTurn.inputTokens + lastTurn.cacheReadTokens + lastTurn.cacheCreation5m : 0,
        contextLimit: pricing.contextLimit,
      },
      cost: {
        totalUsd: cost.totalUsd,
        inputUsd: cost.inputUsd,
        outputUsd: cost.outputUsd,
        cacheWriteUsd: cost.cacheWriteUsd,
        cacheReadUsd: cost.cacheReadUsd,
      },
      messageCount: spec.turnCount,
      transcriptPath: `/home/dev/.claude/projects${spec.cwd.replace(/\//g, "-")}/${spec.id}.jsonl`,
      hasPendingPermissionRequest: false,
    };
  }

  private minutesAgoIso(now: number, minutes: number): string {
    return new Date(now - minutes * 60_000).toISOString();
  }
}
