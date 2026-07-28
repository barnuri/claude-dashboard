import type { NativeTaskEntry } from "@claude-dashboard/shared";

export interface PartitionedTaskBoard {
  visible: NativeTaskEntry[];
  hiddenPending: number;
  hiddenDone: number;
}

/**
 * Orders a reconstructed task board for display: incomplete tasks first, completed ones pushed
 * toward the overflow so they're the first to collapse when the list is longer than `maxVisible`.
 */
export function partitionTaskBoard(tasks: NativeTaskEntry[], maxVisible: number): PartitionedTaskBoard {
  const incomplete = tasks.filter((task) => task.status !== "completed");
  const completed = tasks.filter((task) => task.status === "completed");
  const ordered = [...incomplete, ...completed];

  const visible = ordered.slice(0, maxVisible);
  const hidden = ordered.slice(maxVisible);
  const hiddenPending = hidden.filter((task) => task.status !== "completed").length;
  const hiddenDone = hidden.length - hiddenPending;

  return { visible, hiddenPending, hiddenDone };
}
