import { readFileSync, statSync } from "node:fs";
import type { LastAction, TranscriptFeedItem } from "@claude-dashboard/shared";

/** Usage recorded for a single assistant turn, tagged with its timestamp and model. */
export interface TurnUsage {
  at: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreation5m: number;
  cacheCreation1h: number;
}

export interface ParsedTranscript {
  sessionId: string;
  cwd: string | null;
  gitBranch: string | null;
  model: string | null;
  cliVersion: string | null;
  /** Claude Code's generated session title (from `ai-title` lines), if present. */
  title: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  messageCount: number;
  lastAction: LastAction | null;
  /** True when the last thing in the transcript is a finished assistant turn (end_turn/refusal/max_tokens). */
  turnComplete: boolean;
  /** True when the assistant called `AskUserQuestion` and no matching `tool_result` has arrived yet. */
  awaitingUserQuestion: boolean;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreation5m: number;
    cacheCreation1h: number;
  };
  /** Per-turn timestamped usage, used to aggregate cost/tokens over time windows. */
  turns: TurnUsage[];
  /** Total input tokens attributed to the single most recent assistant turn — used as the "context used" estimate. */
  lastTurnContextTokens: number;
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  result: ParsedTranscript;
}

const fileCache = new Map<string, CacheEntry>();

const META_LINE_TYPES = new Set(["queue-operation", "attachment", "last-prompt"]);

/** Tool whose call genuinely blocks on the human — a real "needs you" signal, unlike a normal tool_use. */
const ASK_USER_QUESTION_TOOL = "AskUserQuestion";

function truncate(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function summarizeToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return name;
  const obj = input as Record<string, unknown>;
  if (typeof obj.command === "string") return `${name}: ${truncate(obj.command, 100)}`;
  if (typeof obj.file_path === "string") return `${name}: ${obj.file_path}`;
  if (typeof obj.pattern === "string") return `${name}: ${truncate(obj.pattern, 80)}`;
  if (typeof obj.path === "string") return `${name}: ${obj.path}`;
  if (typeof obj.description === "string") return `${name}: ${truncate(obj.description, 100)}`;
  return name;
}

/** Render a tool_result's `content` (string, or an array of text/image/etc. blocks) as plain text. */
function stringifyToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          if (typeof item.text === "string") return item.text;
          if (item.type === "image") return "[image]";
          return `[${item.type ?? "content"}]`;
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function extractLastAction(
  entry: any,
  blockType: string | undefined,
  block: any
): LastAction | null {
  const at: string = entry.timestamp ?? new Date(0).toISOString();

  if (entry.type === "assistant") {
    if (blockType === "thinking") {
      return { type: "thinking", summary: "Thinking…", at };
    }
    if (blockType === "text") {
      const text = typeof block?.text === "string" ? block.text : "";
      return { type: "text", summary: text ? truncate(text) : "Replying…", at };
    }
    if (blockType === "tool_use") {
      const name = typeof block?.name === "string" ? block.name : "tool";
      return { type: "tool_use", summary: summarizeToolInput(name, block?.input), toolName: name, at };
    }
    return { type: "unknown", summary: "Working…", at };
  }

  if (entry.type === "user") {
    if (blockType === "tool_result") {
      const isError = Boolean(block?.is_error);
      const content = stringifyToolResultContent(block?.content);
      return {
        type: "tool_result",
        summary: isError ? `Tool error: ${truncate(content)}` : truncate(content || "Tool finished"),
        isError,
        at,
      };
    }
    if (blockType === "text") {
      const text = typeof block?.text === "string" ? block.text : "";
      return { type: "user_message", summary: truncate(text || "New message"), at };
    }
    // Plain string user message content.
    const msg = entry.message;
    if (typeof msg?.content === "string") {
      return { type: "user_message", summary: truncate(msg.content), at };
    }
    return { type: "unknown", summary: "Processing message…", at };
  }

  return null;
}

