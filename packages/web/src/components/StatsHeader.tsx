import { Card, Group, SegmentedControl, SimpleGrid, Stack, Text } from "@mantine/core";
import { DonutChart } from "@mantine/charts";
import type { PeriodStats, StatsPeriod } from "@claude-dashboard/shared";
import { formatTokens, formatUsd } from "../utils/format";
import { vizColors } from "../theme";

const PERIOD_OPTIONS: { label: string; value: StatsPeriod }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "14d", value: "14d" },
  { label: "30d", value: "30d" },
  { label: "All", value: "all" },
];

const PERIOD_SUBTITLE: Record<StatsPeriod, string> = {
  "24h": "last 24 hours",
  "7d": "last 7 days",
  "14d": "last 14 days",
  "30d": "last 30 days",
  all: "all time",
};

interface Props {
  stats: PeriodStats;
  period: StatsPeriod;
  onPeriodChange: (period: StatsPeriod) => void;
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <Text className="cd-label" c="dimmed">
        {label}
      </Text>
      <Text fz={22} fw={600} mt={4} lh={1.1} className="cd-mono">
        {value}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed" mt={3} className="cd-mono">
          {sub}
        </Text>
      )}
    </Card>
  );
}

export function StatsHeader({ stats, period, onPeriodChange }: Props) {
  const chartData = [
    { name: "Input", value: stats.totalInputTokens, color: vizColors.series.blue },
    { name: "Output", value: stats.totalOutputTokens, color: vizColors.series.aqua },
    { name: "Cache write", value: stats.totalCacheCreationTokens, color: vizColors.series.yellow },
    { name: "Cache read", value: stats.totalCacheReadTokens, color: vizColors.series.violet },
  ].filter((d) => d.value > 0);

  const totalTokens =
    stats.totalInputTokens + stats.totalOutputTokens + stats.totalCacheCreationTokens + stats.totalCacheReadTokens;

  const windowLabel = PERIOD_SUBTITLE[period];

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Text className="cd-label" c="dimmed">
          Overview — {windowLabel}
        </Text>
        <SegmentedControl
          size="xs"
          value={period}
          onChange={(v) => onPeriodChange(v as StatsPeriod)}
          data={PERIOD_OPTIONS}
        />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
        <StatTile label="Sessions" value={String(stats.sessionCount)} sub={`active ${windowLabel}`} />
        <StatTile label="Cost" value={formatUsd(stats.totalCostUsd)} sub={windowLabel} />
        <StatTile
          label="Tokens"
          value={formatTokens(totalTokens)}
          sub={`${formatTokens(stats.totalInputTokens)} in · ${formatTokens(stats.totalOutputTokens)} out`}
        />
        <Card>
          <Group gap="md" wrap="nowrap" align="center">
            <DonutChart
              data={chartData.length > 0 ? chartData : [{ name: "No data", value: 1, color: vizColors.gridline }]}
              size={56}
              thickness={9}
              withTooltip
              tooltipDataSource="segment"
              strokeWidth={0}
            />
            <Stack gap={3}>
              <Text className="cd-label" c="dimmed">
                Token mix
              </Text>
              {chartData.length === 0 ? (
                <Text size="xs" c="dimmed">
                  No activity {windowLabel}
                </Text>
              ) : (
                chartData.map((d) => (
                  <Group key={d.name} gap={6} wrap="nowrap">
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: d.color,
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    <Text size="xs" c="dimmed" className="cd-mono">
                      {d.name} {formatTokens(d.value)}
                    </Text>
                  </Group>
                ))
              )}
            </Stack>
          </Group>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
