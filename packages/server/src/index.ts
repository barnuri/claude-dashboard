import type { CreateSessionRequest, ServerEvent } from "@claude-dashboard/shared";
import { PORT, POLL_INTERVAL_MS, WEB_DIST } from "./config";
import { buildDashboardSnapshot } from "./sessions";
import { getTranscriptFeed } from "./transcript";
import { killProcess } from "./processes";
import { launchSession, LaunchError } from "./launch";
import { StaticFileServer } from "./static";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const sockets = new Set<import("bun").ServerWebSocket<unknown>>();

const staticServer = new StaticFileServer(WEB_DIST);

function broadcast(event: ServerEvent) {
  const payload = JSON.stringify(event);
  for (const ws of sockets) {
    try {
      ws.send(payload);
    } catch {
      // ignore dead sockets; close handler will clean them up
    }
  }
}

async function pollAndBroadcast() {
  try {
    const snapshot = await buildDashboardSnapshot();
    broadcast({ type: "snapshot", data: snapshot });
  } catch (err: any) {
    broadcast({ type: "error", message: err?.message ?? String(err) });
  }
}

setInterval(pollAndBroadcast, POLL_INTERVAL_MS);

const server = Bun.serve({
  port: PORT,
  idleTimeout: 0,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/api/snapshot" && req.method === "GET") {
      const snapshot = await buildDashboardSnapshot();
      return json(snapshot);
    }

    if (url.pathname === "/api/sessions/feed" && req.method === "GET") {
      const id = url.searchParams.get("id");
      const limit = Number(url.searchParams.get("limit") ?? 60);
      if (!id) return json({ error: "id query param is required" }, 400);
      const snapshot = await buildDashboardSnapshot();
      const session = snapshot.sessions.find((s) => s.id === id);
      if (!session) return json({ error: "session not found" }, 404);
      const feed = getTranscriptFeed(session.transcriptPath, limit);
      return json({ session, feed });
    }

    if (url.pathname === "/api/sessions" && req.method === "POST") {
      try {
        const body = (await req.json()) as CreateSessionRequest;
        const result = await launchSession(body);
        pollAndBroadcast();
        return json(result, 201);
      } catch (err) {
        if (err instanceof LaunchError) return json({ error: err.message }, 400);
        return json({ error: String(err) }, 500);
      }
    }

    if (url.pathname === "/api/kill" && req.method === "POST") {
      try {
        const body = (await req.json()) as { pid: number; force?: boolean };
        if (!body.pid) return json({ error: "pid is required" }, 400);
        const outcome = killProcess(body.pid, body.force ? "SIGKILL" : "SIGTERM");
        setTimeout(pollAndBroadcast, 300);
        return json({ ok: outcome === "killed", pid: body.pid, signal: body.force ? "SIGKILL" : "SIGTERM", outcome });
      } catch (err) {
        return json({ error: String(err) }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "not found" }, 404);
    }

    if (req.method === "GET" && staticServer.hasRoot()) {
      const response = await staticServer.serve(url.pathname);
      if (response) {
        return response;
      }
    }

    return json({ error: "not found" }, 404);
  },
  websocket: {
    open(ws) {
      sockets.add(ws);
      buildDashboardSnapshot()
        .then((snapshot) => ws.send(JSON.stringify({ type: "snapshot", data: snapshot } satisfies ServerEvent)))
        .catch(() => {});
    },
    close(ws) {
      sockets.delete(ws);
    },
    message() {
      // clients don't send anything meaningful; this is a push-only channel
    },
  },
});

console.log(`claude-dashboard server listening on http://localhost:${server.port}`);