/** Parse a single Claude Code transcript JSONL file into an aggregate summary. */
export function parseTranscriptFile(filePath: string, fallbackId: string): ParsedTranscript | null {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return null;
  }

  const cached = fileCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.result;
  }

  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  const lines = text.split("\n").filter(Boolean);

  let sessionId = fallbackId;
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let model: string | null = null;
  let cliVersion: string | null = null;
  let title: string | null = null;
  let startedAt: string | null = null;
  let lastActivityAt: string | null = null;
  let lastAction: LastAction | null = null;
  let turnComplete = false;
  const pendingAskUserQuestionIds = new Set<string>();

  const seenAssistantMessageIds = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreation5m = 0;
  let cacheCreation1h = 0;
  let lastTurnContextTokens = 0;
  let messageCount = 0;
  const turns: TurnUsage[] = [];

  for (const line of lines) {
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    if (typeof entry.sessionId === "string") sessionId = entry.sessionId;
    if (typeof entry.cwd === "string") cwd = entry.cwd;
    if (typeof entry.gitBranch === "string") gitBranch = entry.gitBranch;
    if (typeof entry.version === "string") cliVersion = entry.version;
    if (entry.type === "ai-title" && typeof entry.aiTitle === "string" && entry.aiTitle.trim()) {
      title = entry.aiTitle.trim();
    }
    if (typeof entry.timestamp === "string") {
      if (!startedAt) startedAt = entry.timestamp;
      lastActivityAt = entry.timestamp;
    }

    if (META_LINE_TYPES.has(entry.type)) continue;

    if (entry.type === "assistant") {
      const msg = entry.message;
      const msgId: string | undefined = msg?.id;
      if (typeof msg?.model === "string") model = msg.model;

      if (msgId && !seenAssistantMessageIds.has(msgId)) {
        seenAssistantMessageIds.add(msgId);
        messageCount++;
        const usage = msg?.usage;
        if (usage) {
          const inTok = usage.input_tokens ?? 0;
          const outTok = usage.output_tokens ?? 0;
          const cacheRead = usage.cache_read_input_tokens ?? 0;
          const c5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
          const c1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
          inputTokens += inTok;
          outputTokens += outTok;
          cacheReadTokens += cacheRead;
          cacheCreation5m += c5m;
          cacheCreation1h += c1h;
          lastTurnContextTokens = inTok + cacheRead + c5m + c1h;
          turns.push({
            at: typeof entry.timestamp === "string" ? entry.timestamp : new Date(0).toISOString(),
            model: typeof msg?.model === "string" ? msg.model : null,
            inputTokens: inTok,
            outputTokens: outTok,
            cacheReadTokens: cacheRead,
            cacheCreation5m: c5m,
            cacheCreation1h: c1h,
          });
        }
      }

      const blocks = Array.isArray(msg?.content) ? msg.content : [];
      const block = blocks[0];
      const blockType = block?.type;
      const action = extractLastAction(entry, blockType, block);
      if (action) lastAction = action;

      for (const contentBlock of blocks) {
        if (contentBlock?.type === "tool_use" && contentBlock?.name === ASK_USER_QUESTION_TOOL && typeof contentBlock?.id === "string") {
          pendingAskUserQuestionIds.add(contentBlock.id);
        }
      }

      // stop_reason lives on the message object, not the top-level transcript entry.
      const stopReason = msg?.stop_reason;
      turnComplete = stopReason === "end_turn" || stopReason === "refusal" || stopReason === "max_tokens";
    } else if (entry.type === "user") {
      const content = entry.message?.content;
      const blocks = Array.isArray(content) ? content : [];
      const block = blocks[0];
      const blockType = block?.type;
      const action = extractLastAction(entry, blockType, block);
      if (action) lastAction = action;
      turnComplete = false;

      for (const contentBlock of blocks) {
        if (contentBlock?.type === "tool_result" && typeof contentBlock?.tool_use_id === "string") {
          pendingAskUserQuestionIds.delete(contentBlock.tool_use_id);
        }
      }
    }
  }

  const result: ParsedTranscript = {
    sessionId,
    cwd,
    gitBranch,
    model,
    cliVersion,
    title,
    startedAt,
    lastActivityAt,
    messageCount,
    lastAction,
    turnComplete,
    awaitingUserQuestion: pendingAskUserQuestionIds.size > 0,
    usage: {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreation5m,
      cacheCreation1h,
    },
    turns,
    lastTurnContextTokens,
  };

  fileCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, result });
  return result;
}

/** Return the last `limit` significant (non-meta) entries from a transcript, oldest first. */
export function getTranscriptFeed(filePath: string, limit = 60): TranscriptFeedItem[] {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  const items: TranscriptFeedItem[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object" || META_LINE_TYPES.has(entry.type)) continue;
    if (entry.type !== "assistant" && entry.type !== "user") continue;

    const content = Array.isArray(entry.message?.content) ? entry.message.content : [];
    const block = content[0];
    const action = extractLastAction(entry, block?.type, block);
    if (!action) continue;
    items.push({ ...action, role: entry.type });
  }

  return items.slice(-limit);
}
