import { describe, expect, test } from "bun:test";
import type { NativeTaskEntry } from "@claude-dashboard/shared";
import { partitionTaskBoard } from "../packages/web/src/utils/taskBoard";

function task(id: string, status: NativeTaskEntry["status"]): NativeTaskEntry {
  return { id, subject: `task ${id}`, status };
}

describe("partitionTaskBoard", () => {
  test("returns everything visible and no overflow when under the limit", () => {
    const tasks = [task("1", "pending"), task("2", "completed")];
    expect(partitionTaskBoard(tasks, 5)).toEqual({ visible: tasks, hiddenPending: 0, hiddenDone: 0 });
  });

  test("orders incomplete tasks before completed ones", () => {
    const tasks = [task("1", "completed"), task("2", "pending"), task("3", "in_progress")];
    const { visible } = partitionTaskBoard(tasks, 5);
    expect(visible.map((t) => t.id)).toEqual(["2", "3", "1"]);
  });

  test("collapses completed tasks into hiddenDone first, keeping incomplete ones visible", () => {
    const tasks = [
      task("1", "completed"),
      task("2", "pending"),
      task("3", "pending"),
      task("4", "pending"),
    ];
    const { visible, hiddenPending, hiddenDone } = partitionTaskBoard(tasks, 3);
    expect(visible.map((t) => t.id)).toEqual(["2", "3", "4"]);
    expect(hiddenPending).toBe(0);
    expect(hiddenDone).toBe(1);
  });

  test("splits overflow correctly when hidden tasks are a mix of statuses", () => {
    const tasks = [
      task("1", "pending"),
      task("2", "pending"),
      task("3", "in_progress"),
      task("4", "pending"),
      task("5", "completed"),
      task("6", "completed"),
    ];
    const { visible, hiddenPending, hiddenDone } = partitionTaskBoard(tasks, 3);
    expect(visible).toHaveLength(3);
    expect(hiddenPending).toBe(1);
    expect(hiddenDone).toBe(2);
  });

  test("exactly at the limit produces no overflow", () => {
    const tasks = [task("1", "pending"), task("2", "pending")];
    expect(partitionTaskBoard(tasks, 2)).toEqual({ visible: tasks, hiddenPending: 0, hiddenDone: 0 });
  });

  test("all-completed board collapses entirely into hiddenDone beyond the limit", () => {
    const tasks = [task("1", "completed"), task("2", "completed"), task("3", "completed")];
    const { visible, hiddenPending, hiddenDone } = partitionTaskBoard(tasks, 1);
    expect(visible.map((t) => t.id)).toEqual(["1"]);
    expect(hiddenPending).toBe(0);
    expect(hiddenDone).toBe(2);
  });

  test("empty board", () => {
    expect(partitionTaskBoard([], 5)).toEqual({ visible: [], hiddenPending: 0, hiddenDone: 0 });
  });
});
