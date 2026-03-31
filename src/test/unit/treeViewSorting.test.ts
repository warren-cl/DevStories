import { describe, it, expect } from "vitest";
import {
  sortStoriesForTreeView,
  sortStoriesBy,
  getEarliestStorySprintIndex,
  sortEpicsBySprintOrder,
  sortThemesByEpicSprintOrder,
  getTreeViewTitle,
  getStatusIndicator,
  getNodeContextValue,
  getArchivedDescription,
} from "../../view/storiesProviderUtils";
import { Story, StoryType, StorySize } from "../../types/story";
import { Epic } from "../../types/epic";
import { Theme } from "../../types/theme";
import { StatusDef } from "../../core/configServiceUtils";
import { SortState } from "../../core/sortService";

// Helper to create mock stories
function createMockStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "STORY-001",
    title: "Test Story",
    type: "feature" as StoryType,
    epic: "EPIC-001",
    status: "todo",
    size: "M" as StorySize,
    priority: 500,
    created: new Date("2025-01-15"),
    content: "",
    ...overrides,
  };
}

// Helper to create mock epics
function createMockEpic(overrides: Partial<Epic> = {}): Epic {
  return {
    id: "EPIC-001",
    title: "Test Epic",
    status: "todo",
    priority: 500,
    created: new Date("2025-01-15"),
    content: "",
    ...overrides,
  };
}

// Helper to create mock themes
function createMockTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: "THEME-001",
    title: "Test Theme",
    status: "todo",
    priority: 500,
    created: new Date("2025-01-15"),
    content: "",
    ...overrides,
  };
}

