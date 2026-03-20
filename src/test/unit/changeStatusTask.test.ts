/**
 * Unit tests for updateTaskStatus in changeStatusUtils
 */

import { describe, it, expect } from "vitest";
import { updateTaskStatus } from "../../commands/changeStatusUtils";

const STATUSES = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done", isCompletion: true },
];

let contentCounter = 0;
function makeTaskContent(overrides?: Record<string, string>): string {
  contentCounter++;
  const fields: Record<string, string> = {
    id: `TASK-${String(contentCounter).padStart(3, "0")}`,
    title: "Implement login",
    task_type: "code",
    story: "DS-00001",
    status: "todo",
    created: "2025-01-15",
    ...overrides,
  };
  const yaml = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${yaml}\n---\n\n# Implement login\n`;
}

describe("updateTaskStatus", () => {
  it("updates status field", () => {
    const result = updateTaskStatus(makeTaskContent(), "in_progress");
    expect(result).toContain("status: in_progress");
  });

  it("updates the updated field to today", () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = updateTaskStatus(makeTaskContent(), "in_progress");
    expect(result).toMatch(new RegExp(`updated: ['"]?${today}['"]?`));
  });

  it("sets completed_on when transitioning to completion status", () => {
    const result = updateTaskStatus(makeTaskContent(), "done", STATUSES);
    expect(result).toContain("completed_on:");
    expect(result).toContain("status: done");
  });

  it("clears completed_on when transitioning away from completion status", () => {
    const content = makeTaskContent({ status: "done", completed_on: "2025-02-01" });
    const result = updateTaskStatus(content, "todo", STATUSES);
    expect(result).not.toContain("completed_on");
    expect(result).toContain("status: todo");
  });

  it("works without statuses parameter (no completed_on management)", () => {
    const result = updateTaskStatus(makeTaskContent(), "done");
    expect(result).toContain("status: done");
    expect(result).not.toContain("completed_on");
  });
});
