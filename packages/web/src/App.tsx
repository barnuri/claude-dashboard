import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ActionIcon,
    Alert,
    AppShell,
    Box,
    Button,
    Group,
    Loader,
    NumberInput,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useLocalStorage } from "@mantine/hooks";
import {
    IconInfoCircle,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconTerminal2,
} from "@tabler/icons-react";
import type {
    KillOutcome,
    SessionSummary,
    SessionStatus,
    StatsPeriod,
} from "@claude-dashboard/shared";
import { DEMO_MODE, fetchSnapshot, killSession } from "./api/client";
import { SNAPSHOT_QUERY_KEY } from "./api/queryKeys";
import { useDashboardSocket } from "./api/useDashboardSocket";
import { StatsHeader } from "./components/StatsHeader";
import { SessionCard } from "./components/SessionCard";
import { SessionTerminal } from "./components/SessionTerminal";
import { NewSessionModal } from "./components/NewSessionModal";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isRecentlyEnded } from "./utils/sessionHealth";
import { sortSessions } from "./utils/sessionSort";
import { vizColors } from "./theme";

type FilterOption = "all" | "active" | "ended";

const ACTIVE_STATUSES: SessionStatus[] = ["running", "waiting_input", "idle"];

/** The kill endpoint can report the signal was sent but had no real effect — surface that honestly. */
function killOutcomeNotification(outcome: KillOutcome, cwd: string) {
    switch (outcome) {
        case "killed":
            return { title: "Kill signal sent", message: `Stopping session in ${cwd}`, color: "orange" };
        case "not_found":
            return { title: "Session already gone", message: `No running process found in ${cwd} — it may have already ended`, color: "blue" };
        case "permission_denied":
            return { title: "Permission denied", message: `Could not stop the process in ${cwd} — insufficient permissions`, color: "red" };
        case "error":
            return { title: "Failed to kill session", message: `Could not stop the process in ${cwd}`, color: "red" };
    }
}

/** Header status strip item: LED + mono count, tmux-status-bar style. */
function StatusStripItem({
    color,
    label,
    pulse,
}: {
    color: string;
    label: string;
    pulse?: boolean;
}) {
    return (
        <Group gap={7} wrap='nowrap'>
            <span
                className={`cd-led${pulse ? " cd-led--pulse" : ""}`}
                style={{ color }}
                aria-hidden
            />
            <Text size='xs' className='cd-mono' style={{ color }}>
                {label}
            </Text>
        </Group>
    );
}

