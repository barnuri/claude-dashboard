import type {
  CreateSessionRequest,
  CreateSessionResponse,
  DashboardSnapshot,
  KillSessionResponse,
  TranscriptFeedItem,
} from "@claude-dashboard/shared";

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

export function fetchSnapshot(): Promise<DashboardSnapshot> {
  return request<DashboardSnapshot>("/api/snapshot");
}

export interface FeedResponse {
  session: DashboardSnapshot["sessions"][number];
  feed: TranscriptFeedItem[];
}

export function fetchFeed(id: string, limit = 80): Promise<FeedResponse> {
  return request<FeedResponse>(`/api/sessions/feed?id=${encodeURIComponent(id)}&limit=${limit}`);
}

export function createSession(body: CreateSessionRequest): Promise<CreateSessionResponse> {
  return request<CreateSessionResponse>("/api/sessions", { method: "POST", body: JSON.stringify(body) });
}

export function killSession(pid: number, force = false): Promise<KillSessionResponse> {
  return request<KillSessionResponse>("/api/kill", { method: "POST", body: JSON.stringify({ pid, force }) });
}
