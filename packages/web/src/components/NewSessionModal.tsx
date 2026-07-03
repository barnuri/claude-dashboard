import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Modal, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconRocket } from "@tabler/icons-react";
import { createSession } from "../api/client";
import { SNAPSHOT_QUERY_KEY } from "../api/queryKeys";

interface Props {
  opened: boolean;
  onClose: () => void;
  recentDirs: string[];
}

const MODEL_OPTIONS = [
  { value: "", label: "Default (CLI decides)" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
];

const PERMISSION_OPTIONS = [
  { value: "default", label: "Default (ask before risky actions)" },
  { value: "acceptEdits", label: "Auto-accept file edits" },
  { value: "plan", label: "Plan mode (read-only)" },
  { value: "bypassPermissions", label: "Bypass all permission checks (dangerous)" },
];

export function NewSessionModal({ opened, onClose, recentDirs }: Props) {
  const [cwd, setCwd] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [permissionMode, setPermissionMode] = useState("default");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createSession({ cwd, prompt, model: model || undefined, permissionMode: permissionMode as any }),
    onSuccess: (res) => {
      notifications.show({
        title: "Session launched",
        message: `claude is running in ${res.cwd} (pid ${res.pid}). It will appear once it starts writing output.`,
        color: "green",
      });
      queryClient.invalidateQueries({ queryKey: SNAPSHOT_QUERY_KEY });
      setPrompt("");
      onClose();
    },
    onError: (err: Error) => {
      notifications.show({ title: "Failed to launch session", message: err.message, color: "red" });
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Launch a new Claude Code session" size="lg">
      <Stack gap="sm">
        <TextInput
          label="Working directory"
          description="Absolute path to the project this session should run in"
          placeholder="/home/you/projects/my-app"
          value={cwd}
          onChange={(e) => setCwd(e.currentTarget.value)}
          list="recent-dirs"
          required
        />
        <datalist id="recent-dirs">
          {recentDirs.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>

        <Textarea
          label="Initial prompt"
          description="What should Claude do? This runs non-interactively (claude -p)."
          placeholder="Fix the failing tests in src/api and open a summary of what changed."
          minRows={4}
          autosize
          value={prompt}
          onChange={(e) => setPrompt(e.currentTarget.value)}
          required
        />

        <Select label="Model" data={MODEL_OPTIONS} value={model} onChange={(v) => setModel(v ?? "")} />
        <Select
          label="Permission mode"
          data={PERMISSION_OPTIONS}
          value={permissionMode}
          onChange={(v) => setPermissionMode(v ?? "default")}
        />

        {permissionMode === "bypassPermissions" && (
          <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
            Bypassing permissions lets Claude run any tool, including file writes and shell commands, without
            confirmation. Only use this in a sandbox or a directory you trust fully.
          </Alert>
        )}

        <Button
          leftSection={<IconRocket size={16} />}
          loading={mutation.isPending}
          disabled={!cwd.trim() || !prompt.trim()}
          onClick={() => mutation.mutate()}
        >
          Launch session
        </Button>
      </Stack>
    </Modal>
  );
}
