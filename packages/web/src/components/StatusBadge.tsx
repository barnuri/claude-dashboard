import { Badge } from "@mantine/core";
import type { SessionStatus } from "@claude-dashboard/shared";
import { vizColors } from "../theme";

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string }> = {
  running: { label: "Running", color: vizColors.status.good },
  waiting_input: { label: "Waiting on you", color: vizColors.status.warning },
  idle: { label: "Idle", color: vizColors.muted },
  ended: { label: "Ended", color: vizColors.muted },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <Badge
      variant={status === "ended" ? "outline" : "light"}
      color={cfg.color}
      styles={{ root: { color: cfg.color, borderColor: cfg.color } }}
      leftSection={
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 999,
            backgroundColor: cfg.color,
          }}
        />
      }
    >
      {cfg.label}
    </Badge>
  );
}
