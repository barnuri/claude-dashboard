import type { SessionSummary } from "@claude-dashboard/shared";
import { deriveSessionHealth, type HealthLevel } from "./sessionHealth";

/**
 * Priority of each health level in the grid. Lower sorts first: a session waiting on the
 * user comes before one needing attention, then actively running, then quiet, then done.
 * Sorting by this fixed rank (rather than raw timestamps) keeps cards from jumping around
 * as live snapshots arrive — a card only moves when its state actually changes.
 */
const LEVEL_ORDER: Record<HealthLevel, number> = {
  waiting: 0,
  critical: 1,
  serious: 2,
  running: 3,
  idle: 4,
  ended: 5,
};

function activityTime(session: SessionSummary): number {
  if (!session.lastActivityAt) {
    return 0;
  }
  const parsed = Date.parse(session.lastActivityAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Return a new array sorted by health state first (see `LEVEL_ORDER`), then most-recent
 * activity within a state, then session id as a stable final tiebreaker.
 */
export function sortSessions(sessions: readonly SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((a, b) => {
    const rankA = LEVEL_ORDER[deriveSessionHealth(a).level];
    const rankB = LEVEL_ORDER[deriveSessionHealth(b).level];
    if (rankA !== rankB) {
      return rankA - rankB;
    }

    const timeDiff = activityTime(b) - activityTime(a);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return a.id.localeCompare(b.id);
  });
}
