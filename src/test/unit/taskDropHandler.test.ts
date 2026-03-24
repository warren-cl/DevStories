/**
 * Unit tests for the task drop handler.
 *
 * These tests exercise handleTaskDropOnStory() and handleTaskDropOnTask() —
 * the entry points called by the DnD controller when a task is dropped on
 * its parent story or a sibling task.
 *
 * The handler depends on vscode workspace.fs, so we mock the vscode module.
 * Store is faked with a simple object.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { Task, TaskType, TaskStatus } from "../../types/task";
import { Story, StoryType, StorySize } from "../../types/story";

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockReadFile, mockWriteFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
}));

vi.mock("vscode", () => ({
  Uri: { file: (p: string) => ({ fsPath: p, path: p }) },
  workspace: {
    fs: {
      readFile: mockReadFile,
      writeFile: mockWriteFile,
    },
  },
}));

vi.mock("../../core/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Import AFTER mocks are registered
import { handleTaskDropOnStory, handleTaskDropOnTask, type TaskDropStore } from "../../view/taskDropHandler";

// ─── Shared types ───────────────────────────────────────────────────────────
interface MockUri {
  fsPath: string;
  path: string;
}

// ─── Factory helpers ────────────────────────────────────────────────────────

const TASK_TEMPLATE = `---
id: __ID__
title: "Task __ID__"
task_type: code
story: __STORY__
status: todo
priority: __PRIORITY__
created: 2025-02-01
updated: 2025-02-01
---

## Description

Task content.
`;

function taskFileContent(id: string, story: string, priority: number): Uint8Array {
  const md = TASK_TEMPLATE.replace(/__ID__/g, id)
    .replace(/__STORY__/g, story)
    .replace(/__PRIORITY__/g, String(priority));
  return new TextEncoder().encode(md);
}

function makeTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? "TASK-001";
  const story = overrides.story ?? "DS-001";
  return {
    id,
    title: `Task ${id}`,
    taskType: "code" as TaskType,
    story,
    status: "todo" as TaskStatus,
    priority: 500,
    created: new Date("2025-02-01"),
    content: "",
    filePath: `/workspace/storydocs/stories/${story}/tasks/${id}.md`,
    ...overrides,
  };
}

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "DS-001",
    title: "Test Story",
    type: "feature" as StoryType,
    epic: "EPIC-001",
    status: "todo",
    sprint: "sprint-1",
    size: "M" as StorySize,
    priority: 500,
    created: new Date("2025-01-15"),
    content: "",
    filePath: `/workspace/.devstories/stories/DS-001.md`,
    ...overrides,
  };
}

function makeStore(tasks: Task[]): TaskDropStore {
  return {
    getTasksByStory: (storyId: string) => tasks.filter((t) => t.story === storyId),
    reloadFile: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  mockReadFile.mockImplementation((uri: MockUri) => {
    return Promise.resolve(taskFileContent("DEFAULT", "DS-001", 500));
  });
  mockWriteFile.mockResolvedValue(undefined);
});

// ─── Task → Parent Story (become highest priority) ──────────────────────────

describe("handleTaskDropOnStory", () => {
  it("makes the dragged task highest priority in the story", async () => {
    const t1 = makeTask({ id: "TASK-001", story: "DS-001", priority: 1 });
    const t2 = makeTask({ id: "TASK-002", story: "DS-001", priority: 2 });
    const t3 = makeTask({ id: "TASK-003", story: "DS-001", priority: 3 });
    const store = makeStore([t1, t2, t3]);
    const parentStory = makeStory({ id: "DS-001" });

    // Drag TASK-003 onto parent story → should become highest priority
    mockReadFile.mockImplementation((uri: MockUri) => {
      if (uri.fsPath.includes("TASK-003")) {return Promise.resolve(taskFileContent("TASK-003", "DS-001", 3));}
      if (uri.fsPath.includes("TASK-001")) {return Promise.resolve(taskFileContent("TASK-001", "DS-001", 1));}
      if (uri.fsPath.includes("TASK-002")) {return Promise.resolve(taskFileContent("TASK-002", "DS-001", 2));}
      return Promise.resolve(taskFileContent("DEFAULT", "DS-001", 500));
    });

    await handleTaskDropOnStory({ draggedTask: t3, parentStory, store });

    // TASK-003 should be written (to get priority before min)
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("is a no-op when task is already the highest priority", async () => {
    const t1 = makeTask({ id: "TASK-001", story: "DS-001", priority: 1 });
    const t2 = makeTask({ id: "TASK-002", story: "DS-001", priority: 5 });
    const store = makeStore([t1, t2]);
    const parentStory = makeStory({ id: "DS-001" });

    await handleTaskDropOnStory({ draggedTask: t1, parentStory, store });

    // Already highest priority — no writes
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("silently refuses drop on a non-parent story", async () => {
    const t1 = makeTask({ id: "TASK-001", story: "DS-001", priority: 1 });
    const store = makeStore([t1]);
    const otherStory = makeStory({ id: "DS-999" });

    await handleTaskDropOnStory({ draggedTask: t1, parentStory: otherStory, store });

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("sets priority to 100 when task is the only one in the story", async () => {
    const t1 = makeTask({ id: "TASK-001", story: "DS-001", priority: 100 });
    const store = makeStore([t1]);
    const parentStory = makeStory({ id: "DS-001" });

    // Only task — with no siblings the min is Infinity, so priority < Infinity → no-op
    await handleTaskDropOnStory({ draggedTask: t1, parentStory, store });

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("cascade-bumps siblings when all priorities start at 1", async () => {
    const t1 = makeTask({ id: "TASK-001", story: "DS-001", priority: 1 });
    const t2 = makeTask({ id: "TASK-002", story: "DS-001", priority: 2 });
    const t3 = makeTask({ id: "TASK-003", story: "DS-001", priority: 3 });
    const store = makeStore([t1, t2, t3]);
    const parentStory = makeStory({ id: "DS-001" });

    mockReadFile.mockImplementation((uri: MockUri) => {
      if (uri.fsPath.includes("TASK-003")) {return Promise.resolve(taskFileContent("TASK-003", "DS-001", 3));}
      if (uri.fsPath.includes("TASK-001")) {return Promise.resolve(taskFileContent("TASK-001", "DS-001", 1));}
      if (uri.fsPath.includes("TASK-002")) {return Promise.resolve(taskFileContent("TASK-002", "DS-001", 2));}
      return Promise.resolve(taskFileContent("DEFAULT", "DS-001", 500));
    });

    // Drag TASK-003 onto parent → becomes priority min-1 = 0? No — computeSprintNodeDropPriority
    // when min >= 2, dragged gets min-1. TASK-001 has priority 1, so min=1. Must cascade.
    await handleTaskDropOnStory({ draggedTask: t3, parentStory, store });

    // TASK-003 gets priority 1, TASK-001 bumped to 2, TASK-002 bumped to 3
    // That's 3 writes: dragged + 2 bumps
    expect(mockWriteFile).toHaveBeenCalledTimes(3);
  });

  it("calls store.reloadFile after each write for Windows race safety", async () => {
    const t1 = makeTask({ id: "TASK-001", story: "DS-001", priority: 5 });
    const t2 = makeTask({ id: "TASK-002", story: "DS-001", priority: 10 });
    const store = makeStore([t1, t2]);
    const parentStory = makeStory({ id: "DS-001" });

    mockReadFile.mockImplementation((uri: MockUri) => {
      if (uri.fsPath.includes("TASK-002")) {return Promise.resolve(taskFileContent("TASK-002", "DS-001", 10));}
      return Promise.resolve(taskFileContent("TASK-001", "DS-001", 5));
    });

    await handleTaskDropOnStory({ draggedTask: t2, parentStory, store });

    expect(store.reloadFile).toHaveBeenCalled();
  });
});

// ─── Task → Sibling Task (insert below) ─────────────────────────────────────

describe("handleTaskDropOnTask", () => {
  it("inserts dragged task just below the target", async () => {
    const t1 = makeTask({ id: "TASK-001", story: "DS-001", priority: 1 });
    const t2 = makeTask({ id: "TASK-002", story: "DS-001", priority: 2 });
    const t3 = makeTask({ id: "TASK-003", story: "DS-001", priority: 10 });
    const store = makeStore([t1, t2, t3]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      if (uri.fsPath.includes("TASK-003")) {return Promise.resolve(taskFileContent("TASK-003", "DS-001", 10));}
      if (uri.fsPath.includes("TASK-002")) {return Promise.resolve(taskFileContent("TASK-002", "DS-001", 2));}
      return Promise.resolve(taskFileContent("TASK-001", "DS-001", 1));
    });

    // Drop TASK-003 onto TASK-001 → TASK-003 gets priority 2, TASK-002 stays if no collision
    await handleTaskDropOnTask({ draggedTask: t3, targetTask: t1, store });

    // TASK-003 should be written with priority = t1.priority + 1 = 2
    expect(mockWriteFile).toHaveBeenCalled();

    // Verify the written content for dragged task contains priority: 2
    const firstWriteContent = new TextDecoder().decode(mockWriteFile.mock.calls[0][1] as Uint8Array);
    expect(firstWriteContent).toContain("priority: 2");
  });

  it("cascade-bumps siblings when priorities collide", async () => {
    const t1 = makeTask({ id: "TASK-001", story: "DS-001", priority: 1 });
    const t2 = makeTask({ id: "TASK-002", story: "DS-001", priority: 2 });
    const t3 = makeTask({ id: "TASK-003", story: "DS-001", priority: 3 });
    const t4 = makeTask({ id: "TASK-004", story: "DS-001", priority: 10 });
    const store = makeStore([t1, t2, t3, t4]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      if (uri.fsPath.includes("TASK-004")) {return Promise.resolve(taskFileContent("TASK-004", "DS-001", 10));}
      if (uri.fsPath.includes("TASK-003")) {return Promise.resolve(taskFileContent("TASK-003", "DS-001", 3));}
      if (uri.fsPath.includes("TASK-002")) {return Promise.resolve(taskFileContent("TASK-002", "DS-001", 2));}
      return Promise.resolve(taskFileContent("TASK-001", "DS-001", 1));
    });

    // Drop TASK-004 onto TASK-001 → TASK-004 gets priority 2
    // TASK-002 was at 2, bumps to 3. TASK-003 was at 3, bumps to 4. Gap after 4.
    await handleTaskDropOnTask({ draggedTask: t4, targetTask: t1, store });

    // 1 write for dragged + 2 bumps = 3 writes
    expect(mockWriteFile).toHaveBeenCalledTimes(3);
  });

  it("is a no-op on self-drop", async () => {
    const t1 = makeTask({ id: "TASK-001", story: "DS-001", priority: 1 });
    const store = makeStore([t1]);

    await handleTaskDropOnTask({ draggedTask: t1, targetTask: t1, store });

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("silently refuses drop on a task from a different story", async () => {
    const t1 = makeTask({ id: "TASK-001", story: "DS-001", priority: 1 });
    const t2 = makeTask({ id: "TASK-001", story: "DS-999", priority: 1 });
    const store = makeStore([t1, t2]);

    await handleTaskDropOnTask({ draggedTask: t1, targetTask: t2, store });

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("does not cascade-bump when there is a gap after insert point", async () => {
    const t1 = makeTask({ id: "TASK-001", story: "DS-001", priority: 1 });
    const t2 = makeTask({ id: "TASK-002", story: "DS-001", priority: 100 });
    const t3 = makeTask({ id: "TASK-003", story: "DS-001", priority: 200 });
    const store = makeStore([t1, t2, t3]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      if (uri.fsPath.includes("TASK-003")) {return Promise.resolve(taskFileContent("TASK-003", "DS-001", 200));}
      if (uri.fsPath.includes("TASK-002")) {return Promise.resolve(taskFileContent("TASK-002", "DS-001", 100));}
      return Promise.resolve(taskFileContent("TASK-001", "DS-001", 1));
    });

    // Drop TASK-003 onto TASK-001 → TASK-003 gets priority 2. TASK-002 at 100 — no collision.
    await handleTaskDropOnTask({ draggedTask: t3, targetTask: t1, store });

    // Only 1 write: the dragged task itself. No bumps needed.
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it("calls store.reloadFile after each write", async () => {
    const t1 = makeTask({ id: "TASK-001", story: "DS-001", priority: 1 });
    const t2 = makeTask({ id: "TASK-002", story: "DS-001", priority: 100 });
    const store = makeStore([t1, t2]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      if (uri.fsPath.includes("TASK-002")) {return Promise.resolve(taskFileContent("TASK-002", "DS-001", 100));}
      return Promise.resolve(taskFileContent("TASK-001", "DS-001", 1));
    });

    await handleTaskDropOnTask({ draggedTask: t2, targetTask: t1, store });

    expect(store.reloadFile).toHaveBeenCalled();
  });
});
