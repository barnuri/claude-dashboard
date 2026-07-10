import { useEffect, useRef, useState } from "react";
import { Box, ScrollArea, Text } from "@mantine/core";
import { logStreamUrl } from "../api/client";

/** Cap the buffered output so a long-running session doesn't grow this panel's memory unbounded. */
const MAX_BUFFERED_CHARS = 200_000;

interface Props {
  sessionId: string;
  logPath: string | null;
}

export function LiveOutputPanel({ sessionId, logPath }: Props) {
  const [output, setOutput] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight });
  }, [output]);

  if (!logPath) {
    return (
      <Text size="sm" c="dimmed">
        No live output available for this session.
      </Text>
    );
  }

  return (
    <ScrollArea.Autosize mah={280} type="auto" viewportRef={viewportRef}>
      <Box component="pre" className="cd-mono" fz="xs" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
        {output || "Waiting for output…"}
      </Box>
    </ScrollArea.Autosize>
  );
}
