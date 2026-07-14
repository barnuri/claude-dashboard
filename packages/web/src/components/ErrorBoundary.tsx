import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, Button, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

interface Props {
  children: ReactNode;
  /** What broke, shown in the fallback UI (e.g. "Session card", "Stats header"). */
  label: string;
}

interface State {
  error: Error | null;
}

/** React error boundaries must be a class component — there is no hook equivalent. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary] ${this.props.label} crashed:`, error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    return (
      <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light" title={`${this.props.label} hit an error`}>
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {error.message}
          </Text>
          <Button size="xs" variant="light" color="red" onClick={this.handleRetry}>
            Try again
          </Button>
        </Stack>
      </Alert>
    );
  }
}
