import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  CopyButton,
  Group,
  SegmentedControl,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconGitBranch,
  IconPlayerStopFilled,
} from "@tabler/icons-react";
import { ASK_USER_QUESTION_TOOL } from "@claude-dashboard/shared";
import type { NativeTaskEntry, SessionSummary, TranscriptFeedItem } from "@claude-dashboard/shared";
import { fetchFeed } from "../api/client";
import { feedQueryKey } from "../api/queryKeys";
import { ContextMeter } from "./ContextMeter";
import { LiveOutputPanel } from "./LiveOutputPanel";
import { StatusBadge } from "./StatusBadge";
import { basename, formatRelativeTime, formatTokens, formatUsd } from "../utils/format";
import { partitionTaskBoard } from "../utils/taskBoard";

interface Props {
  session: SessionSummary;
  onBack: () => void;
  onKill: (session: SessionSummary) => void;
}

type TerminalTab = "transcript" | "rawlog";

/** Claude Code renders tool results nested under their call — pair them the same way. */
interface TranscriptRow {
  item: TranscriptFeedItem;
  result?: TranscriptFeedItem;
}

function findToolCallRow(rows: TranscriptRow[], result: TranscriptFeedItem): TranscriptRow | undefined {
  // Parallel tool calls interleave results, so match by id when present; positional fallback for old feeds.
  if (result.toolUseId) {
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (row.item.type === "tool_use" && row.item.toolUseId === result.toolUseId && !row.result) {
        return row;
      }
    }
    return undefined;
  }
  const last = rows[rows.length - 1];
  return last?.item.type === "tool_use" && !last.result ? last : undefined;
}

