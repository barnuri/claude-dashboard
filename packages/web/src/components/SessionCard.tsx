import {
  Box,
  Button,
  Card,
  CopyButton,
  Group,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconCpu,
  IconEye,
  IconGitBranch,
  IconPlayerStopFilled,
} from "@tabler/icons-react";
import type { MouseEvent } from "react";
import type { SessionSummary } from "@claude-dashboard/shared";
import { StatusBadge } from "./StatusBadge";
import { ContextMeter } from "./ContextMeter";
import { actionIcon } from "./actionIcons";
import { basename, formatRelativeTime, formatTokens, formatUsd } from "../utils/format";
import { deriveSessionHealth } from "../utils/sessionHealth";
import { folderColor } from "../utils/folderColor";
import { vizColors } from "../theme";

interface Props {
  session: SessionSummary;
  onView: (session: SessionSummary) => void;
  onKill: (session: SessionSummary) => void;
}

function MetaItem({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <Group gap={4} wrap="nowrap">
      {icon}
      <Text size="xs" c="dimmed" className="cd-mono" truncate style={{ maxWidth: 160 }}>
        {text}
      </Text>
    </Group>
  );
}

export function SessionCard({ session, onView, onKill }: Props) {
  const health = deriveSessionHealth(session);

  function stop(handler: () => void) {
    return (e: MouseEvent) => {
      e.stopPropagation();
      handler();
    };
  }

  return (
    <Card
      className="cd-card"
      onClick={() => onView(session)}
      role="button"
      tabIndex={0}
      aria-label={`Session in ${session.cwd}, ${health.label}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView(session);
        }
      }}
      style={{
        borderLeft: `3px solid ${health.color}`,
        opacity: health.dimmed ? 0.62 : 1,
      }}
    >
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Tooltip label={session.cwd} openDelay={300}>
            <Text
              fw={600}
              size="sm"
              truncate
              className="cd-mono"
              style={{ color: folderColor(session.cwd), minWidth: 0 }}
            >
              {basename(session.cwd)}
            </Text>
          </Tooltip>
          <StatusBadge status={session.status} label={health.label} color={health.color} />
        </Group>

        {session.title && (
          <Text size="sm" fw={500} lineClamp={1} title={session.title}>
            {session.title}
          </Text>
        )}

        <Group gap="sm" wrap="wrap">
          {session.model && <MetaItem icon={<IconCpu size={13} color={vizColors.muted} />} text={session.model} />}
          {session.gitBranch && (
            <MetaItem icon={<IconGitBranch size={13} color={vizColors.muted} />} text={session.gitBranch} />
          )}
          {session.pid && <MetaItem text={`pid ${session.pid}`} />}
        </Group>

        <Box
          px="xs"
          py={6}
          style={{
            background: vizColors.page,
            border: `1px solid ${vizColors.border}`,
            borderRadius: 8,
          }}
        >
          <Group gap={7} wrap="nowrap" align="flex-start">
            <Box mt={2}>{actionIcon(session.lastAction?.type ?? "unknown", session.lastAction?.isError, 14)}</Box>
            <Text size="xs" c="dimmed" lineClamp={2} className="cd-mono" style={{ flex: 1, lineHeight: 1.55 }}>
              {session.lastAction?.summary ?? "No activity yet"}
            </Text>
          </Group>
        </Box>

        <Box>
          <Group justify="space-between" mb={5}>
            <Text className="cd-label" c="dimmed">
              Context
            </Text>
            <Text size="xs" c="dimmed" className="cd-mono">
              {formatTokens(session.usage.contextTokens)} / {formatTokens(session.usage.contextLimit)}
            </Text>
          </Group>
          <ContextMeter used={session.usage.contextTokens} limit={session.usage.contextLimit} />
        </Box>

        <Group justify="space-between">
          <Text size="sm" className="cd-mono">
            <Text span fw={600} className="cd-mono">
              {formatUsd(session.cost.totalUsd)}
            </Text>{" "}
            <Text span c="dimmed" className="cd-mono">
              · {session.messageCount} turns
            </Text>
          </Text>
          <Text size="xs" c="dimmed" className="cd-mono">
            {formatRelativeTime(session.lastActivityAt)}
          </Text>
        </Group>

        <Group grow gap="xs" mt={2}>
          <Button size="xs" variant="default" leftSection={<IconEye size={14} />} onClick={stop(() => onView(session))}>
            View
          </Button>
          <CopyButton value={`claude --resume ${session.id}`} timeout={1500}>
            {({ copied, copy }) => (
              <Tooltip label="Copy the resume command" openDelay={300}>
                <Button
                  size="xs"
                  variant="default"
                  c={copied ? "teal" : undefined}
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  onClick={stop(copy)}
                >
                  {copied ? "Copied" : "Resume"}
                </Button>
              </Tooltip>
            )}
          </CopyButton>
          <Button
            size="xs"
            variant="subtle"
            color="red"
            disabled={!session.pid}
            leftSection={<IconPlayerStopFilled size={14} />}
            onClick={stop(() => onKill(session))}
          >
            Kill
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
