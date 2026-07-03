import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DashboardSnapshot, ServerEvent } from "@claude-dashboard/shared";
import { SNAPSHOT_QUERY_KEY } from "./queryKeys";

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws`;
}

/** Keeps the `snapshot` query fresh in real time via the backend's push WebSocket. */
export function useDashboardSocket(onError?: (message: string) => void) {
  const queryClient = useQueryClient();
  const retryDelay = useRef(1000);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      socket = new WebSocket(wsUrl());

      socket.onopen = () => {
        retryDelay.current = 1000;
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerEvent;
          if (msg.type === "snapshot") {
            queryClient.setQueryData<DashboardSnapshot>(SNAPSHOT_QUERY_KEY, msg.data);
          } else if (msg.type === "error") {
            onError?.(msg.message);
          }
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        if (closed) return;
        retryTimer = setTimeout(connect, retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 1.7, 15000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
