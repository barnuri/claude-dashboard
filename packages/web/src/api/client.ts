import type {
  CreateSessionRequest,
  CreateSessionResponse,
  DashboardSnapshot,
  KillSessionResponse,
  TranscriptFeedItem,
} from "@claude-dashboard/shared";

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface FeedResponse {
  session: DashboardSnapshot["sessions"][number];
  feed: TranscriptFeedItem[];
}

export async function fetchSnapshot(): Promise<DashboardSnapshot> {
  if (DEMO_MODE) {
    const { demoStore } = await import("../demo/mockData");
    return demoStore.getSnapshot();
  }
  return request<DashboardSnapshot>("/api/snapshot");
}

export async function fetchFeed(id: string, limit = 80): Promise<FeedResponse> {
  if (DEMO_MODE) {
    const { demoStore } = await import("../demo/mockData");
    return demoStore.getFeed(id);
  }
  return request<FeedResponse>(`/api/sessions/feed?id=${encodeURIComponent(id)}&limit=${limit}`);
}

export async function createSession(body: CreateSessionRequest): Promise<CreateSessionResponse> {
  if (DEMO_MODE) {
    const { demoStore } = await import("../demo/mockData");
    await new Promise((r) => setTimeout(r, 400));
    return demoStore.launch(body.cwd, body.prompt, body.model);
  }
  return request<CreateSessionResponse>("/api/sessions", { method: "POST", body: JSON.stringify(body) });
}

export function logStreamUrl(id: string): string {
  return `/api/sessions/log-stream?id=${encodeURIComponent(id)}`;
}

export async function killSession(pid: number, force = false): Promise<KillSessionResponse> {
  if (DEMO_MODE) {
    const { demoStore } = await import("../demo/mockData");
    await new Promise((r) => setTimeout(r, 200));
    demoStore.kill(pid);
    return { ok: true, pid, signal: force ? "SIGKILL" : "SIGTERM" };
  }
  return request<KillSessionResponse>("/api/kill", { method: "POST", body: JSON.stringify({ pid, force }) });
}
