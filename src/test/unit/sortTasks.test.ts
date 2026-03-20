/**
 * Unit tests for sortTasks in storiesProviderUtils
 */

import { describe, it, expect } from "vitest";
import { sortTasks } from "../../view/storiesProviderUtils";
import { Task } from "../../types/task";

function makeTask(id: string, priority: number): Task {
  return {
    id,
    title: `Task ${id}`,
    taskType: "code",
    story: "DS-00001",
    status: "todo",
    priority,
    created: new Date("2025-01-15"),
    content: "",
  };
}

describe("sortTasks", () => {
  it("sorts by priority ascending", () => {
    const tasks = [makeTask("TASK-002", 3), makeTask("TASK-001", 1), makeTask("TASK-003", 2)];
    const sorted = sortTasks(tasks);
    expect(sorted.map((t) => t.id)).toEqual(["TASK-001", "TASK-003", "TASK-002"]);
  });

  it("sorts by ID number when priorities are equal", () => {
    const tasks = [makeTask("TASK-003", 1), makeTask("TASK-001", 1), makeTask("TASK-002", 1)];
    const sorted = sortTasks(tasks);
    expect(sorted.map((t) => t.id)).toEqual(["TASK-001", "TASK-002", "TASK-003"]);
  });

  it("handles empty array", () => {
    expect(sortTasks([])).toEqual([]);
  });

  it("handles single task", () => {
    const tasks = [makeTask("TASK-001", 1)];
    expect(sortTasks(tasks)).toEqual(tasks);
  });

  it("does not mutate the original array", () => {
    const tasks = [makeTask("TASK-002", 2), makeTask("TASK-001", 1)];
    const original = [...tasks];
    sortTasks(tasks);
    expect(tasks.map((t) => t.id)).toEqual(original.map((t) => t.id));
  });

  it("priority takes precedence over ID order", () => {
    const tasks = [makeTask("TASK-001", 5), makeTask("TASK-010", 1)];
    const sorted = sortTasks(tasks);
    expect(sorted[0].id).toBe("TASK-010");
  });
});
