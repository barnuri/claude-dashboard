import { useQuery } from "@tanstack/react-query";
import { BarChart } from "@mantine/charts";
import {
  Box,
  Button,
  CopyButton,
  Divider,
  Drawer,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Timeline,
} from "@mantine/core";
import { IconCheck, IconCopy, IconCpu, IconGitBranch, IconPlayerStopFilled } from "@tabler/icons-react";
import type { SessionSummary } from "@claude-dashboard/shared";
import { fetchFeed } from "../api/client";
import { feedQueryKey } from "../api/queryKeys";
import { StatusBadge } from "./StatusBadge";
import { ContextMeter } from "./ContextMeter";
import { actionIcon } from "./actionIcons";
import { basename, formatRelativeTime, formatTokens, formatUsd } from "../utils/format";
import { vizColors } from "../theme";

interface Props {
  session: SessionSummary | null;
  onClose: () => void;
  onKill: (session: SessionSummary) => void;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text className="cd-label" c="dimmed">
        {label}
      </Text>
      <Text fz={20} fw={600} mt={2} className="cd-mono">
        {value}
      </Text>
    </Box>
  );
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
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      title={
        live ? (
          <Stack gap={2}>
            <Text fw={600} ff="var(--cd-font-display)" fz="lg">
              {basename(live.cwd)}
            </Text>
            <Text size="xs" c="dimmed" className="cd-mono">
              {live.cwd}
            </Text>
          </Stack>
        ) : (
          ""
        )
      }
    >
      {live && (
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="md">
              <StatusBadge status={live.status} />
              {live.model && (
                <Group gap={4} wrap="nowrap">
                  <IconCpu size={13} color={vizColors.muted} />
                  <Text size="xs" c="dimmed" className="cd-mono">
                    {live.model}
                  </Text>
                </Group>
              )}
              {live.gitBranch && (
                <Group gap={4} wrap="nowrap">
                  <IconGitBranch size={13} color={vizColors.muted} />
                  <Text size="xs" c="dimmed" className="cd-mono">
                    {live.gitBranch}
                  </Text>
                </Group>
              )}
            </Group>
            <Text size="xs" c="dimmed" className="cd-mono">
              updated {formatRelativeTime(live.lastActivityAt)}
            </Text>
          </Group>

          <Group grow>
            <CopyButton value={`claude --resume ${live.id}`}>
              {({ copied, copy }) => (
                <Button
                  variant="default"
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

          <SimpleGrid cols={3} spacing="md">
            <MiniStat label="Cost" value={formatUsd(live.cost.totalUsd)} />
            <MiniStat label="Turns" value={String(live.messageCount)} />
            <MiniStat
              label="Context"
              value={`${formatTokens(live.usage.contextTokens)} / ${formatTokens(live.usage.contextLimit)}`}
            />
          </SimpleGrid>
          <ContextMeter used={live.usage.contextTokens} limit={live.usage.contextLimit} />

          <Divider label="Cost breakdown" labelPosition="left" />
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
                    <Text size="xs" c="dimmed" className="cd-mono">
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