export default function App() {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useLocalStorage<FilterOption>({
        key: "claude-dashboard:filter",
        defaultValue: "active",
        getInitialValueInEffect: false,
    });
    const [period, setPeriod] = useLocalStorage<StatsPeriod>({
        key: "claude-dashboard:stats-period",
        defaultValue: "7d",
        getInitialValueInEffect: false,
    });
    const [endedWindowHours, setEndedWindowHours] = useLocalStorage<number>({
        key: "claude-dashboard:ended-window-hours",
        defaultValue: 4,
        getInitialValueInEffect: false,
    });
    const [selected, setSelected] = useState<SessionSummary | null>(null);
    const [newSessionOpen, setNewSessionOpen] = useState(false);
    const [killTarget, setKillTarget] = useState<SessionSummary | null>(null);
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: SNAPSHOT_QUERY_KEY,
        queryFn: fetchSnapshot,
        refetchInterval: 5000, // fallback poll in case the WebSocket connection drops
    });

    useDashboardSocket((message) =>
        notifications.show({ title: "Dashboard error", message, color: "red" }),
    );

    const killMutation = useMutation({
        mutationFn: (session: SessionSummary) => killSession(session.pid!),
        onSuccess: (res, session) => {
            notifications.show(killOutcomeNotification(res.outcome, session.cwd));
            queryClient.invalidateQueries({ queryKey: SNAPSHOT_QUERY_KEY });
            setKillTarget(null);
        },
        onError: (err: Error) => {
            notifications.show({
                title: "Failed to kill session",
                message: err.message,
                color: "red",
            });
            setKillTarget(null);
        },
    });

    function handleKill(session: SessionSummary) {
        if (!session.pid) return;
        setKillTarget(session);
    }

    const sessions = data?.sessions ?? [];
    const recentDirs = useMemo(
        () => Array.from(new Set(sessions.map((s) => s.cwd))).slice(0, 20),
        [sessions],
    );

    const statusCounts = useMemo(() => {
        const counts = { running: 0, waiting: 0, idle: 0, ended: 0 };
        for (const s of sessions) {
            if (s.status === "running") counts.running++;
            else if (s.status === "waiting_input") counts.waiting++;
            else if (s.status === "idle") counts.idle++;
            else counts.ended++;
        }
        return counts;
    }, [sessions]);

    const filterCounts = useMemo(
        () => ({
            active: sessions.filter(
                (s) =>
                    ACTIVE_STATUSES.includes(s.status) ||
                    isRecentlyEnded(s, endedWindowHours),
            ).length,
            all: sessions.length,
            ended: sessions.filter((s) => s.status === "ended").length,
        }),
        [sessions, endedWindowHours],
    );

    const filtered = useMemo(() => {
        const matched = sessions.filter((s) => {
            if (
                filter === "active" &&
                !ACTIVE_STATUSES.includes(s.status) &&
                !isRecentlyEnded(s, endedWindowHours)
            ) {
                return false;
            }
            if (filter === "ended" && s.status !== "ended") return false;
            if (search.trim()) {
                const q = search.toLowerCase();
                if (
                    !s.cwd.toLowerCase().includes(q) &&
                    !(s.gitBranch ?? "").toLowerCase().includes(q)
                )
                    return false;
            }
            return true;
        });
        return sortSessions(matched);
    }, [sessions, filter, search, endedWindowHours]);

    return (
        <AppShell header={{ height: 64 }} padding='md'>
            <AppShell.Header
                style={{
                    background: "rgba(18, 17, 16, 0.85)",
                    backdropFilter: "blur(8px)",
                }}
            >
                <Group h='100%' px='md' justify='space-between' wrap='nowrap'>
                    <Group gap='sm' wrap='nowrap'>
                        <Box
                            style={{
                                width: 30,
                                height: 30,
                                borderRadius: 8,
                                background: vizColors.brand,
                                display: "grid",
                                placeItems: "center",
                                flexShrink: 0,
                            }}
                        >
                            <IconTerminal2 size={18} color='#26140c' />
                        </Box>
                        <Stack gap={0}>
                            <Title order={5} lh={1.2}>
                                Claude Sessions
                            </Title>
                            <Text
                                className='cd-label'
                                c='dimmed'
                                visibleFrom='xs'
                            >
                                local session deck
                            </Text>
                        </Stack>
                        {isLoading && <Loader size='xs' />}
                    </Group>
                    <Group gap='lg' visibleFrom='md'>
                        <StatusStripItem
                            color={vizColors.status.good}
                            label={`${statusCounts.running} running`}
                            pulse={statusCounts.running > 0}
                        />
                        <StatusStripItem
                            color={
                                statusCounts.waiting > 0
                                    ? vizColors.status.warning
                                    : vizColors.muted
                            }
                            label={`${statusCounts.waiting} ${statusCounts.waiting === 1 ? "needs" : "need"} you`}
                            pulse={statusCounts.waiting > 0}
                        />
                        <StatusStripItem
                            color={vizColors.muted}
                            label={`${statusCounts.idle} idle`}
                        />
                    </Group>
                    <Group gap='sm' wrap='nowrap'>
                        <Tooltip label='Refresh now'>
                            <ActionIcon
                                variant='default'
                                size='lg'
                                aria-label='Refresh sessions'
                                onClick={() =>
                                    queryClient.invalidateQueries({
                                        queryKey: SNAPSHOT_QUERY_KEY,
                                    })
                                }
                            >
                                <IconRefresh size={16} />
                            </ActionIcon>
                        </Tooltip>
                        <Button
                            leftSection={<IconPlus size={16} />}
                            onClick={() => setNewSessionOpen(true)}
                        >
                            New session
                        </Button>
                    </Group>
                </Group>
            </AppShell.Header>

            <AppShell.Main>
                {DEMO_MODE && (
                    <Alert
                        icon={<IconInfoCircle size={16} />}
                        color='brand'
                        variant='light'
                        mb='md'
                        title="You're viewing a static demo"
                    >
                        This build has no real backend — it's driven by sample
                        data so you can click around. "Kill" and "New session"
                        simulate what the real app does. Run it locally against
                        your own `~/.claude/projects` for the real thing — see
                        the README.
                    </Alert>
                )}
                {data && (
                    <ErrorBoundary label='Stats header'>
                        <StatsHeader
                            stats={data.statsByPeriod[period]}
                            period={period}
                            onPeriodChange={setPeriod}
                        />
                    </ErrorBoundary>
                )}
                <Group justify='space-between' mt='lg' mb='sm'>
                    <TextInput
                        placeholder='Filter by folder or branch…'
                        aria-label='Filter sessions by folder or branch'
                        leftSection={<IconSearch size={14} />}
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        w={320}
                    />
                    <Group gap='sm'>
                        {filter === "active" && (
                            <Tooltip
                                label='Also show sessions that ended within this many hours'
                                openDelay={300}
                            >
                                <NumberInput
                                    size='xs'
                                    w={150}
                                    min={0}
                                    max={168}
                                    step={1}
                                    value={endedWindowHours}
                                    onChange={(v) =>
                                        setEndedWindowHours(
                                            typeof v === "number" ? v : 0,
                                        )
                                    }
                                    suffix='h ended'
                                    aria-label='Recently-ended window in hours'
                                />
                            </Tooltip>
                        )}
                        <SegmentedControl
                            value={filter}
                            onChange={(v) => setFilter(v as FilterOption)}
                            data={[
                                {
                                    label: `Active · ${filterCounts.active}`,
                                    value: "active",
                                },
                                {
                                    label: `All · ${filterCounts.all}`,
                                    value: "all",
                                },
                                {
                                    label: `Ended · ${filterCounts.ended}`,
                                    value: "ended",
                                },
                            ]}
                        />
                    </Group>
                </Group>

                {filtered.length === 0 && !isLoading && (
                    <Stack align='center' gap='sm' py={64}>
                        <Box
                            style={{
                                width: 56,
                                height: 56,
                                borderRadius: 16,
                                border: `1px dashed ${vizColors.gridline}`,
                                display: "grid",
                                placeItems: "center",
                            }}
                        >
                            <IconTerminal2 size={26} color={vizColors.muted} />
                        </Box>
                        <Text fw={600} ff='var(--cd-font-display)'>
                            No sessions here
                        </Text>
                        <Text size='sm' c='dimmed' ta='center' maw={380}>
                            {search.trim()
                                ? "Nothing matches this filter. Clear the search or switch views."
                                : "Launch a Claude Code session and it will show up here in real time."}
                        </Text>
                        <Button
                            variant='light'
                            leftSection={<IconPlus size={16} />}
                            onClick={() => setNewSessionOpen(true)}
                        >
                            New session
                        </Button>
                    </Stack>
                )}

                <SimpleGrid
                    cols={{ base: 1, sm: 2, lg: 3, xl: 4 }}
                    spacing='sm'
                >
                    {filtered.map((session) => (
                        <ErrorBoundary
                            key={session.transcriptPath}
                            label={`Session card (${session.cwd})`}
                        >
                            <SessionCard
                                session={session}
                                onView={setSelected}
                                onKill={handleKill}
                            />
                        </ErrorBoundary>
                    ))}
                </SimpleGrid>
            </AppShell.Main>

            <ErrorBoundary
                key={selected?.transcriptPath ?? "none"}
                label='Session detail'
            >
                <SessionTerminal
                    session={selected}
                    onClose={() => setSelected(null)}
                    onKill={handleKill}
                />
            </ErrorBoundary>
            <ErrorBoundary label='New session dialog'>
                <NewSessionModal
                    opened={newSessionOpen}
                    onClose={() => setNewSessionOpen(false)}
                    recentDirs={recentDirs}
                />
            </ErrorBoundary>
            <ErrorBoundary label='Kill confirmation dialog'>
                <ConfirmDialog
                    opened={killTarget !== null}
                    title={DEMO_MODE ? "Simulate killing this session?" : "Kill this session?"}
                    confirmLabel={DEMO_MODE ? "Simulate kill" : "Kill session"}
                    loading={killMutation.isPending}
                    onConfirm={() => killTarget && killMutation.mutate(killTarget)}
                    onCancel={() => setKillTarget(null)}
                >
                    {killTarget && (
                        <>
                            This sends a stop signal to the Claude Code process{" "}
                            <Text span className='cd-mono' c='bright'>
                                pid {killTarget.pid}
                            </Text>{" "}
                            running in{" "}
                            <Text span className='cd-mono' c='bright'>
                                {killTarget.cwd}
                            </Text>
                            . Unsaved work in that session stops immediately.
                        </>
                    )}
                </ConfirmDialog>
            </ErrorBoundary>
        </AppShell>
    );
}
