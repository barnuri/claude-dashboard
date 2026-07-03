import { Group, Text } from "@mantine/core";
import type { SessionStatus } from "@claude-dashboard/shared";
import { vizColors } from "../theme";

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string }> = {
  running: { label: "Running", color: vizColors.status.good },
  waiting_input: { label: "Needs you", color: vizColors.status.warning },
  idle: { label: "Idle", color: vizColors.muted },
  ended: { label: "Ended", color: vizColors.status.ended },
};

/** Statuses whose LED pulses — the session is alive and moving right now. */
const PULSING: SessionStatus[] = ["running", "waiting_input"];

interface Props {
  status: SessionStatus;
  /** Override the label/color derived from status (e.g. to reflect a richer health level). */
  label?: string;
  color?: string;
}

/** Flight-strip status chip: an LED dot plus an uppercase mono label. */
export function StatusBadge({ status, label, color }: Props) {
  const cfg = STATUS_CONFIG[status];
  const resolvedColor = color ?? cfg.color;
  const resolvedLabel = label ?? cfg.label;
  const pulse = PULSING.includes(status);
  return (
    <Group gap={7} wrap="nowrap" style={{ flexShrink: 0 }}>
      <span
        className={`cd-led${pulse ? " cd-led--pulse" : ""}`}
        style={{ color: resolvedColor }}
        aria-hidden
      />
      <Text className="cd-label" style={{ color: resolvedColor }}>
        {resolvedLabel}
      </Text>
    </Group>
  );
}
