import { Badge } from "@mantine/core";
import type { SessionStatus } from "@claude-dashboard/shared";
import { vizColors } from "../theme";

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string }> = {
  running: { label: "Running", color: vizColors.status.good },
  waiting_input: { label: "Waiting on you", color: vizColors.status.warning },
  idle: { label: "Idle", color: vizColors.muted },
  ended: { label: "Ended", color: vizColors.status.ended },
};

interface Props {
  status: SessionStatus;
  /** Override the label/color derived from status (e.g. to reflect a richer health level). */
  label?: string;
  color?: string;
}

export function StatusBadge({ status, label, color }: Props) {
  const cfg = STATUS_CONFIG[status];
  const resolvedColor = color ?? cfg.color;
  const resolvedLabel = label ?? cfg.label;
  return (
    <Badge
      variant={status === "ended" ? "outline" : "light"}
      color={resolvedColor}
      styles={{ root: { color: resolvedColor, borderColor: resolvedColor } }}
      leftSection={
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 999,
            backgroundColor: resolvedColor,
          }}
        />
      }
    >
      {resolvedLabel}
    </Badge>
  );
}
