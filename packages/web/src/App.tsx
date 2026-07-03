import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActionIcon,
  AppShell,
  Badge,
  Button,
  Group,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconRefresh, IconSearch, IconTerminal } from "@tabler/icons-react";
import type { SessionSummary, SessionStatus } from "@claude-dashboard/shared";
import { fetchSnapshot, killSession } from "./api/client";
import { SNAPSHOT_QUERY_KEY } from "./api/queryKeys";
import { useDashboardSocket } from "./api/useDashboardSocket";
import { StatsHeader } from "./components/StatsHeader";
import { SessionCard } from "./components/SessionCard";
import { SessionDetailDrawer } from "./components/SessionDetailDrawer";
import { NewSessionModal } from "./components/NewSessionModal";

type FilterOption = "all" | "active" | "ended";

export default function App() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterOption>("active");
  const [selected, setSelected] = useState<SessionSummary | null>(null);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: SNAPSHOT_QUERY_KEY,
    queryFn: fetchSnapshot,
    refetchInterval: 5000, // fallback poll in case the WebSocket connection drops
  });

  useDashboardSocket((message) => notifications.show({ title: "Dashboard error", message, color: "red" }));

  const killMutation = useMutation({
    mutationFn: (session: SessionSummary) => killSession(session.pid!),
    onSuccess: (_res, session) => {
      notifications.show({ title: "Kill signal sent", message: `Stopping session in ${session.cwd}`, color: "orange" });
      queryClient.invalidateQueries({ queryKey: SNAPSHOT_QUERY_KEY });
    },
    onError: (err: Error) => notifications.show({ title: "Failed to kill session", message: err.message, color: "red" }),
  });

  function handleKill(session: SessionSummary) {
    if (!session.pid) return;
    const ok = window.confirm(`Kill the Claude Code process (pid ${session.pid}) running in ${session.cwd}?`);
    if (ok) killMutation.mutate(session);
  }

  const sessions = data?.sessions ?? [];
  const recentDirs = useMemo(() => Array.from(new Set(sessions.map((s) => s.cwd))).slice(0, 20), [sessions]);

  const filtered = useMemo(() => {
    const activeStatuses: SessionStatus[] = ["running", "waiting_input", "idle"];
    return sessions.filter((s) => {
      if (filter === "active" && !activeStatuses.includes(s.status)) return false;
      if (filter === "ended" && s.status !== "ended") return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!s.cwd.toLowerCase().includes(q) && !(s.gitBranch ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sessions, filter, search]);

  return (
    <AppShell header={{ height: 64 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <IconTerminal size={22} />
            <Title order={4}>Claude Sessions Dashboard</Title>
            {isLoading && <Loader size="xs" />}
          </Group>
          <Group gap="sm">
            <Badge variant="dot" color="green">
              live
            </Badge>
            <Tooltip label="Refresh now">
              <ActionIcon
                variant="default"
                onClick={() => queryClient.invalidateQueries({ queryKey: SNAPSHOT_QUERY_KEY })}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setNewSessionOpen(true)}>
              New session
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        {data && <StatsHeader totals={data.totals} />}

        <Group justify="space-between" mt="lg" mb="sm">
          <TextInput
            placeholder="Filter by folder or branch…"
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={320}
          />
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as FilterOption)}
            data={[
              { label: "Active", value: "active" },
              { label: "All", value: "all" },
              { label: "Ended", value: "ended" },
            ]}
          />
        </Group>

        {filtered.length === 0 && !isLoading && (
          <Text c="dimmed" ta="center" mt="xl">
            No sessions match. Try a different filter, or launch a new one.
          </Text>
        )}

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="md">
          {filtered.map((session) => (
            <SessionCard key={session.transcriptPath} session={session} onView={setSelected} onKill={handleKill} />
          ))}
        </SimpleGrid>
      </AppShell.Main>

      <SessionDetailDrawer session={selected} onClose={() => setSelected(null)} onKill={handleKill} />
      <NewSessionModal opened={newSessionOpen} onClose={() => setNewSessionOpen(false)} recentDirs={recentDirs} />
    </AppShell>
  );
}
