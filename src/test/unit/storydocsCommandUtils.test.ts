import { describe, it, expect, vi } from "vitest";
import { resolveNode, computeStorydocsFolderPath } from "../../commands/storydocsCommandUtils";
import { Store } from "../../core/store";

// ─── resolveNode ──────────────────────────────────────────────────

describe("resolveNode", () => {
  function makeStore(stories: string[] = [], epics: string[] = [], themes: string[] = []) {
    return {
      getStory: vi.fn((id: string) => (stories.includes(id) ? { id } : undefined)),
      getEpic: vi.fn((id: string) => (epics.includes(id) ? { id } : undefined)),
      getTheme: vi.fn((id: string) => (themes.includes(id) ? { id } : undefined)),
    } as unknown as Store;
  }

  it("returns story node for a story item", () => {
    const store = makeStore(["DS-00001"]);
    const result = resolveNode(store, { id: "DS-00001" });
    expect(result).toEqual({ id: "DS-00001", nodeType: "story" });
  });

  it("returns epic node for an epic item", () => {
    const store = makeStore([], ["EPIC-0001"]);
    const result = resolveNode(store, { id: "EPIC-0001" });
    expect(result).toEqual({ id: "EPIC-0001", nodeType: "epic" });
  });

  it("returns theme node for a theme item", () => {
    const store = makeStore([], [], ["THEME-001"]);
    const result = resolveNode(store, { id: "THEME-001" });
    expect(result).toEqual({ id: "THEME-001", nodeType: "theme" });
  });

  it("resolves task items to their parent story", () => {
    const store = makeStore(["STORY-001"]);
    const taskItem = {
      id: "TASK-001",
      story: "STORY-001",
      taskType: "code",
      title: "Some task",
      status: "todo",
      priority: 1,
      dependencies: [],
      created: "2026-01-01",
      updated: "2026-01-01",
    };
    const result = resolveNode(store, taskItem);
    expect(result).toEqual({ id: "STORY-001", nodeType: "story" });
  });

  it("returns undefined for unrecognised items", () => {
    const store = makeStore();
    const result = resolveNode(store, { id: "UNKNOWN-999" });
    expect(result).toBeUndefined();
  });
});

// ─── computeStorydocsFolderPath ───────────────────────────────────

describe("computeStorydocsFolderPath", () => {
  const root = "/workspace/docs/storydocs";
  const archiveSegment = "archive";

  it("returns live path when isArchived is falsy", () => {
    const result = computeStorydocsFolderPath(root, archiveSegment, "DS-00001", "story", undefined);
    expect(result).toMatch(/stories[/\\]DS-00001$/);
    expect(result).not.toContain("archive");
  });

  it("returns live path when isArchived is false", () => {
    const result = computeStorydocsFolderPath(root, archiveSegment, "EPIC-0001", "epic", false);
    expect(result).toMatch(/epics[/\\]EPIC-0001$/);
    expect(result).not.toContain("archive");
  });

  it("returns archived path when isArchived is true", () => {
    const result = computeStorydocsFolderPath(root, archiveSegment, "DS-00001", "story", true);
    expect(result).toMatch(/archive[/\\]stories[/\\]DS-00001$/);
  });

  it("uses custom archive segment name", () => {
    const result = computeStorydocsFolderPath(root, "glacier", "THEME-001", "theme", true);
    expect(result).toMatch(/glacier[/\\]themes[/\\]THEME-001$/);
  });
});
