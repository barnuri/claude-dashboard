import type { ReactNode } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { vizColors } from "../theme";

interface Props {
  opened: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app confirmation for destructive actions — never window.confirm. */
export function ConfirmDialog({
  opened,
  title,
  children,
  confirmLabel,
  loading,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={
        <Group gap={8}>
          <IconAlertTriangle size={18} color={vizColors.status.critical} />
          <Text fw={600}>{title}</Text>
        </Group>
      }
      centered
      size="md"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed" component="div">
          {children}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button color="red" loading={loading} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
