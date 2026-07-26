export type SessionStatus =
  | "running" // process alive and actively producing output (recent tool_use/thinking)
  | "waiting_input" // process alive, idle, waiting on the user
  | "idle" // process alive but no activity signal either way
  | "ended"; // no live process found for this transcript

export type LastActionType =
  | "thinking"
  | "text"
  | "tool_use"
  | "tool_result"
  | "user_message"
  | "queue"
  | "unknown";

export interface LastAction {
  type: LastActionType;
  summary: string;
  toolName?: string;
  /** tool_use block id (on tool_use) or tool_use_id (on tool_result) — lets clients pair calls with results. */
  toolUseId?: string;
  isError?: boolean;
  at: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** Best current estimate of tokens occupying the model's context window right now. */
  contextTokens: number;
  /** Max context window for the model in use. */
  contextLimit: number;
}

export interface SessionCost {
  totalUsd: number;
  inputUsd: number;
  outputUsd: number;
  cacheWriteUsd: number;
  cacheReadUsd: number;
}

export interface SessionSummary {
  id: string;
  cwd: string;
  projectDirName: string;
  gitBranch: string | null;
  model: string | null;
  cliVersion: string | null;
  /** Claude Code's generated session title, if the transcript recorded one. */
  title: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  status: SessionStatus;
  pid: number | null;
  lastAction: LastAction | null;
  usage: TokenUsage;
  cost: SessionCost;
  messageCount: number;
  transcriptPath: string;
  /** True if the assistant is mid-turn awaiting more model output (best-effort). */
  hasPendingPermissionRequest: boolean;
  /** Path to this session's live output log, if it was launched via the dashboard's "New session" flow; null otherwise. */
  logPath: string | null;
}

export interface TranscriptFeedItem extends LastAction {
  role: "assistant" | "user";
  /** Fuller (lightly capped) content for transcript rendering — `summary` stays short for cards. */
  detail?: string;
}

export interface CreateSessionRequest {
  cwd: string;
  prompt: string;
  model?: string;
  permissionMode?: "default" | "acceptEdits" | "plan" | "bypassPermissions";
}

export interface CreateSessionResponse {
  pid: number;
  cwd: string;
  logPath: string;
}

export type KillOutcome = "killed" | "not_found" | "permission_denied" | "error";

export interface KillSessionResponse {
  ok: boolean;
  pid: number | null;
  signal: string;
  outcome: KillOutcome;
}

export interface DashboardTotals {
  sessionCount: number;
  runningCount: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
}

/** Rolling time windows the stats header can be scoped to. */
export type StatsPeriod = "24h" | "7d" | "14d" | "30d" | "all";

export const STATS_PERIODS: readonly StatsPeriod[] = ["24h", "7d", "14d", "30d", "all"];

/** Usage/cost aggregated over a single time window. */
export interface PeriodStats {
  period: StatsPeriod;
  /** Sessions with at least one assistant turn inside the window. */
  sessionCount: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
}

export interface DashboardSnapshot {
  generatedAt: string;
  sessions: SessionSummary[];
  totals: DashboardTotals;
  /** Per-window aggregates, keyed by period, so the client can switch windows without a round-trip. */
  statsByPeriod: Record<StatsPeriod, PeriodStats>;
}

export type ServerEvent =
  | { type: "snapshot"; data: DashboardSnapshot }
  | { type: "error"; message: string };
