import { useEffect, useState } from "react";
import { Box, Text } from "@mantine/core";
import { logStreamUrl } from "../api/client";

/** Cap the buffered output so a long-running session doesn't grow this panel's memory unbounded. */
const MAX_BUFFERED_CHARS = 200_000;

interface Props {
  sessionId: string;
  logPath: string | null;
}

/** Raw SSE log tail. Scrolling/following is owned by the parent terminal body. */
export function LiveOutputPanel({ sessionId, logPath }: Props) {
  const [output, setOutput] = useState("");

  useEffect(() => {
    if (!logPath) return;
    setOutput("");

    const source = new EventSource(logStreamUrl(sessionId));
    source.onmessage = (event) => {
      const chunk = JSON.parse(event.data) as string;
      setOutput((prev) => {
        const next = prev + chunk;
        return next.length > MAX_BUFFERED_CHARS ? next.slice(next.length - MAX_BUFFERED_CHARS) : next;
      });
    };

    return () => source.close();
  }, [sessionId, logPath]);

  if (!logPath) {
    return (
      <Text size="sm" c="dimmed">
        No live output available for this session.
      </Text>
    );
  }

  return (
    <Box component="pre" className="cd-mono" fz="xs" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
      {output || "Waiting for output…"}
    </Box>
  );
}
