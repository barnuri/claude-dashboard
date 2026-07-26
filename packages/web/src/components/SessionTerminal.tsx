import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ActionIcon,
  Button,
  CopyButton,
  Group,
  Modal,
  SegmentedControl,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconGitBranch,
  IconPlayerStopFilled,
  IconX,
} from "@tabler/icons-react";
import type { SessionSummary, TranscriptFeedItem } from "@claude-dashboard/shared";
import { fetchFeed } from "../api/client";
import { feedQueryKey } from "../api/queryKeys";
import { ContextMeter } from "./ContextMeter";
import { LiveOutputPanel } from "./LiveOutputPanel";
import { StatusBadge } from "./StatusBadge";
import { basename, formatRelativeTime, formatTokens, formatUsd } from "../utils/format";

interface Props {
  session: SessionSummary | null;
  onClose: () => void;
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

/**
 * The signature view: a selected session rendered as a read-only Claude Code
 * terminal — window chrome, TUI-style transcript, blinking cursor while the
 * session runs, and a status-line footer.
 */
export function SessionTerminal({ session, onClose, onKill }: Props) {
  const opened = session !== null;
  const [tab, setTab] = useState<TerminalTab>("transcript");
  const bodyRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  const { data } = useQuery({
    queryKey: session ? feedQueryKey(session.id) : ["feed", "none"],
    queryFn: () => fetchFeed(session!.id, 200),
    enabled: opened,
    refetchInterval: opened ? 2000 : false,
  });

  const live = data?.session ?? session;
  const feed = data?.feed ?? [];
  const rows = pairToolResults(feed);
  const isRunning = live?.status === "running";

  useEffect(() => {
    setTab("transcript");
    pinnedToBottom.current = true;
  }, [session?.id]);

  // Auto-follow new output, but stop following once the user scrolls up to read.
  // Keyed to the raw feed (react-query returns a new reference whenever content
  // changes) — row count alone misses tool results merging into existing rows.
  useEffect(() => {
    const el = bodyRef.current;
    if (el && pinnedToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [feed, tab]);

  function handleScroll() {
    const el = bodyRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      centered
      size="min(1100px, 94vw)"
      padding={0}
      radius="md"
      overlayProps={{ backgroundOpacity: 0.6, blur: 3 }}
      styles={{
        content: { height: "86vh", display: "flex", flexDirection: "column", overflow: "hidden" },
        body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 0 },
      }}
    >
      {live && (
        <div className="cd-terminal">
          <div className="cd-terminal-titlebar">
            <span className="cd-traffic cd-traffic--live" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <Text
              size="sm"
              className="cd-mono"
              truncate
              style={{ flex: 1, minWidth: 0 }}
              title={live.cwd}
            >
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
            <ActionIcon variant="subtle" color="gray" aria-label="Close terminal" onClick={onClose}>
              <IconX size={16} />
            </ActionIcon>
          </div>

          {tab === "transcript" ? (
            <div
              ref={bodyRef}
              className="cd-terminal-body"
              onScroll={handleScroll}
              tabIndex={0}
              aria-label="Session transcript, read-only"
            >
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
          ) : (
            <div className="cd-terminal-body" aria-label="Raw session log, read-only">
              <LiveOutputPanel sessionId={live.id} logPath={live.logPath} />
            </div>
          )}

          <div className="cd-terminal-statusline cd-mono">
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
      )}
    </Modal>
  );
}
