/**
 * Unit tests for the backlog drop handler.
 *
 * These tests exercise handleBacklogDrop() — the entry point called by the
 * DnD controller when a story is dropped in the BACKLOG view.
 *
 * The handler depends on vscode workspace.fs and window.showWarningMessage,
 * so we mock the vscode module.  Store, SortService, and ConfigService are
 * faked with simple objects.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { Story, StoryType, StorySize } from "../../types/story";
import { SprintNode, BACKLOG_SPRINT_ID } from "../../types/sprintNode";
import type { SortState } from "../../core/sortService";

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockReadFile, mockWriteFile, mockShowWarningMessage } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockShowWarningMessage: vi.fn(),
}));

vi.mock("vscode", () => ({
  Uri: { file: (p: string) => ({ fsPath: p, path: p }) },
  workspace: {
    fs: {
      readFile: mockReadFile,
      writeFile: mockWriteFile,
    },
  },
  window: {
    showWarningMessage: mockShowWarningMessage,
  },
}));

vi.mock("../../core/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Import AFTER mocks are registered
import {
  handleBacklogDrop,
  type BacklogDropParams,
  type BacklogDropStore,
  type BacklogDropSortService,
  type BacklogDropConfigService,
} from "../../view/backlogDropHandler";

// ─── Shared type for mock URI ───────────────────────────────────────────────
interface MockUri {
  fsPath: string;
  path: string;
}

// ─── Factory helpers ────────────────────────────────────────────────────────

const STORY_TEMPLATE = `---
id: __ID__
title: "Story __ID__"
type: feature
epic: EPIC-001
status: todo
sprint: __SPRINT__
size: M
priority: __PRIORITY__
created: 2025-01-15
updated: 2025-01-15
---

# Story __ID__
`;

function storyFileContent(id: string, sprint: string, priority: number): Uint8Array {
  const md = STORY_TEMPLATE.replace(/__ID__/g, id)
    .replace(/__SPRINT__/g, sprint)
    .replace(/__PRIORITY__/g, String(priority));
  return new TextEncoder().encode(md);
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
    filePath: `/workspace/.devstories/stories/${overrides.id ?? "DS-001"}.md`,
    ...overrides,
  };
}

function makeSprintNode(sprintId: string, isBacklog = false): SprintNode {
  return {
    _kind: "sprintNode",
    sprintId,
    label: isBacklog ? "Backlog" : sprintId,
    isBacklog,
  };
}

function makeStore(stories: Story[]): BacklogDropStore & { reloadFile: ReturnType<typeof vi.fn> } {
  return {
    getStory: (id: string) => stories.find((s) => s.id === id),
    getStories: () => [...stories],
    reloadFile: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSortService(key = "priority", direction = "asc"): BacklogDropSortService & { setState: ReturnType<typeof vi.fn> } {
  const _state = { key, direction };
  return {
    get state() {
      return { ..._state } as SortState;
    },
    setState: vi.fn((s: SortState) => {
      _state.key = s.key;
      _state.direction = s.direction;
    }),
  };
}

function makeConfigService(sprintSequence: string[] = ["sprint-1", "sprint-2", "sprint-3"]): BacklogDropConfigService {
  return {
    config: { sprintSequence },
  };
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: readFile returns a generic story content, writeFile resolves
  mockReadFile.mockImplementation((uri: MockUri) => {
    // Return a default content that can be parsed by gray-matter
    return Promise.resolve(storyFileContent("DEFAULT", "sprint-1", 500));
  });
  mockWriteFile.mockResolvedValue(undefined);
  mockShowWarningMessage.mockResolvedValue(undefined); // user cancels by default
});

// ─── Sort guard ─────────────────────────────────────────────────────────────

describe("sort guard", () => {
  it("shows a modal dialog when sort is not priority ascending", async () => {
    const sortService = makeSortService("date", "asc");
    const store = makeStore([makeStory()]);
    const target = makeSprintNode("sprint-1");

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target,
      store,
      sortService,
      configService: makeConfigService(),
    });

    expect(mockShowWarningMessage).toHaveBeenCalledTimes(1);
    expect(mockShowWarningMessage).toHaveBeenCalledWith(expect.stringContaining("priority"), { modal: true }, expect.any(String));
  });

  it("switches sort to priority asc when user accepts", async () => {
    const sortService = makeSortService("date", "desc");
    const store = makeStore([makeStory()]);
    mockShowWarningMessage.mockResolvedValue("Switch to Priority Sort");

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-1"),
      store,
      sortService,
      configService: makeConfigService(),
    });

    expect(sortService.setState).toHaveBeenCalledWith({ key: "priority", direction: "asc" });
  });

  it("does NOT execute the drop even when user accepts sort switch", async () => {
    const sortService = makeSortService("id", "asc");
    const store = makeStore([makeStory()]);
    mockShowWarningMessage.mockResolvedValue("Switch to Priority Sort");

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-1"),
      store,
      sortService,
      configService: makeConfigService(),
    });

    // No file writes should have happened
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("does nothing when user cancels the sort dialog", async () => {
    const sortService = makeSortService("date", "asc");
    const store = makeStore([makeStory()]);
    mockShowWarningMessage.mockResolvedValue(undefined);

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-1"),
      store,
      sortService,
      configService: makeConfigService(),
    });

    expect(sortService.setState).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("triggers sort guard when direction is descending even if key is priority", async () => {
    const sortService = makeSortService("priority", "desc");
    const store = makeStore([makeStory()]);

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-1"),
      store,
      sortService,
      configService: makeConfigService(),
    });

    expect(mockShowWarningMessage).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("does NOT trigger sort guard when sort is priority ascending", async () => {
    const s1 = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 5 });
    const store = makeStore([s1]);
    const sortService = makeSortService("priority", "asc");

    mockReadFile.mockResolvedValue(storyFileContent("DS-001", "sprint-1", 5));

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-2"),
      store,
      sortService,
      configService: makeConfigService(),
    });

    expect(mockShowWarningMessage).not.toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled(); // drop was executed
  });
});

// ─── Story → SprintNode ─────────────────────────────────────────────────────

describe("Story → SprintNode", () => {
  it("sets dragged story sprint and default priority for empty sprint", async () => {
    const s1 = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 500 });
    const store = makeStore([s1]);

    mockReadFile.mockResolvedValue(storyFileContent("DS-001", "sprint-1", 500));

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-2"),
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // Should have written the dragged story file with default priority (100 for empty sprint)
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const firstWriteContent = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(firstWriteContent).toContain("sprint: sprint-2");
    expect(firstWriteContent).toContain("priority: 100");
  });

  it("places dragged story before minimum sibling — no bumps needed when gap exists", async () => {
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 500 });
    const sibling1 = makeStory({ id: "DS-002", sprint: "sprint-2", priority: 3 });
    const sibling2 = makeStory({ id: "DS-003", sprint: "sprint-2", priority: 7 });
    const unrelated = makeStory({ id: "DS-004", sprint: "sprint-3", priority: 1 });
    const store = makeStore([dragged, sibling1, sibling2, unrelated]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      const path = uri.fsPath || uri.path || "";
      if (path.includes("DS-001")) {
        return Promise.resolve(storyFileContent("DS-001", "sprint-1", 500));
      }
      if (path.includes("DS-002")) {
        return Promise.resolve(storyFileContent("DS-002", "sprint-2", 3));
      }
      if (path.includes("DS-003")) {
        return Promise.resolve(storyFileContent("DS-003", "sprint-2", 7));
      }
      return Promise.resolve(storyFileContent("DEFAULT", "sprint-3", 1));
    });

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-2"),
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // Only 1 write for dragged — siblings have gap (min=3, dragged gets 2)
    expect(mockWriteFile).toHaveBeenCalledTimes(1);

    const draggedWrite = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(draggedWrite).toContain("sprint: sprint-2");
    expect(draggedWrite).toContain("priority: 2");
  });

  it("does not bump stories in other sprints", async () => {
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 500 });
    const unrelated = makeStory({ id: "DS-010", sprint: "sprint-3", priority: 1 });
    const store = makeStore([dragged, unrelated]);

    mockReadFile.mockResolvedValue(storyFileContent("DS-001", "sprint-1", 500));

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-2"),
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // Only the dragged story was written (no siblings in sprint-2)
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it("handles drop onto Backlog sentinel — sets sprint to backlog", async () => {
    const s1 = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 500 });
    const store = makeStore([s1]);

    mockReadFile.mockResolvedValue(storyFileContent("DS-001", "sprint-1", 500));

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode(BACKLOG_SPRINT_ID, true),
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const content = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(content).toContain("sprint: backlog");
    expect(content).toContain("priority: 100"); // default for empty backlog
  });

  it("is a no-op when story is already the top-priority in the sprint", async () => {
    const s1 = makeStory({ id: "DS-001", sprint: "sprint-2", priority: 1 });
    const store = makeStore([s1]);

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-2"),
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // Already the only (and thus top-priority) story in the sprint
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("is a no-op when story is already the highest priority among siblings", async () => {
    const s1 = makeStory({ id: "DS-001", sprint: "sprint-2", priority: 5 });
    const s2 = makeStory({ id: "DS-002", sprint: "sprint-2", priority: 10 });
    const store = makeStore([s1, s2]);

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-2"),
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // DS-001 at 5 is already before DS-002 at 10 — no change needed
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("excludes the dragged story from sibling list and places before min", async () => {
    // Dragged story is currently in sprint-2 and we drop it onto sprint-2 SprintNode
    // Sibling at 3 → dragged gets 2 (min-1), no bumps needed
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-2", priority: 5 });
    const sibling = makeStory({ id: "DS-002", sprint: "sprint-2", priority: 3 });
    const store = makeStore([dragged, sibling]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      const path = uri.fsPath || uri.path || "";
      if (path.includes("DS-001")) {
        return Promise.resolve(storyFileContent("DS-001", "sprint-2", 5));
      }
      if (path.includes("DS-002")) {
        return Promise.resolve(storyFileContent("DS-002", "sprint-2", 3));
      }
      return Promise.resolve(storyFileContent("DEFAULT", "sprint-2", 500));
    });

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-2"),
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // 1 write for dragged only — placed at priority 2 (min-1), no bumps
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const draggedWrite = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(draggedWrite).toContain("priority: 2");
  });

  it("cascades when min sibling priority is 1 (no room before)", async () => {
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 500 });
    const sib1 = makeStory({ id: "DS-002", sprint: "sprint-2", priority: 1 });
    const sib2 = makeStory({ id: "DS-003", sprint: "sprint-2", priority: 2 });
    const sib3 = makeStory({ id: "DS-004", sprint: "sprint-2", priority: 10 });
    const store = makeStore([dragged, sib1, sib2, sib3]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      const path = uri.fsPath || uri.path || "";
      if (path.includes("DS-001")) {
        return Promise.resolve(storyFileContent("DS-001", "sprint-1", 500));
      }
      if (path.includes("DS-002")) {
        return Promise.resolve(storyFileContent("DS-002", "sprint-2", 1));
      }
      if (path.includes("DS-003")) {
        return Promise.resolve(storyFileContent("DS-003", "sprint-2", 2));
      }
      if (path.includes("DS-004")) {
        return Promise.resolve(storyFileContent("DS-004", "sprint-2", 10));
      }
      return Promise.resolve(storyFileContent("DEFAULT", "sprint-2", 500));
    });

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-2"),
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // Writes: dragged(→1) + DS-002(1→2) + DS-003(2→3) = 3.  DS-004(10) has gap, NOT bumped.
    expect(mockWriteFile).toHaveBeenCalledTimes(3);

    const draggedWrite = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(draggedWrite).toContain("priority: 1");

    const sib1Write = new TextDecoder().decode(mockWriteFile.mock.calls[1][1]);
    expect(sib1Write).toContain("priority: 2");

    const sib2Write = new TextDecoder().decode(mockWriteFile.mock.calls[2][1]);
    expect(sib2Write).toContain("priority: 3");
  });
});

// ─── Story → Story ──────────────────────────────────────────────────────────

describe("Story → Story (same sprint)", () => {
  it("inserts dragged story immediately below target (target+1)", async () => {
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 10 });
    const target = makeStory({ id: "DS-002", sprint: "sprint-1", priority: 3 });
    const store = makeStore([dragged, target]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      const path = uri.fsPath || uri.path || "";
      if (path.includes("DS-001")) {
        return Promise.resolve(storyFileContent("DS-001", "sprint-1", 10));
      }
      if (path.includes("DS-002")) {
        return Promise.resolve(storyFileContent("DS-002", "sprint-1", 3));
      }
      return Promise.resolve(storyFileContent("DEFAULT", "sprint-1", 500));
    });

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target,
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // Dragged gets target+1=4, target (3) is untouched — no collision
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const draggedWrite = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(draggedWrite).toContain("sprint: sprint-1");
    expect(draggedWrite).toContain("priority: 4");
  });

  it("cascade-bumps only colliding siblings below target and stops at gap", async () => {
    // Priorities: DS-003=1, DS-002(target)=3, DS-004=3, DS-005=7, DS-001(dragged)=10
    // Drop DS-001 onto DS-002 → insert at 3+1=4
    // Cascade from 4: DS-004(3) is < 4 so not in range. DS-005(7) ≥ 4 but no collision at 4.
    // Actually: siblings ≥ 4 are just DS-005(7), and 7 ≥ 5 → gap → no bumps.
    // But DS-004 at 3 < 4, so not bumped.
    // Net result: only dragged written at priority 4. No bumps.
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 10 });
    const target = makeStory({ id: "DS-002", sprint: "sprint-1", priority: 3 });
    const above = makeStory({ id: "DS-003", sprint: "sprint-1", priority: 1 });
    const atTarget = makeStory({ id: "DS-004", sprint: "sprint-1", priority: 3 });
    const below = makeStory({ id: "DS-005", sprint: "sprint-1", priority: 7 });
    const store = makeStore([dragged, target, above, atTarget, below]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      const path = uri.fsPath || uri.path || "";
      if (path.includes("DS-001")) {
        return Promise.resolve(storyFileContent("DS-001", "sprint-1", 10));
      }
      if (path.includes("DS-002")) {
        return Promise.resolve(storyFileContent("DS-002", "sprint-1", 3));
      }
      if (path.includes("DS-003")) {
        return Promise.resolve(storyFileContent("DS-003", "sprint-1", 1));
      }
      if (path.includes("DS-004")) {
        return Promise.resolve(storyFileContent("DS-004", "sprint-1", 3));
      }
      if (path.includes("DS-005")) {
        return Promise.resolve(storyFileContent("DS-005", "sprint-1", 7));
      }
      return Promise.resolve(storyFileContent("DEFAULT", "sprint-1", 500));
    });

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target,
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // Insert at 4: no sibling at 4, gap exists → zero bumps
    // DS-003(1) < 4, DS-002(3) < 4, DS-004(3) < 4, DS-005(7) has gap
    // Only 1 write: the dragged story
    expect(mockWriteFile).toHaveBeenCalledTimes(1);

    const draggedWrite = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(draggedWrite).toContain("priority: 4");
  });

  it("cascade-bumps when insert slot is occupied", async () => {
    // Priorities: DS-003=1, DS-002(target)=3, DS-004=4, DS-005=5, DS-006=10
    // Drop DS-001 onto DS-002 → insert at 4
    // Siblings ≥ 4: DS-004(4), DS-005(5), DS-006(10)
    // Cascade: DS-004(4)→5, DS-005(5)→6, DS-006(10) ≥ 7 → STOP
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 20 });
    const target = makeStory({ id: "DS-002", sprint: "sprint-1", priority: 3 });
    const above = makeStory({ id: "DS-003", sprint: "sprint-1", priority: 1 });
    const atSlot = makeStory({ id: "DS-004", sprint: "sprint-1", priority: 4 });
    const afterSlot = makeStory({ id: "DS-005", sprint: "sprint-1", priority: 5 });
    const gapStory = makeStory({ id: "DS-006", sprint: "sprint-1", priority: 10 });
    const store = makeStore([dragged, target, above, atSlot, afterSlot, gapStory]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      const path = uri.fsPath || uri.path || "";
      if (path.includes("DS-001")) {
        return Promise.resolve(storyFileContent("DS-001", "sprint-1", 20));
      }
      if (path.includes("DS-002")) {
        return Promise.resolve(storyFileContent("DS-002", "sprint-1", 3));
      }
      if (path.includes("DS-003")) {
        return Promise.resolve(storyFileContent("DS-003", "sprint-1", 1));
      }
      if (path.includes("DS-004")) {
        return Promise.resolve(storyFileContent("DS-004", "sprint-1", 4));
      }
      if (path.includes("DS-005")) {
        return Promise.resolve(storyFileContent("DS-005", "sprint-1", 5));
      }
      if (path.includes("DS-006")) {
        return Promise.resolve(storyFileContent("DS-006", "sprint-1", 10));
      }
      return Promise.resolve(storyFileContent("DEFAULT", "sprint-1", 500));
    });

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target,
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // Writes: dragged(→4) + DS-004(4→5) + DS-005(5→6) = 3. DS-006(10) has gap.
    expect(mockWriteFile).toHaveBeenCalledTimes(3);

    const draggedWrite = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(draggedWrite).toContain("priority: 4");

    const ds004Write = new TextDecoder().decode(mockWriteFile.mock.calls[1][1]);
    expect(ds004Write).toContain("priority: 5");

    const ds005Write = new TextDecoder().decode(mockWriteFile.mock.calls[2][1]);
    expect(ds005Write).toContain("priority: 6");
  });

  it("does NOT bump story with priority < insert priority", async () => {
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 10 });
    const target = makeStory({ id: "DS-002", sprint: "sprint-1", priority: 5 });
    const higher = makeStory({ id: "DS-003", sprint: "sprint-1", priority: 2 });
    const store = makeStore([dragged, target, higher]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      const path = uri.fsPath || uri.path || "";
      if (path.includes("DS-001")) {
        return Promise.resolve(storyFileContent("DS-001", "sprint-1", 10));
      }
      if (path.includes("DS-002")) {
        return Promise.resolve(storyFileContent("DS-002", "sprint-1", 5));
      }
      if (path.includes("DS-003")) {
        return Promise.resolve(storyFileContent("DS-003", "sprint-1", 2));
      }
      return Promise.resolve(storyFileContent("DEFAULT", "sprint-1", 500));
    });

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target,
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // Insert at 6 (target 5 + 1). No sibling at 6 → only dragged written.
    // DS-002(5) and DS-003(2) are both < 6, untouched.
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when dropping story onto itself", async () => {
    const s1 = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 5 });
    const store = makeStore([s1]);

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: s1,
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});

describe("Story → Story (cross-sprint)", () => {
  it("moves story to target sprint at target+1 priority", async () => {
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 500 });
    const target = makeStory({ id: "DS-002", sprint: "sprint-2", priority: 3 });
    const store = makeStore([dragged, target]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      const path = uri.fsPath || uri.path || "";
      if (path.includes("DS-001")) {
        return Promise.resolve(storyFileContent("DS-001", "sprint-1", 500));
      }
      if (path.includes("DS-002")) {
        return Promise.resolve(storyFileContent("DS-002", "sprint-2", 3));
      }
      return Promise.resolve(storyFileContent("DEFAULT", "sprint-1", 500));
    });

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target,
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // Inserted below target: 3+1=4, target(3) untouched
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const draggedWrite = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(draggedWrite).toContain("sprint: sprint-2");
    expect(draggedWrite).toContain("priority: 4");
  });

  it("bumps only colliding stories in target sprint without affecting source or target", async () => {
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 500 });
    const target = makeStory({ id: "DS-002", sprint: "sprint-2", priority: 3 });
    const sourceSibling = makeStory({ id: "DS-003", sprint: "sprint-1", priority: 5 });
    const targetSibling = makeStory({ id: "DS-004", sprint: "sprint-2", priority: 5 });
    const store = makeStore([dragged, target, sourceSibling, targetSibling]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      const path = uri.fsPath || uri.path || "";
      if (path.includes("DS-001")) {
        return Promise.resolve(storyFileContent("DS-001", "sprint-1", 500));
      }
      if (path.includes("DS-002")) {
        return Promise.resolve(storyFileContent("DS-002", "sprint-2", 3));
      }
      if (path.includes("DS-003")) {
        return Promise.resolve(storyFileContent("DS-003", "sprint-1", 5));
      }
      if (path.includes("DS-004")) {
        return Promise.resolve(storyFileContent("DS-004", "sprint-2", 5));
      }
      return Promise.resolve(storyFileContent("DEFAULT", "sprint-1", 500));
    });

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target,
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // Insert at 4 (target 3+1). DS-002(3) untouched. DS-004(5) has gap (>=5). No bumps.
    // DS-003 is in sprint-1 (source), should NOT be touched.
    // Writes: dragged only = 1
    expect(mockWriteFile).toHaveBeenCalledTimes(1);

    const paths = mockWriteFile.mock.calls.map((c) => {
      const uri = c[0] as MockUri;
      return uri.fsPath || uri.path || "";
    });
    expect(paths.some((p: string) => p.includes("DS-002"))).toBe(false);
    expect(paths.some((p: string) => p.includes("DS-003"))).toBe(false);
    expect(paths.some((p: string) => p.includes("DS-004"))).toBe(false);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("does nothing when dragged story not found in store", async () => {
    const store = makeStore([]); // empty store

    await handleBacklogDrop({
      draggedStoryId: "NONEXISTENT",
      target: makeSprintNode("sprint-1"),
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("skips writing stories that have no filePath", async () => {
    const noFile = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 5, filePath: undefined });
    const store = makeStore([noFile]);

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-2"),
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("handles backlog stories — places before min, no bumps when gap exists", async () => {
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 500 });
    const backlogStory = makeStory({ id: "DS-010", sprint: undefined, priority: 10 });
    const store = makeStore([dragged, backlogStory]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      const path = uri.fsPath || uri.path || "";
      if (path.includes("DS-001")) {
        return Promise.resolve(storyFileContent("DS-001", "sprint-1", 500));
      }
      if (path.includes("DS-010")) {
        return Promise.resolve(storyFileContent("DS-010", "", 10));
      }
      return Promise.resolve(storyFileContent("DEFAULT", "", 500));
    });

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode(BACKLOG_SPRINT_ID, true),
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // Only 1 write — dragged placed at priority 9 (min-1), backlog sibling (10) NOT bumped
    expect(mockWriteFile).toHaveBeenCalledTimes(1);

    const draggedWrite = new TextDecoder().decode(mockWriteFile.mock.calls[0][1]);
    expect(draggedWrite).toContain("sprint: backlog");
    expect(draggedWrite).toContain("priority: 9");
  });
});

// ─── reloadFile calls ───────────────────────────────────────────────────────

describe("reloadFile after writes", () => {
  it("calls reloadFile for each file written on SprintNode drop", async () => {
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 500 });
    const sib1 = makeStory({ id: "DS-002", sprint: "sprint-2", priority: 1 });
    const sib2 = makeStory({ id: "DS-003", sprint: "sprint-2", priority: 2 });
    const store = makeStore([dragged, sib1, sib2]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      const path = uri.fsPath || uri.path || "";
      if (path.includes("DS-001")) {
        return Promise.resolve(storyFileContent("DS-001", "sprint-1", 500));
      }
      if (path.includes("DS-002")) {
        return Promise.resolve(storyFileContent("DS-002", "sprint-2", 1));
      }
      if (path.includes("DS-003")) {
        return Promise.resolve(storyFileContent("DS-003", "sprint-2", 2));
      }
      return Promise.resolve(storyFileContent("DEFAULT", "sprint-2", 500));
    });

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target: makeSprintNode("sprint-2"),
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // 3 writes: dragged + 2 bumps (priority 1 and 2 with no gap)
    expect(mockWriteFile).toHaveBeenCalledTimes(3);
    // reloadFile should be called once per write
    expect(store.reloadFile).toHaveBeenCalledTimes(3);
  });

  it("calls reloadFile for each file written on Story drop", async () => {
    const dragged = makeStory({ id: "DS-001", sprint: "sprint-1", priority: 10 });
    const target = makeStory({ id: "DS-002", sprint: "sprint-1", priority: 3 });
    const store = makeStore([dragged, target]);

    mockReadFile.mockImplementation((uri: MockUri) => {
      const path = uri.fsPath || uri.path || "";
      if (path.includes("DS-001")) {
        return Promise.resolve(storyFileContent("DS-001", "sprint-1", 10));
      }
      if (path.includes("DS-002")) {
        return Promise.resolve(storyFileContent("DS-002", "sprint-1", 3));
      }
      return Promise.resolve(storyFileContent("DEFAULT", "sprint-1", 500));
    });

    await handleBacklogDrop({
      draggedStoryId: "DS-001",
      target,
      store,
      sortService: makeSortService(),
      configService: makeConfigService(),
    });

    // 1 write for dragged (no collision), 1 reloadFile call
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    expect(store.reloadFile).toHaveBeenCalledTimes(1);
  });
});