describe("Tree View Sorting Utils", () => {
  const sprintSequence = ["foundation-1", "polish-1", "polish-2", "launch-1"];

  describe("sortStoriesForTreeView", () => {
    it("should sort stories by sprint sequence first", () => {
      const stories = [
        createMockStory({ id: "S-1", sprint: "polish-1" }),
        createMockStory({ id: "S-2", sprint: "foundation-1" }),
        createMockStory({ id: "S-3", sprint: "launch-1" }),
      ];

      const sorted = sortStoriesForTreeView(stories, sprintSequence);

      expect(sorted.map((s) => s.id)).toEqual(["S-2", "S-1", "S-3"]);
    });

    it("should sort by priority within same sprint", () => {
      const stories = [
        createMockStory({ id: "S-1", sprint: "polish-1", priority: 200 }),
        createMockStory({ id: "S-2", sprint: "polish-1", priority: 100 }),
        createMockStory({ id: "S-3", sprint: "polish-1", priority: 300 }),
      ];

      const sorted = sortStoriesForTreeView(stories, sprintSequence);

      expect(sorted.map((s) => s.id)).toEqual(["S-2", "S-1", "S-3"]);
    });

    it("should sort alphabetically by title within same sprint and priority", () => {
      const stories = [
        createMockStory({ id: "S-1", sprint: "polish-1", priority: 500, title: "Zebra feature" }),
        createMockStory({ id: "S-2", sprint: "polish-1", priority: 500, title: "Apple feature" }),
        createMockStory({ id: "S-3", sprint: "polish-1", priority: 500, title: "Mango feature" }),
      ];

      const sorted = sortStoriesForTreeView(stories, sprintSequence);

      expect(sorted.map((s) => s.id)).toEqual(["S-2", "S-3", "S-1"]);
    });

    it("should sort case-insensitively by title", () => {
      const stories = [
        createMockStory({ id: "S-1", sprint: "polish-1", priority: 500, title: "zebra feature" }),
        createMockStory({ id: "S-2", sprint: "polish-1", priority: 500, title: "Apple feature" }),
        createMockStory({ id: "S-3", sprint: "polish-1", priority: 500, title: "mango feature" }),
      ];

      const sorted = sortStoriesForTreeView(stories, sprintSequence);

      expect(sorted.map((s) => s.id)).toEqual(["S-2", "S-3", "S-1"]);
    });

    it("should sort by title for same non-default priority", () => {
      const stories = [
        createMockStory({ id: "S-1", sprint: "polish-1", priority: 100, title: "Update API" }),
        createMockStory({ id: "S-2", sprint: "polish-1", priority: 100, title: "Add tests" }),
        createMockStory({ id: "S-3", sprint: "polish-1", priority: 100, title: "Fix bug" }),
      ];

      const sorted = sortStoriesForTreeView(stories, sprintSequence);

      expect(sorted.map((s) => s.id)).toEqual(["S-2", "S-3", "S-1"]);
    });

    it("should put stories with unknown sprints at the end", () => {
      const stories = [
        createMockStory({ id: "S-1", sprint: "unknown-sprint" }),
        createMockStory({ id: "S-2", sprint: "foundation-1" }),
        createMockStory({ id: "S-3", sprint: undefined }),
      ];

      const sorted = sortStoriesForTreeView(stories, sprintSequence);

      expect(sorted.map((s) => s.id)).toEqual(["S-2", "S-1", "S-3"]);
    });

    it("should handle empty sprint sequence gracefully", () => {
      const stories = [
        createMockStory({ id: "S-1", sprint: "sprint-1", priority: 200 }),
        createMockStory({ id: "S-2", sprint: "sprint-2", priority: 100 }),
      ];

      const sorted = sortStoriesForTreeView(stories, []);

      // Should still sort by priority then created when no sprint sequence
      expect(sorted.map((s) => s.id)).toEqual(["S-2", "S-1"]);
    });

    it("should handle empty stories array", () => {
      const sorted = sortStoriesForTreeView([], sprintSequence);
      expect(sorted).toEqual([]);
    });

    it("should apply full sorting chain: sprint → priority → title", () => {
      const stories = [
        createMockStory({ id: "S-1", sprint: "polish-1", priority: 100, title: "Zebra task" }),
        createMockStory({ id: "S-2", sprint: "foundation-1", priority: 500, title: "Beta feature" }),
        createMockStory({ id: "S-3", sprint: "polish-1", priority: 100, title: "Alpha task" }),
        createMockStory({ id: "S-4", sprint: "foundation-1", priority: 100, title: "Alpha feature" }),
      ];

      const sorted = sortStoriesForTreeView(stories, sprintSequence);

      // foundation-1 first (index 0), then polish-1 (index 1)
      // Within foundation-1: S-4 (priority 100) before S-2 (priority 500)
      // Within polish-1 and priority 100: S-3 (Alpha) before S-1 (Zebra)
      expect(sorted.map((s) => s.id)).toEqual(["S-4", "S-2", "S-3", "S-1"]);
    });
  });

  describe("getEarliestStorySprintIndex", () => {
    it("should return earliest sprint index from epic stories", () => {
      const stories = [
        createMockStory({ sprint: "polish-1" }), // index 1
        createMockStory({ sprint: "foundation-1" }), // index 0
        createMockStory({ sprint: "launch-1" }), // index 3
      ];

      const index = getEarliestStorySprintIndex(stories, sprintSequence);

      expect(index).toBe(0); // foundation-1 is earliest
    });

    it("should return Infinity for empty stories array", () => {
      const index = getEarliestStorySprintIndex([], sprintSequence);
      expect(index).toBe(Infinity);
    });

    it("should return Infinity when all stories have unknown sprints", () => {
      const stories = [createMockStory({ sprint: "unknown-1" }), createMockStory({ sprint: "unknown-2" })];

      const index = getEarliestStorySprintIndex(stories, sprintSequence);
      expect(index).toBe(Infinity);
    });

    it("should handle stories with undefined sprint", () => {
      const stories = [createMockStory({ sprint: undefined }), createMockStory({ sprint: "polish-1" })];

      const index = getEarliestStorySprintIndex(stories, sprintSequence);
      expect(index).toBe(1); // polish-1 is index 1
    });

    it("should handle single story", () => {
      const stories = [createMockStory({ sprint: "launch-1" })];
      const index = getEarliestStorySprintIndex(stories, sprintSequence);
      expect(index).toBe(3);
    });
  });

  describe("sortEpicsBySprintOrder", () => {
    it("should sort epics by their earliest story sprint (no sortState)", () => {
      const epics = [createMockEpic({ id: "E-1" }), createMockEpic({ id: "E-2" }), createMockEpic({ id: "E-3" })];

      // E-1 stories start in polish-1 (index 1)
      // E-2 stories start in foundation-1 (index 0)
      // E-3 stories start in launch-1 (index 3)
      const getStoriesByEpic = (epicId: string): Story[] => {
        if (epicId === "E-1") {
          return [createMockStory({ sprint: "polish-1" })];
        }
        if (epicId === "E-2") {
          return [createMockStory({ sprint: "foundation-1" })];
        }
        if (epicId === "E-3") {
          return [createMockStory({ sprint: "launch-1" })];
        }
        return [];
      };

      const sorted = sortEpicsBySprintOrder(epics, sprintSequence, getStoriesByEpic);

      expect(sorted.map((e) => e.id)).toEqual(["E-2", "E-1", "E-3"]);
    });

    it("should put epics with no stories at the end", () => {
      const epics = [createMockEpic({ id: "E-1" }), createMockEpic({ id: "E-2" })];

      const getStoriesByEpic = (epicId: string): Story[] => {
        if (epicId === "E-1") {
          return [];
        }
        if (epicId === "E-2") {
          return [createMockStory({ sprint: "foundation-1" })];
        }
        return [];
      };

      const sorted = sortEpicsBySprintOrder(epics, sprintSequence, getStoriesByEpic);

      expect(sorted.map((e) => e.id)).toEqual(["E-2", "E-1"]);
    });

    it("should sort by epic created date when sprint indices are equal", () => {
      const epics = [
        createMockEpic({ id: "E-1", created: new Date("2025-01-20") }),
        createMockEpic({ id: "E-2", created: new Date("2025-01-10") }),
        createMockEpic({ id: "E-3", created: new Date("2025-01-15") }),
      ];

      // All epics have same earliest sprint
      const getStoriesByEpic = (): Story[] => {
        return [createMockStory({ sprint: "foundation-1" })];
      };

      const sorted = sortEpicsBySprintOrder(epics, sprintSequence, getStoriesByEpic);

      // All same sprint, so sort by epic created date
      expect(sorted.map((e) => e.id)).toEqual(["E-2", "E-3", "E-1"]);
    });

    it("should handle empty epics array", () => {
      const sorted = sortEpicsBySprintOrder([], sprintSequence, () => []);
      expect(sorted).toEqual([]);
    });

    it("should not mutate original epics array", () => {
      const epics = [createMockEpic({ id: "E-2" }), createMockEpic({ id: "E-1" })];
      const originalOrder = [...epics.map((e) => e.id)];

      const getStoriesByEpic = (epicId: string): Story[] => {
        if (epicId === "E-1") {
          return [createMockStory({ sprint: "foundation-1" })];
        }
        if (epicId === "E-2") {
          return [createMockStory({ sprint: "polish-1" })];
        }
        return [];
      };

      sortEpicsBySprintOrder(epics, sprintSequence, getStoriesByEpic);

      expect(epics.map((e) => e.id)).toEqual(originalOrder);
    });

    it("should sort epics by priority ascending when sortState provided", () => {
      const epics = [
        createMockEpic({ id: "E-1", priority: 300 }),
        createMockEpic({ id: "E-2", priority: 100 }),
        createMockEpic({ id: "E-3", priority: 200 }),
      ];
      const state: SortState = { key: "priority", direction: "asc" };
      const sorted = sortEpicsBySprintOrder(epics, sprintSequence, () => [], state);
      expect(sorted.map((e) => e.id)).toEqual(["E-2", "E-3", "E-1"]);
    });

    it("should sort epics by priority descending when sortState provided", () => {
      const epics = [createMockEpic({ id: "E-1", priority: 100 }), createMockEpic({ id: "E-2", priority: 300 })];
      const state: SortState = { key: "priority", direction: "desc" };
      const sorted = sortEpicsBySprintOrder(epics, sprintSequence, () => [], state);
      expect(sorted.map((e) => e.id)).toEqual(["E-2", "E-1"]);
    });

    it("should sort epics by date ascending when sortState provided", () => {
      const epics = [
        createMockEpic({ id: "E-1", created: new Date("2025-03-01") }),
        createMockEpic({ id: "E-2", created: new Date("2025-01-01") }),
        createMockEpic({ id: "E-3", created: new Date("2025-02-01") }),
      ];
      const state: SortState = { key: "date", direction: "asc" };
      const sorted = sortEpicsBySprintOrder(epics, sprintSequence, () => [], state);
      expect(sorted.map((e) => e.id)).toEqual(["E-2", "E-3", "E-1"]);
    });

    it("should sort epics by ID number ascending when sortState provided", () => {
      const epics = [createMockEpic({ id: "EPIC-003" }), createMockEpic({ id: "EPIC-001" }), createMockEpic({ id: "EPIC-002" })];
      const state: SortState = { key: "id", direction: "asc" };
      const sorted = sortEpicsBySprintOrder(epics, sprintSequence, () => [], state);
      expect(sorted.map((e) => e.id)).toEqual(["EPIC-001", "EPIC-002", "EPIC-003"]);
    });
  });

  describe("sortThemesByEpicSprintOrder", () => {
    it("should sort themes by priority ascending when sortState provided", () => {
      const themes = [
        createMockTheme({ id: "T-1", priority: 300 }),
        createMockTheme({ id: "T-2", priority: 100 }),
        createMockTheme({ id: "T-3", priority: 200 }),
      ];
      const state: SortState = { key: "priority", direction: "asc" };
      const sorted = sortThemesByEpicSprintOrder(
        themes,
        sprintSequence,
        () => [],
        () => [],
        state,
      );
      expect(sorted.map((t) => t.id)).toEqual(["T-2", "T-3", "T-1"]);
    });

    it("should sort themes by priority descending when sortState provided", () => {
      const themes = [createMockTheme({ id: "T-1", priority: 100 }), createMockTheme({ id: "T-2", priority: 300 })];
      const state: SortState = { key: "priority", direction: "desc" };
      const sorted = sortThemesByEpicSprintOrder(
        themes,
        sprintSequence,
        () => [],
        () => [],
        state,
      );
      expect(sorted.map((t) => t.id)).toEqual(["T-2", "T-1"]);
    });

    it("should sort themes by date ascending when sortState provided", () => {
      const themes = [
        createMockTheme({ id: "T-1", created: new Date("2025-03-01") }),
        createMockTheme({ id: "T-2", created: new Date("2025-01-01") }),
        createMockTheme({ id: "T-3", created: new Date("2025-02-01") }),
      ];
      const state: SortState = { key: "date", direction: "asc" };
      const sorted = sortThemesByEpicSprintOrder(
        themes,
        sprintSequence,
        () => [],
        () => [],
        state,
      );
      expect(sorted.map((t) => t.id)).toEqual(["T-2", "T-3", "T-1"]);
    });

    it("should sort themes by ID number ascending when sortState provided", () => {
      const themes = [createMockTheme({ id: "THEME-003" }), createMockTheme({ id: "THEME-001" }), createMockTheme({ id: "THEME-002" })];
      const state: SortState = { key: "id", direction: "asc" };
      const sorted = sortThemesByEpicSprintOrder(
        themes,
        sprintSequence,
        () => [],
        () => [],
        state,
      );
      expect(sorted.map((t) => t.id)).toEqual(["THEME-001", "THEME-002", "THEME-003"]);
    });

    it("should fall back to sprint order when no sortState provided", () => {
      const themes = [
        createMockTheme({ id: "T-1", created: new Date("2025-01-10") }),
        createMockTheme({ id: "T-2", created: new Date("2025-01-20") }),
      ];
      const epicsForTheme: Record<string, Epic[]> = {
        "T-1": [createMockEpic({ id: "E-1" })],
        "T-2": [createMockEpic({ id: "E-2" })],
      };
      const storyForEpic: Record<string, Story[]> = {
        "E-1": [createMockStory({ sprint: "launch-1" })],
        "E-2": [createMockStory({ sprint: "foundation-1" })],
      };
      const sorted = sortThemesByEpicSprintOrder(
        themes,
        sprintSequence,
        (tid) => epicsForTheme[tid] ?? [],
        (eid) => storyForEpic[eid] ?? [],
      );
      expect(sorted.map((t) => t.id)).toEqual(["T-2", "T-1"]);
    });
  });

  describe("sortStoriesBy", () => {
    const seq = ["sprint-1", "sprint-2"];

    it("sorts by priority ascending (lower = more important)", () => {
      const stories = [
        createMockStory({ id: "S-1", priority: 300 }),
        createMockStory({ id: "S-2", priority: 100 }),
        createMockStory({ id: "S-3", priority: 200 }),
      ];
      const state: SortState = { key: "priority", direction: "asc" };
      const sorted = sortStoriesBy(stories, state, seq);
      expect(sorted.map((s) => s.id)).toEqual(["S-2", "S-3", "S-1"]);
    });

    it("sorts by priority descending", () => {
      const stories = [createMockStory({ id: "S-1", priority: 300 }), createMockStory({ id: "S-2", priority: 100 })];
      const state: SortState = { key: "priority", direction: "desc" };
      const sorted = sortStoriesBy(stories, state, seq);
      expect(sorted.map((s) => s.id)).toEqual(["S-1", "S-2"]);
    });

    it("sorts by date created ascending", () => {
      const stories = [
        createMockStory({ id: "S-1", created: new Date("2025-03-01") }),
        createMockStory({ id: "S-2", created: new Date("2025-01-01") }),
        createMockStory({ id: "S-3", created: new Date("2025-02-01") }),
      ];
      const state: SortState = { key: "date", direction: "asc" };
      const sorted = sortStoriesBy(stories, state, seq);
      expect(sorted.map((s) => s.id)).toEqual(["S-2", "S-3", "S-1"]);
    });

    it("sorts by date created descending", () => {
      const stories = [
        createMockStory({ id: "S-1", created: new Date("2025-01-01") }),
        createMockStory({ id: "S-2", created: new Date("2025-03-01") }),
      ];
      const state: SortState = { key: "date", direction: "desc" };
      const sorted = sortStoriesBy(stories, state, seq);
      expect(sorted.map((s) => s.id)).toEqual(["S-2", "S-1"]);
    });

    it("sorts by story ID number ascending", () => {
      const stories = [
        createMockStory({ id: "STORY-00003" }),
        createMockStory({ id: "STORY-00001" }),
        createMockStory({ id: "STORY-00002" }),
      ];
      const state: SortState = { key: "id", direction: "asc" };
      const sorted = sortStoriesBy(stories, state, seq);
      expect(sorted.map((s) => s.id)).toEqual(["STORY-00001", "STORY-00002", "STORY-00003"]);
    });

    it("sorts by story ID number descending", () => {
      const stories = [createMockStory({ id: "STORY-00001" }), createMockStory({ id: "STORY-00002" })];
      const state: SortState = { key: "id", direction: "desc" };
      const sorted = sortStoriesBy(stories, state, seq);
      expect(sorted.map((s) => s.id)).toEqual(["STORY-00002", "STORY-00001"]);
    });

    it("does not mutate the original array", () => {
      const stories = [createMockStory({ id: "S-1", priority: 200 }), createMockStory({ id: "S-2", priority: 100 })];
      const original = [...stories];
      const state: SortState = { key: "priority", direction: "asc" };
      sortStoriesBy(stories, state, seq);
      expect(stories.map((s) => s.id)).toEqual(original.map((s) => s.id));
    });
  });

  describe("getTreeViewTitle", () => {
    it('shows "BACKLOG: Current X" when no filter is active (default backlog mode)', () => {
      expect(getTreeViewTitle("sprint-4", null)).toBe("BACKLOG: Current sprint-4");
    });

    it('shows "BACKLOG: Current X" when filter matches current sprint', () => {
      expect(getTreeViewTitle("sprint-4", "sprint-4")).toBe("BACKLOG: Current sprint-4");
    });

    it('shows "BREAKDOWN: Current X: Showing Y" when filter differs in breakdown mode', () => {
      expect(getTreeViewTitle("sprint-4", "sprint-3", "breakdown")).toBe("BREAKDOWN: Current sprint-4: Showing sprint-3");
    });

    it('shows "BACKLOG: Current X: Showing Backlog" when backlog filter is active', () => {
      expect(getTreeViewTitle("sprint-4", "backlog")).toBe("BACKLOG: Current sprint-4: Showing Backlog");
    });

    it('shows "BACKLOG: Current (none)" when no current sprint configured', () => {
      expect(getTreeViewTitle(null, null)).toBe("BACKLOG: Current (none)");
    });

    it('shows "BACKLOG: Current (none): Showing Y" when filter active but no current sprint', () => {
      expect(getTreeViewTitle(undefined, "sprint-1")).toBe("BACKLOG: Current (none): Showing sprint-1");
    });

    it('shows "BREAKDOWN: Current X" when in breakdown mode with no filter', () => {
      expect(getTreeViewTitle("sprint-4", null, "breakdown")).toBe("BREAKDOWN: Current sprint-4");
    });

    it('shows "BACKLOG: Current X" when explicitly in backlog mode', () => {
      expect(getTreeViewTitle("sprint-4", null, "backlog")).toBe("BACKLOG: Current sprint-4");
    });
  });

  describe("getStatusIndicator", () => {
    // Helper to create status array
    const makeStatuses = (...ids: string[]): StatusDef[] => ids.map((id) => ({ id, label: id }));

    it("should return ○ for first status (not started)", () => {
      const statuses = makeStatuses("todo", "in_progress", "review", "done");
      expect(getStatusIndicator("todo", statuses)).toBe("○");
    });

    it("should return ● for last status (complete)", () => {
      const statuses = makeStatuses("todo", "in_progress", "review", "done");
      expect(getStatusIndicator("done", statuses)).toBe("●");
    });

    it("should handle 2 statuses: ○ ●", () => {
      const statuses = makeStatuses("open", "closed");
      expect(getStatusIndicator("open", statuses)).toBe("○");
      expect(getStatusIndicator("closed", statuses)).toBe("●");
    });

    it("should handle 3 statuses: ○ ◐ ●", () => {
      const statuses = makeStatuses("todo", "doing", "done");
      expect(getStatusIndicator("todo", statuses)).toBe("○");
      expect(getStatusIndicator("doing", statuses)).toBe("◐");
      expect(getStatusIndicator("done", statuses)).toBe("●");
    });

    it("should handle 4 statuses: ○ ◔ ◐ ●", () => {
      const statuses = makeStatuses("todo", "in_progress", "review", "done");
      expect(getStatusIndicator("todo", statuses)).toBe("○");
      expect(getStatusIndicator("in_progress", statuses)).toBe("◔");
      expect(getStatusIndicator("review", statuses)).toBe("◐");
      expect(getStatusIndicator("done", statuses)).toBe("●");
    });

    it("should handle 5 statuses: ○ ◎ ◐ ◕ ●", () => {
      const statuses = makeStatuses("backlog", "wip", "review", "qa", "deployed");
      expect(getStatusIndicator("backlog", statuses)).toBe("○");
      expect(getStatusIndicator("wip", statuses)).toBe("◎");
      expect(getStatusIndicator("review", statuses)).toBe("◐");
      expect(getStatusIndicator("qa", statuses)).toBe("◕");
      expect(getStatusIndicator("deployed", statuses)).toBe("●");
    });

    it("should return ○ for unknown status", () => {
      const statuses = makeStatuses("todo", "done");
      expect(getStatusIndicator("unknown", statuses)).toBe("○");
    });

    it("should return ○ for empty statuses array", () => {
      expect(getStatusIndicator("todo", [])).toBe("○");
    });

    it("should return ● for single status (always complete)", () => {
      const statuses = makeStatuses("only");
      expect(getStatusIndicator("only", statuses)).toBe("●");
    });

    it("should use isCompletion as endpoint: done=● in extended workflow", () => {
      const statuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "in_progress", label: "In Progress" },
        { id: "review", label: "Review" },
        { id: "done", label: "Done", isCompletion: true },
        { id: "blocked", label: "Blocked" },
        { id: "deferred", label: "Deferred" },
        { id: "cancelled", label: "Cancelled" },
      ];
      expect(getStatusIndicator("done", statuses)).toBe("●");
    });

    it("should show distinct icons for post-completion statuses", () => {
      const statuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "in_progress", label: "In Progress" },
        { id: "review", label: "Review" },
        { id: "done", label: "Done", isCompletion: true },
        { id: "blocked", label: "Blocked" },
        { id: "deferred", label: "Deferred" },
        { id: "cancelled", label: "Cancelled" },
      ];
      expect(getStatusIndicator("blocked", statuses)).toBe("⊘");
      expect(getStatusIndicator("deferred", statuses)).toBe("⏸");
      expect(getStatusIndicator("cancelled", statuses)).toBe("⊗");
    });

    it("should fall back to ○ for unknown post-completion statuses", () => {
      const statuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "done", label: "Done", isCompletion: true },
        { id: "custom_post", label: "Custom" },
      ];
      expect(getStatusIndicator("custom_post", statuses)).toBe("○");
    });

    it("should interpolate active workflow correctly with isCompletion set", () => {
      // Active range [0..3]: todo=○, in_progress=◔, review=◐, done=●
      const statuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "in_progress", label: "In Progress" },
        { id: "review", label: "Review" },
        { id: "done", label: "Done", isCompletion: true },
        { id: "blocked", label: "Blocked" },
        { id: "cancelled", label: "Cancelled" },
      ];
      expect(getStatusIndicator("todo", statuses)).toBe("○");
      expect(getStatusIndicator("in_progress", statuses)).toBe("◔");
      expect(getStatusIndicator("review", statuses)).toBe("◐");
    });
  });
});

