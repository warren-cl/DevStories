/**
 * Unit tests for Task type guard (isTask)
 */

import { describe, it, expect } from "vitest";
import { isTask, Task } from "../../types/task";

describe("isTask", () => {
  it("returns true for a valid Task object", () => {
    const task: Task = {
      id: "TASK-001",
      title: "Implement login",
      taskType: "code",
      story: "DS-00001",
      status: "todo",
      priority: 1,
      created: new Date(),
      content: "# Implement login",
    };
    expect(isTask(task)).toBe(true);
  });

  it("returns true for a minimal object with taskType and story", () => {
    expect(isTask({ taskType: "code", story: "DS-001" })).toBe(true);
  });

  it("returns false for a Story (has type, not taskType)", () => {
    expect(isTask({ id: "DS-001", type: "feature", epic: "EPIC-001" })).toBe(false);
  });

  it("returns false for an Epic", () => {
    expect(isTask({ id: "EPIC-001", title: "Auth", theme: "THEME-001" })).toBe(false);
  });

  it("returns false for a Theme", () => {
    expect(isTask({ id: "THEME-001", title: "Platform" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isTask(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isTask(undefined)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isTask("task")).toBe(false);
  });

  it("returns false for an object with only taskType (missing story)", () => {
    expect(isTask({ taskType: "code" })).toBe(false);
  });

  it("returns false for an object with only story (missing taskType)", () => {
    expect(isTask({ story: "DS-001" })).toBe(false);
  });
});
