import { vizColors } from "../theme";
import { CONTEXT_CRITICAL, CONTEXT_SERIOUS } from "../utils/sessionHealth";

const SEGMENTS = 24;

interface Props {
  used: number;
  limit: number;
}

/**
 * Segmented context-pressure gauge, styled like a terminal progress bar.
 * Color escalates with the same thresholds sessionHealth uses to flag cards.
 */
export function ContextMeter({ used, limit }: Props) {
  const fraction = limit ? Math.min(1, used / limit) : 0;
  const filled = Math.round(fraction * SEGMENTS);
  const color =
    fraction >= CONTEXT_CRITICAL
      ? vizColors.status.critical
      : fraction >= CONTEXT_SERIOUS
        ? vizColors.status.serious
        : fraction >= 0.5
          ? vizColors.status.warning
          : vizColors.series.blue;

  return (
    <div
      role="progressbar"
      aria-label="Context window used"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      style={{ display: "flex", gap: 2 }}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            height: 6,
            borderRadius: 1,
            background: i < filled ? color : vizColors.gridline,
          }}
        />
      ))}
    </div>
  );
}
