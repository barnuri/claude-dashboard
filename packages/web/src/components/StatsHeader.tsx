import { Card, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { DonutChart } from "@mantine/charts";
import type { DashboardTotals } from "@claude-dashboard/shared";
import { formatTokens, formatUsd } from "../utils/format";
import { vizColors } from "../theme";

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card padding="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} lh={1.2}>
        {label}
      </Text>
      <Text size="28px" fw={700} mt={4} lh={1.1}>
        {value}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed" mt={2}>
          {sub}
        </Text>
      )}
    </Card>
  );
}

export function StatsHeader({ totals }: { totals: DashboardTotals }) {
  const chartData = [
    { name: "Input", value: totals.totalInputTokens, color: vizColors.series.blue },
    { name: "Output", value: totals.totalOutputTokens, color: vizColors.series.aqua },
    { name: "Cache write", value: totals.totalCacheCreationTokens, color: vizColors.series.yellow },
    { name: "Cache read", value: totals.totalCacheReadTokens, color: vizColors.series.violet },
  ].filter((d) => d.value > 0);

  const totalTokens =
    totals.totalInputTokens + totals.totalOutputTokens + totals.totalCacheCreationTokens + totals.totalCacheReadTokens;

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
      <StatTile label="Sessions" value={String(totals.sessionCount)} sub={`${totals.runningCount} active`} />
      <StatTile label="Total cost" value={formatUsd(totals.totalCostUsd)} sub="across all sessions" />
      <StatTile
        label="Tokens"
        value={formatTokens(totalTokens)}
        sub={`${formatTokens(totals.totalInputTokens)} in · ${formatTokens(totals.totalOutputTokens)} out`}
      />
      <Card padding="md">
        <Group gap="md" wrap="nowrap" align="center">
          <DonutChart
            data={chartData}
            size={64}
            thickness={10}
            withTooltip
            tooltipDataSource="segment"
            strokeWidth={0}
          />
          <Stack gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Token mix
            </Text>
            {chartData.map((d) => (
              <Group key={d.name} gap={6}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: d.color, display: "inline-block" }} />
                <Text size="xs" c="dimmed">
                  {d.name} {formatTokens(d.value)}
                </Text>
              </Group>
            ))}
          </Stack>
        </Group>
      </Card>
    </SimpleGrid>
  );
}
