import type { SessionSummary } from "@claude-dashboard/shared";
import { vizColors } from "../theme";

export type HealthLevel =
  | "running"
  | "waiting"
  | "serious"
  | "critical"
  | "idle"
  | "ended";

export interface SessionHealth {
  level: HealthLevel;
  color: string;
  label: string;
  /** Ended sessions are visually de-emphasized in the grid. */
  dimmed: boolean;
}

/** Context-usage fraction (0–1) at which a session is flagged as approaching its limit. */
const CONTEXT_SERIOUS = 0.75;
const CONTEXT_CRITICAL = 0.9;

const HEALTH_META: Record<HealthLevel, { color: string; label: string; dimmed: boolean }> = {
  running: { color: vizColors.status.good, label: "Running", dimmed: false },
  waiting: { color: vizColors.status.warning, label: "Waiting on you", dimmed: false },
  serious: { color: vizColors.status.serious, label: "Context high", dimmed: false },
  critical: { color: vizColors.status.critical, label: "Attention", dimmed: false },
  idle: { color: vizColors.muted, label: "Idle", dimmed: false },
  ended: { color: vizColors.status.ended, label: "Ended", dimmed: true },
};

function contextFraction(session: SessionSummary): number {
  const { contextTokens, contextLimit } = session.usage;
  if (!contextLimit) {
    return 0;
  }
  return contextTokens / contextLimit;
}

/**
 * Derive a single health level for a session card from live signals, in priority order:
 * errored last action or context at limit → critical; high context → serious;
 * waiting on the user → waiting; actively producing → running; alive but quiet → idle;
 * no live process → ended.
 */
export function deriveSessionHealth(session: SessionSummary): SessionHealth {
  const level = classify(session);
  return { level, ...HEALTH_META[level] };
}

function classify(session: SessionSummary): HealthLevel {
  if (session.status === "ended") {
    return "ended";
  }

  const context = contextFraction(session);
  if (session.lastAction?.isError || context >= CONTEXT_CRITICAL) {
    return "critical";
  }
  if (context >= CONTEXT_SERIOUS) {
    return "serious";
  }
  if (session.status === "waiting_input") {
    return "waiting";
  }
  if (session.status === "running") {
    return "running";
  }
  return "idle";
}

/** True when an ended session finished within `hours` of `now` — used to keep it in the Active view. */
export function isRecentlyEnded(session: SessionSummary, hours: number, now: number = Date.now()): boolean {
  if (session.status !== "ended") {
    return false;
  }
  if (!session.lastActivityAt) {
    return false;
  }
  const endedAt = Date.parse(session.lastActivityAt);
  if (Number.isNaN(endedAt)) {
    return false;
  }
  return now - endedAt <= hours * 60 * 60 * 1000;
}