describe("getNodeContextValue", () => {
  it('returns "story" for non-archived story', () => {
    expect(getNodeContextValue("story", false)).toBe("story");
  });

  it('returns "story-archived" for archived story', () => {
    expect(getNodeContextValue("story", true)).toBe("story-archived");
  });

  it('returns "epic" for non-archived epic', () => {
    expect(getNodeContextValue("epic", false)).toBe("epic");
  });

  it('returns "epic-archived" for archived epic', () => {
    expect(getNodeContextValue("epic", true)).toBe("epic-archived");
  });

  it('returns "theme" for non-archived theme', () => {
    expect(getNodeContextValue("theme", false)).toBe("theme");
  });

  it('returns "theme-archived" for archived theme', () => {
    expect(getNodeContextValue("theme", true)).toBe("theme-archived");
  });

  it('returns "task" for non-archived task', () => {
    expect(getNodeContextValue("task", false)).toBe("task");
  });

  it('returns "task-archived" for archived task', () => {
    expect(getNodeContextValue("task", true)).toBe("task-archived");
  });

  it("returns base contextValue when isArchived is undefined", () => {
    expect(getNodeContextValue("story", undefined)).toBe("story");
  });
});

describe("getArchivedDescription", () => {
  it('appends " (archived)" when isArchived is true', () => {
    expect(getArchivedDescription("● done", true)).toBe("● done (archived)");
  });

  it("returns description unchanged when not archived", () => {
    expect(getArchivedDescription("● done", false)).toBe("● done");
  });

  it("returns description unchanged when isArchived is undefined", () => {
    expect(getArchivedDescription("○ todo", undefined)).toBe("○ todo");
  });

  it("handles undefined description with archived flag", () => {
    expect(getArchivedDescription(undefined, true)).toBe("(archived)");
  });

  it("returns undefined when description is undefined and not archived", () => {
    expect(getArchivedDescription(undefined, false)).toBeUndefined();
  });
});
