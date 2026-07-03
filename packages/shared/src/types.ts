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
}

export interface TranscriptFeedItem extends LastAction {
  role: "assistant" | "user";
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

export interface KillSessionResponse {
  ok: boolean;
  pid: number | null;
  signal: string;
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

export interface DashboardSnapshot {
  generatedAt: string;
  sessions: SessionSummary[];
  totals: DashboardTotals;
}

export type ServerEvent =
  | { type: "snapshot"; data: DashboardSnapshot }
  | { type: "error"; message: string };
