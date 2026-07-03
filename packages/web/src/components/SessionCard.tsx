import { Badge, Box, Button, Card, Group, Progress, Stack, Text, Tooltip } from "@mantine/core";
import { IconCopy, IconEye, IconGitBranch, IconPlayerStopFilled } from "@tabler/icons-react";
import type { SessionSummary } from "@claude-dashboard/shared";
import { StatusBadge } from "./StatusBadge";
import { actionIcon } from "./actionIcons";
import { basename, formatRelativeTime, formatTokens, formatUsd } from "../utils/format";
import { vizColors } from "../theme";

interface Props {
  session: SessionSummary;
  onView: (session: SessionSummary) => void;
  onKill: (session: SessionSummary) => void;
}

export function SessionCard({ session, onView, onKill }: Props) {
  const contextPct = session.usage.contextLimit
    ? Math.min(100, (session.usage.contextTokens / session.usage.contextLimit) * 100)
    : 0;
  const contextColor =
    contextPct > 85 ? vizColors.status.critical : contextPct > 60 ? vizColors.status.warning : vizColors.series.blue;

  return (
    <Card padding="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Tooltip label={session.cwd} openDelay={300}>
            <Text fw={600} truncate style={{ maxWidth: 220 }}>
              {basename(session.cwd)}
            </Text>
          </Tooltip>
          <StatusBadge status={session.status} />
        </Group>

        <Group gap={6} wrap="wrap">
          {session.model && (
            <Badge variant="default" size="sm">
              {session.model}
            </Badge>
          )}
          {session.gitBranch && (
            <Badge variant="default" size="sm" leftSection={<IconGitBranch size={12} />}>
              {session.gitBranch}
            </Badge>
          )}
          {session.pid && (
            <Badge variant="default" size="sm" c="dimmed">
              pid {session.pid}
            </Badge>
          )}
        </Group>

        <Group gap={6} wrap="nowrap" align="flex-start">
          <Box mt={2}>{actionIcon(session.lastAction?.type ?? "unknown", session.lastAction?.isError)}</Box>
          <Text size="sm" c="dimmed" lineClamp={2} style={{ flex: 1 }}>
            {session.lastAction?.summary ?? "No activity yet"}
          </Text>
        </Group>

        <Box>
          <Group justify="space-between" mb={2}>
            <Text size="xs" c="dimmed">
              Context used
            </Text>
            <Text size="xs" c="dimmed">
              {formatTokens(session.usage.contextTokens)} / {formatTokens(session.usage.contextLimit)}
            </Text>
          </Group>
          <Progress value={contextPct} color={contextColor} size="sm" radius="xl" />
        </Box>

        <Group justify="space-between">
          <Text size="sm">
            <Text span fw={600}>
              {formatUsd(session.cost.totalUsd)}
            </Text>{" "}
            <Text span c="dimmed">
              · {session.messageCount} turns
            </Text>
          </Text>
          <Text size="xs" c="dimmed">
            {formatRelativeTime(session.lastActivityAt)}
          </Text>
        </Group>

        <Group grow gap="xs" mt={4}>
          <Button size="xs" variant="light" leftSection={<IconEye size={14} />} onClick={() => onView(session)}>
            View
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconCopy size={14} />}
            onClick={() => navigator.clipboard.writeText(`claude --resume ${session.id}`)}
          >
            Resume
          </Button>
          <Button
            size="xs"
            variant="light"
            color="red"
            disabled={!session.pid}
            leftSection={<IconPlayerStopFilled size={14} />}
            onClick={() => onKill(session)}
          >
            Kill
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