function pairToolResults(feed: TranscriptFeedItem[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  for (const item of feed) {
    if (item.type === "tool_result") {
      const callRow = findToolCallRow(rows, item);
      if (callRow) {
        callRow.result = item;
        continue;
      }
    }
    rows.push({ item });
  }
  return rows;
}

function contentOf(item: TranscriptFeedItem): string {
  return item.detail ?? item.summary;
}

/** One transcript entry, rendered with Claude Code's TUI glyph vocabulary. */
function TranscriptEntry({ row }: { row: TranscriptRow }) {
  const { item, result } = row;

  if (item.type === "user_message") {
    return (
      <div className="cd-t-entry cd-t-entry--user">
        <span className="cd-t-glyph" aria-hidden>
          &gt;
        </span>
        <div className="cd-t-text">{contentOf(item)}</div>
      </div>
    );
  }

  if (item.type === "thinking") {
    return (
      <div className="cd-t-entry cd-t-entry--thinking">
        <span className="cd-t-glyph" aria-hidden>
          ✻
        </span>
        <div className="cd-t-text">Thinking…</div>
      </div>
    );
  }

  if (item.type === "tool_use" && item.toolName === ASK_USER_QUESTION_TOOL && item.askUserQuestion) {
    const pending = !result;
    return (
      <Fragment>
        <div className={`cd-t-entry cd-t-entry--question${pending ? " cd-t-entry--question-pending" : ""}`}>
          <span className="cd-t-glyph" aria-hidden>
            {pending ? "?" : "⏺"}
          </span>
          <div className="cd-t-text">
            {item.askUserQuestion.questions.map((question, questionIndex) => (
              <div className="cd-t-question" key={questionIndex}>
                <div className="cd-t-question-header">
                  {question.header}
                  {question.multiSelect && <span className="cd-t-question-multi"> · select all that apply</span>}
                </div>
                <div className="cd-t-question-text">{question.question}</div>
                <div className="cd-t-question-options">
                  {question.options.map((option, optionIndex) => (
                    <div className="cd-t-question-option" key={optionIndex}>
                      <span className="cd-t-question-option-label">{option.label}</span>
                      {option.description && (
                        <span className="cd-t-question-option-desc"> — {option.description}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {pending && (
              <div className="cd-t-question-pending-tag">
                <span className="cd-led cd-led--pulse" aria-hidden />
                Waiting for your answer
              </div>
            )}
          </div>
        </div>
        {result && (
          <div className={`cd-t-result${result.isError ? " cd-t-result--error" : ""}`}>
            <span className="cd-t-glyph" aria-hidden>
              ⎿
            </span>
            <div className="cd-t-text">{contentOf(result)}</div>
          </div>
        )}
      </Fragment>
    );
  }

  if (item.type === "tool_use") {
    const label = item.toolName ?? "tool";
    const args = item.summary.startsWith(`${label}: `) ? item.summary.slice(label.length + 2) : "";
    return (
      <Fragment>
        <div className="cd-t-entry cd-t-entry--tool">
          <span className="cd-t-glyph" aria-hidden>
            ⏺
          </span>
          <div className="cd-t-text">
            <b>{label}</b>
            {args && <span>({args})</span>}
          </div>
        </div>
        {result && (
          <div className={`cd-t-result${result.isError ? " cd-t-result--error" : ""}`}>
            <span className="cd-t-glyph" aria-hidden>
              ⎿
            </span>
            <div className="cd-t-text">{contentOf(result)}</div>
          </div>
        )}
      </Fragment>
    );
  }

  if (item.type === "tool_result") {
    return (
      <div className={`cd-t-result${item.isError ? " cd-t-result--error" : ""}`} style={{ paddingLeft: 0 }}>
        <span className="cd-t-glyph" aria-hidden>
          ⎿
        </span>
        <div className="cd-t-text">{contentOf(item)}</div>
      </div>
    );
  }

  return (
    <div className="cd-t-entry cd-t-entry--assistant">
      <span className="cd-t-glyph" aria-hidden>
        ⏺
      </span>
      <div className="cd-t-text">{contentOf(item)}</div>
    </div>
  );
}

const TASK_BOARD_MAX_VISIBLE = 5;

const TASK_STATUS_GLYPH: Record<NativeTaskEntry["status"], string> = {
  pending: "☐",
  in_progress: "◐",
  completed: "☑",
};

/**
 * Best-effort snapshot of this session's native tasks (TaskCreate/TaskUpdate/TaskList/TaskGet),
 * reconstructed server-side from this session's own transcript — may be incomplete for tasks
 * created/updated by other sessions or background subagents. Incomplete tasks are shown first;
 * completed ones are the first to collapse into the "+N" overflow line when the list is long.
 */
function TaskBoardPanel({ tasks }: { tasks: NativeTaskEntry[] }) {
  if (tasks.length === 0) return null;

  const { visible, hiddenPending, hiddenDone } = partitionTaskBoard(tasks, TASK_BOARD_MAX_VISIBLE);
  const completedCount = tasks.filter((task) => task.status === "completed").length;

  return (
    <div className="cd-taskboard">
      <div className="cd-taskboard-header">
        Tasks · {completedCount}/{tasks.length} done
      </div>
      {visible.map((task) => (
        <div key={task.id} className={`cd-taskboard-row cd-taskboard-row--${task.status}`}>
          <span className="cd-t-glyph" aria-hidden>
            {TASK_STATUS_GLYPH[task.status]}
          </span>
          <span className="cd-taskboard-subject">{task.subject}</span>
        </div>
      ))}
      {hiddenPending + hiddenDone > 0 && (
        <div className="cd-taskboard-overflow">
          {hiddenPending > 0 && <span>+{hiddenPending} pending</span>}
          {hiddenDone > 0 && <span>+{hiddenDone} done</span>}
        </div>
      )}
    </div>
  );
}

/** Ticks once a second while `active`, returning "Xm Ys" elapsed since `sinceIso` (null once inactive/unknown). */
function useElapsedSince(sinceIso: string | null, active: boolean): string | null {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active || !sinceIso) return null;
  const sinceMs = Date.parse(sinceIso);
  if (Number.isNaN(sinceMs)) return null;

  const totalSeconds = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/**
 * The signature view: a selected session rendered as a full-page read-only
 * Claude Code terminal — window chrome with a back control, TUI-style
 * transcript, and a status-line footer. Follows new output by default
 * (ResizeObserver on the content) until the user scrolls up to read.
 */
export function SessionTerminal({ session, onBack, onKill }: Props) {
  const [tab, setTab] = useState<TerminalTab>("transcript");
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  const { data } = useQuery({
    queryKey: feedQueryKey(session.id),
    queryFn: () => fetchFeed(session.id, 200),
    refetchInterval: 2000,
  });

  const live = data?.session ?? session;
  const rows = pairToolResults(data?.feed ?? []);
  const isRunning = live.status === "running";
  const elapsed = useElapsedSince(live.lastActivityAt, isRunning);

  useEffect(() => {
    setTab("transcript");
    pinnedToBottom.current = true;
  }, [session.id]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onBack();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  // Default autoscroll: any content-height change (new feed rows, raw log
  // chunks, late font/layout shifts) re-pins the view to the bottom while the
  // user hasn't scrolled up. ResizeObserver catches growth that feed identity
  // alone would miss.
  useEffect(() => {
    const body = bodyRef.current;
    const content = contentRef.current;
    if (!body || !content) {
      return;
    }
    const followBottom = () => {
      if (pinnedToBottom.current) {
        body.scrollTop = body.scrollHeight;
      }
    };
    followBottom();
    const observer = new ResizeObserver(followBottom);
    observer.observe(content);
    return () => observer.disconnect();
  }, [tab, session.id]);

  function handleScroll() {
    const el = bodyRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  return (
    <div className="cd-terminal cd-terminal--page">
      <div className="cd-terminal-titlebar">
        <Button
          size="compact-sm"
          variant="subtle"
          color="gray"
          leftSection={<IconArrowLeft size={15} />}
          onClick={onBack}
        >
          Sessions
        </Button>
        <span className="cd-traffic cd-traffic--live" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <Text size="sm" className="cd-mono" truncate style={{ flex: 1, minWidth: 0 }} title={live.cwd}>
          claude — {basename(live.cwd)}
          {live.gitBranch ? ` — ${live.gitBranch}` : ""}
        </Text>
        <span className="cd-readonly-badge">read-only</span>
        <StatusBadge status={live.status} />
        {live.logPath && (
          <SegmentedControl
            size="xs"
            value={tab}
            onChange={(v) => setTab(v as TerminalTab)}
            data={[
              { label: "Transcript", value: "transcript" },
              { label: "Raw log", value: "rawlog" },
            ]}
          />
        )}
        <CopyButton value={`claude --resume ${live.id}`} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip label="Copy the resume command" openDelay={300}>
              <Button
                size="compact-xs"
                variant="default"
                leftSection={copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                onClick={copy}
              >
                {copied ? "Copied" : "Resume"}
              </Button>
            </Tooltip>
          )}
        </CopyButton>
        <Button
          size="compact-xs"
          variant="light"
          color="red"
          disabled={!live.pid}
          leftSection={<IconPlayerStopFilled size={13} />}
          onClick={() => onKill(live)}
        >
          Kill
        </Button>
      </div>

      <TaskBoardPanel tasks={live.taskBoard} />

      {tab === "transcript" ? (
        <div
          ref={bodyRef}
          className="cd-terminal-body"
          onScroll={handleScroll}
          tabIndex={0}
          aria-label="Session transcript, read-only"
        >
          <div ref={contentRef}>
            {rows.length === 0 && (
              <Text size="sm" c="dimmed" className="cd-mono">
                No transcript entries yet…
              </Text>
            )}
            {rows.map((row, i) => (
              <TranscriptEntry key={i} row={row} />
            ))}
            {isRunning && <span className="cd-cursor" aria-hidden />}
          </div>
        </div>
      ) : (
        <div
          ref={bodyRef}
          className="cd-terminal-body"
          onScroll={handleScroll}
          aria-label="Raw session log, read-only"
        >
          <div ref={contentRef}>
            <LiveOutputPanel sessionId={live.id} logPath={live.logPath} />
          </div>
        </div>
      )}

      <div className="cd-terminal-statusline cd-mono">
        {isRunning && elapsed && (
          <Group gap={6} wrap="nowrap" className="cd-processing-chip">
            <span className="cd-led cd-led--pulse" style={{ color: "var(--cd-brand)" }} aria-hidden />
            <span>processing {elapsed}</span>
          </Group>
        )}
        {isRunning && live.lastTurnOutputTokens != null && (
          <span>last turn ↓ {formatTokens(live.lastTurnOutputTokens)}</span>
        )}
        {live.model && <span>{live.model}</span>}
        {live.gitBranch && (
          <Group gap={4} wrap="nowrap">
            <IconGitBranch size={12} />
            <span>{live.gitBranch}</span>
          </Group>
        )}
        <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 160 }}>
          <span style={{ whiteSpace: "nowrap" }}>
            ctx {formatTokens(live.usage.contextTokens)}/{formatTokens(live.usage.contextLimit)}
          </span>
          <div style={{ flex: 1, maxWidth: 220 }}>
            <ContextMeter used={live.usage.contextTokens} limit={live.usage.contextLimit} />
          </div>
        </Group>
        <span>{formatUsd(live.cost.totalUsd)}</span>
        <span>{live.messageCount} turns</span>
        <span>
          in {formatTokens(live.usage.inputTokens)} · out {formatTokens(live.usage.outputTokens)} · cache{" "}
          {formatTokens(live.usage.cacheReadTokens + live.usage.cacheCreationTokens)}
        </span>
        <span>updated {formatRelativeTime(live.lastActivityAt)}</span>
      </div>
    </div>
  );
}
