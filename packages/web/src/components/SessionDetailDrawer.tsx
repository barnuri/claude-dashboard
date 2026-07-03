import { useQuery } from "@tanstack/react-query";
import { BarChart } from "@mantine/charts";
import {
  Badge,
  Button,
  CopyButton,
  Divider,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Text,
  Timeline,
} from "@mantine/core";
import { IconCheck, IconCopy, IconGitBranch, IconPlayerStopFilled } from "@tabler/icons-react";
import type { SessionSummary } from "@claude-dashboard/shared";
import { fetchFeed } from "../api/client";
import { feedQueryKey } from "../api/queryKeys";
import { StatusBadge } from "./StatusBadge";
import { actionIcon } from "./actionIcons";
import { formatRelativeTime, formatTokens, formatUsd } from "../utils/format";
import { vizColors } from "../theme";

interface Props {
  session: SessionSummary | null;
  onClose: () => void;
  onKill: (session: SessionSummary) => void;
}

export function SessionDetailDrawer({ session, onClose, onKill }: Props) {
  const opened = session !== null;

  const { data } = useQuery({
    queryKey: session ? feedQueryKey(session.id) : ["feed", "none"],
    queryFn: () => fetchFeed(session!.id, 100),
    enabled: opened,
    refetchInterval: opened ? 2000 : false,
  });

  const live = data?.session ?? session;
  const feed = data?.feed ?? [];

  const costData = live
    ? [
        {
          category: "Cost ($)",
          Input: live.cost.inputUsd,
          Output: live.cost.outputUsd,
          "Cache write": live.cost.cacheWriteUsd,
          "Cache read": live.cost.cacheReadUsd,
        },
      ]
    : [];
  const costSeries = [
    { name: "Input", color: vizColors.series.blue },
    { name: "Output", color: vizColors.series.aqua },
    { name: "Cache write", color: vizColors.series.yellow },
    { name: "Cache read", color: vizColors.series.violet },
  ];

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="lg" title={live ? live.cwd : ""}>
      {live && (
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap={6}>
              <StatusBadge status={live.status} />
              {live.model && <Badge variant="default">{live.model}</Badge>}
              {live.gitBranch && (
                <Badge variant="default" leftSection={<IconGitBranch size={12} />}>
                  {live.gitBranch}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              updated {formatRelativeTime(live.lastActivityAt)}
            </Text>
          </Group>

          <Group grow>
            <CopyButton value={`claude --resume ${live.id}`}>
              {({ copied, copy }) => (
                <Button
                  variant="light"
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  onClick={copy}
                >
                  {copied ? "Copied resume command" : "Copy resume command"}
                </Button>
              )}
            </CopyButton>
            <Button
              variant="light"
              color="red"
              disabled={!live.pid}
              leftSection={<IconPlayerStopFilled size={14} />}
              onClick={() => onKill(live)}
            >
              Kill session
            </Button>
          </Group>

          <Divider label="Cost breakdown" labelPosition="left" />
          <Group justify="space-between" align="flex-end">
            <Text size="24px" fw={700}>
              {formatUsd(live.cost.totalUsd)}
            </Text>
            <Text size="xs" c="dimmed">
              {formatTokens(live.usage.contextTokens)} / {formatTokens(live.usage.contextLimit)} context tokens
            </Text>
          </Group>
          <BarChart
            h={110}
            data={costData}
            dataKey="category"
            type="stacked"
            orientation="vertical"
            series={costSeries}
            withTooltip
            withLegend
            withXAxis
            withYAxis={false}
            gridAxis="none"
            valueFormatter={(v) => formatUsd(v)}
          />

          <Divider label="Activity" labelPosition="left" />
          <ScrollArea.Autosize mah={420} type="auto">
            <Timeline active={feed.length} bulletSize={22} lineWidth={2}>
              {feed
                .slice()
                .reverse()
                .map((item, i) => (
                  <Timeline.Item key={i} bullet={actionIcon(item.type, item.isError, 12)}>
                    <Text size="sm" fw={item.role === "assistant" ? 500 : 400}>
                      {item.summary}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatRelativeTime(item.at)}
                    </Text>
                  </Timeline.Item>
                ))}
            </Timeline>
          </ScrollArea.Autosize>
        </Stack>
      )}
    </Drawer>
  );
}
