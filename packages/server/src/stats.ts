import {
  calculateCost,
  resolveModelPricing,
  STATS_PERIODS,
  type PeriodStats,
  type StatsPeriod,
} from "@claude-dashboard/shared";
import type { TurnUsage } from "./transcript";

/**
 * Aggregates per-turn usage into rolling-window stats (24h / 7d / 14d / 30d / all).
 * Each turn is costed with its own model's pricing, then added to every window whose
 * lookback includes the turn's timestamp. A session is counted once per window in which
 * it has at least one turn.
 */
export class PeriodStatsBuilder {
  private static readonly WINDOW_MS: Record<StatsPeriod, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "14d": 14 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    all: Number.POSITIVE_INFINITY,
  };

  private readonly now: number;
  private readonly accumulators: Record<StatsPeriod, PeriodStats>;
  private readonly sessionsSeen: Record<StatsPeriod, Set<string>>;

  constructor(now: number = Date.now()) {
    this.now = now;
    this.accumulators = {} as Record<StatsPeriod, PeriodStats>;
    this.sessionsSeen = {} as Record<StatsPeriod, Set<string>>;
    for (const period of STATS_PERIODS) {
      this.accumulators[period] = this.emptyStats(period);
      this.sessionsSeen[period] = new Set<string>();
    }
  }

  /** Add one session's turns into every window they fall within. */
  addSession(sessionId: string, turns: readonly TurnUsage[]): void {
    for (const turn of turns) {
      const ageMs = this.now - Date.parse(turn.at);
      if (Number.isNaN(ageMs)) {
        continue;
      }
      for (const period of STATS_PERIODS) {
        if (ageMs > PeriodStatsBuilder.WINDOW_MS[period]) {
          continue;
        }
        this.applyTurn(period, sessionId, turn);
      }
    }
  }

  build(): Record<StatsPeriod, PeriodStats> {
    return this.accumulators;
  }

  private applyTurn(period: StatsPeriod, sessionId: string, turn: TurnUsage): void {
    const pricing = resolveModelPricing(turn.model, this.now);
    const cost = calculateCost(
      {
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        cacheRead: turn.cacheReadTokens,
        cacheCreation5m: turn.cacheCreation5m,
        cacheCreation1h: turn.cacheCreation1h,
      },
      pricing
    );

    const acc = this.accumulators[period];
    acc.totalCostUsd += cost.totalUsd;
    acc.totalInputTokens += turn.inputTokens;
    acc.totalOutputTokens += turn.outputTokens;
    acc.totalCacheReadTokens += turn.cacheReadTokens;
    acc.totalCacheCreationTokens += turn.cacheCreation5m + turn.cacheCreation1h;

    const seen = this.sessionsSeen[period];
    if (!seen.has(sessionId)) {
      seen.add(sessionId);
      acc.sessionCount += 1;
    }
  }

  private emptyStats(period: StatsPeriod): PeriodStats {
    return {
      period,
      sessionCount: 0,
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheCreationTokens: 0,
    };
  }
}
