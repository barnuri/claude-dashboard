import {
  IconBrain,
  IconMessageCircle,
  IconTool,
  IconTerminal2,
  IconAlertTriangle,
  IconHelpCircle,
} from "@tabler/icons-react";
import type { LastActionType } from "@claude-dashboard/shared";
import { vizColors } from "../theme";

export function actionIcon(type: LastActionType, isError?: boolean, size = 16) {
  if (isError) return <IconAlertTriangle size={size} color={vizColors.status.critical} />;
  switch (type) {
    case "thinking":
      return <IconBrain size={size} color={vizColors.series.violet} />;
    case "text":
      return <IconMessageCircle size={size} color={vizColors.series.blue} />;
    case "tool_use":
      return <IconTool size={size} color={vizColors.series.yellow} />;
    case "tool_result":
      return <IconTerminal2 size={size} color={vizColors.series.aqua} />;
    case "user_message":
      return <IconMessageCircle size={size} color={vizColors.textSecondary} />;
    default:
      return <IconHelpCircle size={size} color={vizColors.muted} />;
  }
}
