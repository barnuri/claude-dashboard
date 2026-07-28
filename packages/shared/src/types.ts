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

export type NativeTaskStatus = "pending" | "in_progress" | "completed";

/** A single entry in Claude Code's native Task system (TaskCreate/TaskUpdate/TaskList/TaskGet), reconstructed from the transcript. */
export interface NativeTaskEntry {
  id: string;
  subject: string;
  status: NativeTaskStatus;
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
  /** Best-effort snapshot of this session's native tasks, reconstructed from TaskCreate/TaskUpdate/TaskList/TaskGet calls in its own transcript — may be incomplete for tasks created/updated by other sessions or subagents. */
  taskBoard: NativeTaskEntry[];
  /** Output tokens of the most recently completed assistant turn, or null if none — used to approximate the CLI's per-turn processing indicator. */
  lastTurnOutputTokens: number | null;
}

/** Tool name Claude Code uses to block on a genuine human decision — shared so server and web agree on it. */
export const ASK_USER_QUESTION_TOOL = "AskUserQuestion";

export interface AskUserQuestionOption {
  label: string;
  description?: string;
}

export interface AskUserQuestionEntry {
  question: string;
  header: string;
  options: AskUserQuestionOption[];
  multiSelect?: boolean;
}

export interface TranscriptFeedItem extends LastAction {
  role: "assistant" | "user";
  /** Fuller (lightly capped) content for transcript rendering — `summary` stays short for cards. */
  detail?: string;
  /** Present when this is an `AskUserQuestion` tool_use — the structured question(s) and choices to render. */
  askUserQuestion?: {
    questions: AskUserQuestionEntry[];
  };
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
