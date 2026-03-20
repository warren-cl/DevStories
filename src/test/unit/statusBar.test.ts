/**
 * Unit tests for StatusBarController
 * TDD: Test sprint-aware functionality
 */

import { describe, it, expect } from "vitest";
import {
  getStatsFromStories,
  getFormattedStatusBarText,
  buildProgressBar,
  collectAvailableSprints,
  formatTooltipLines,
} from "../../view/statusBarUtils";
import { Story } from "../../types/story";
import { StatusDef, getSizePoints } from "../../core/configServiceUtils";

// Helper to create test stories
function createStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "TEST-001",
    title: "Test Story",
    type: "feature",
    epic: "EPIC-001",
    status: "todo",
    sprint: "sprint-1",
    size: "M",
    priority: 500,
    assignee: "",
    dependencies: [],
    created: new Date("2025-01-01"),
    content: "# Test Story",
    ...overrides,
  };
}

describe("statusBarUtils", () => {
  const DEFAULT_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];
  const DEFAULT_POINTS = [1, 2, 4, 8, 16, 32, 64];

  describe("getSizePoints", () => {
    it("returns correct point value for known size", () => {
      expect(getSizePoints("M", DEFAULT_SIZES, DEFAULT_POINTS)).toBe(8);
      expect(getSizePoints("XS", DEFAULT_SIZES, DEFAULT_POINTS)).toBe(2);
      expect(getSizePoints("XXL", DEFAULT_SIZES, DEFAULT_POINTS)).toBe(64);
      expect(getSizePoints("XXS", DEFAULT_SIZES, DEFAULT_POINTS)).toBe(1);
    });

    it("returns 1 for unknown size (fallback)", () => {
      expect(getSizePoints("UNKNOWN", DEFAULT_SIZES, DEFAULT_POINTS)).toBe(1);
    });

    it("returns 1 when sizes and storypoints are empty", () => {
      expect(getSizePoints("M", [], [])).toBe(1);
    });
  });

  describe("getStatsFromStories", () => {
    it("should sum points for all stories when no sprint filter", () => {
      // Each M story = 8 pts; 3 total = 24 pts, 2 done = 16 pts
      const stories: Story[] = [
        createStory({ id: "S-1", status: "done", sprint: "sprint-1", size: "M" }),
        createStory({ id: "S-2", status: "done", sprint: "sprint-2", size: "M" }),
        createStory({ id: "S-3", status: "todo", sprint: "sprint-1", size: "M" }),
      ];

      const stats = getStatsFromStories(stories, null, [], DEFAULT_SIZES, DEFAULT_POINTS);
      expect(stats.totalPoints).toBe(24);
      expect(stats.donePoints).toBe(16);
    });

    it("should sum mixed sizes correctly", () => {
      // XS=2, M=8, XL=32
      const statuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "done", label: "Done" },
      ];
      const stories: Story[] = [
        createStory({ id: "S-1", status: "done", sprint: "sprint-1", size: "XS" }),
        createStory({ id: "S-2", status: "done", sprint: "sprint-1", size: "M" }),
        createStory({ id: "S-3", status: "todo", sprint: "sprint-1", size: "XL" }),
      ];

      const stats = getStatsFromStories(stories, "sprint-1", statuses, DEFAULT_SIZES, DEFAULT_POINTS);
      expect(stats.totalPoints).toBe(42); // 2 + 8 + 32
      expect(stats.donePoints).toBe(10); // 2 + 8
    });

    it("should filter by sprint when sprint provided", () => {
      const stories: Story[] = [
        createStory({ id: "S-1", status: "done", sprint: "sprint-1", size: "M" }),
        createStory({ id: "S-2", status: "done", sprint: "sprint-2", size: "M" }),
        createStory({ id: "S-3", status: "todo", sprint: "sprint-1", size: "M" }),
      ];

      const stats = getStatsFromStories(stories, "sprint-1", [], DEFAULT_SIZES, DEFAULT_POINTS);
      expect(stats.totalPoints).toBe(16); // 2 × M(8)
      expect(stats.donePoints).toBe(8); // 1 × M(8)
    });

    it("should handle backlog filter (empty/undefined sprint)", () => {
      const stories: Story[] = [
        createStory({ id: "S-1", status: "done", sprint: "" }),
        createStory({ id: "S-2", status: "done", sprint: undefined }),
        createStory({ id: "S-3", status: "todo", sprint: "sprint-1" }),
        createStory({ id: "S-4", status: "todo", sprint: "backlog" }),
      ];

      // No sizes/storypoints → each = 1pt
      const stats = getStatsFromStories(stories, "backlog");
      expect(stats.totalPoints).toBe(3); // empty, undefined, and 'backlog' all count
      expect(stats.donePoints).toBe(2);
    });

    it("should return 0 for empty array", () => {
      const stats = getStatsFromStories([], null);
      expect(stats.totalPoints).toBe(0);
      expect(stats.donePoints).toBe(0);
    });

    it("should use custom completion status when provided", () => {
      const customStatuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "done", label: "Done" },
        { id: "deployed", label: "Deployed" },
      ];
      const stories: Story[] = [
        createStory({ id: "S-1", status: "done", sprint: "sprint-1" }),
        createStory({ id: "S-2", status: "deployed", sprint: "sprint-1" }),
        createStory({ id: "S-3", status: "todo", sprint: "sprint-1" }),
      ];

      // With custom statuses: only 'deployed' counts as complete; no sizes → 1pt each
      const stats = getStatsFromStories(stories, null, customStatuses);
      expect(stats.totalPoints).toBe(3);
      expect(stats.donePoints).toBe(1); // Only the deployed story
    });

    it("should fall back to literal done when statuses empty", () => {
      const stories: Story[] = [
        createStory({ id: "S-1", status: "done", sprint: "sprint-1" }),
        createStory({ id: "S-2", status: "deployed", sprint: "sprint-1" }),
      ];

      // With empty statuses array: falls back to literal 'done' check; no sizes → 1pt each
      const stats = getStatsFromStories(stories, null, []);
      expect(stats.totalPoints).toBe(2);
      expect(stats.donePoints).toBe(1); // Only the 'done' story
    });

    it("should exclude stories with isExcluded statuses from both totals", () => {
      const statuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "in_progress", label: "In Progress" },
        { id: "done", label: "Done", isCompletion: true },
        { id: "cancelled", label: "Cancelled", isExcluded: true },
        { id: "superseded", label: "Superseded", isExcluded: true },
      ];
      const stories: Story[] = [
        createStory({ id: "S-1", status: "done", sprint: "sprint-1", size: "M" }), // 8 pts, done
        createStory({ id: "S-2", status: "todo", sprint: "sprint-1", size: "S" }), // 4 pts
        createStory({ id: "S-3", status: "cancelled", sprint: "sprint-1", size: "L" }), // 16 pts, excluded
        createStory({ id: "S-4", status: "superseded", sprint: "sprint-1", size: "M" }), // 8 pts, excluded
      ];

      const stats = getStatsFromStories(stories, "sprint-1", statuses, DEFAULT_SIZES, DEFAULT_POINTS);
      expect(stats.totalPoints).toBe(12); // 8 + 4 (cancelled + superseded excluded)
      expect(stats.donePoints).toBe(8); // only the done story
    });
  });

  describe("buildProgressBar", () => {
    it("should build progress bar with correct ratio", () => {
      const bar = buildProgressBar(3, 6, 6);
      expect(bar).toBe("███░░░");
    });

    it("should handle 0% complete", () => {
      const bar = buildProgressBar(0, 5, 6);
      expect(bar).toBe("░░░░░░");
    });

    it("should handle 100% complete", () => {
      const bar = buildProgressBar(5, 5, 6);
      expect(bar).toBe("██████");
    });

    it("should handle 0 total as 100% complete", () => {
      const bar = buildProgressBar(0, 0, 6);
      expect(bar).toBe("██████");
    });

    it("should round down for partial fills", () => {
      // 1/6 = 16.67% of 6 = 1 block
      const bar = buildProgressBar(1, 6, 6);
      expect(bar).toBe("█░░░░░");
    });
  });

  describe("getFormattedStatusBarText", () => {
    it('should show "All Sprints" when no sprint selected', () => {
      const text = getFormattedStatusBarText(2, 4, null);
      expect(text).toContain("All Sprints");
      expect(text).toContain("2/4 pts");
      expect(text).toContain("$(checklist)");
    });

    it("should show sprint name when sprint selected", () => {
      const text = getFormattedStatusBarText(3, 5, "sprint-2");
      expect(text).toContain("sprint-2");
      expect(text).toContain("3/5 pts");
    });

    it('should show "Backlog" for backlog filter', () => {
      const text = getFormattedStatusBarText(1, 3, "backlog");
      expect(text).toContain("Backlog");
      expect(text).toContain("1/3 pts");
    });

    it('should show "No stories" when total is 0', () => {
      const text = getFormattedStatusBarText(0, 0, "sprint-1");
      expect(text).toContain("sprint-1");
      expect(text).toContain("No stories");
    });
  });

  describe("collectAvailableSprints", () => {
    it("should extract unique sprints from stories", () => {
      const stories: Story[] = [
        createStory({ id: "S-1", sprint: "sprint-1" }),
        createStory({ id: "S-2", sprint: "sprint-2" }),
        createStory({ id: "S-3", sprint: "sprint-1" }),
        createStory({ id: "S-4", sprint: "sprint-3" }),
      ];

      const sprints = collectAvailableSprints(stories, undefined);
      expect(sprints).toContain("sprint-1");
      expect(sprints).toContain("sprint-2");
      expect(sprints).toContain("sprint-3");
    });

    it("should include current sprint from config even if no stories", () => {
      const stories: Story[] = [createStory({ id: "S-1", sprint: "sprint-1" })];

      const sprints = collectAvailableSprints(stories, "sprint-5");
      expect(sprints).toContain("sprint-1");
      expect(sprints).toContain("sprint-5");
    });

    it("should exclude empty/undefined sprints from list", () => {
      const stories: Story[] = [
        createStory({ id: "S-1", sprint: "" }),
        createStory({ id: "S-2", sprint: undefined }),
        createStory({ id: "S-3", sprint: "sprint-1" }),
      ];

      const sprints = collectAvailableSprints(stories, undefined);
      expect(sprints).not.toContain("");
      expect(sprints).not.toContain(undefined);
      expect(sprints).toContain("sprint-1");
    });

    it("should exclude backlog from sprint list", () => {
      const stories: Story[] = [createStory({ id: "S-1", sprint: "backlog" }), createStory({ id: "S-2", sprint: "sprint-1" })];

      const sprints = collectAvailableSprints(stories, undefined);
      expect(sprints).not.toContain("backlog");
      expect(sprints).toContain("sprint-1");
    });

    it("should sort sprints alphabetically", () => {
      const stories: Story[] = [
        createStory({ id: "S-1", sprint: "sprint-3" }),
        createStory({ id: "S-2", sprint: "sprint-1" }),
        createStory({ id: "S-3", sprint: "sprint-2" }),
      ];

      const sprints = collectAvailableSprints(stories, undefined);
      expect(sprints).toEqual(["sprint-1", "sprint-2", "sprint-3"]);
    });

    it("should return empty array for no stories and no config sprint", () => {
      const sprints = collectAvailableSprints([], undefined);
      expect(sprints).toEqual([]);
    });
  });

  // DS-064: Additional tests for tooltip formatting
  describe("formatTooltipLines", () => {
    it('should show "All Sprints" when sprint is null', () => {
      const lines = formatTooltipLines(3, 5, null);
      expect(lines).toContain("📊 Showing: All Sprints");
      expect(lines).toContain("✅ Done: 3 pts");
      expect(lines).toContain("📝 Remaining: 2 pts");
      expect(lines).toContain("📦 Total: 5 pts");
    });

    it("should show sprint name when sprint is specified", () => {
      const lines = formatTooltipLines(2, 4, "sprint-1");
      expect(lines).toContain("📊 Showing: sprint-1");
      expect(lines).toContain("✅ Done: 2 pts");
      expect(lines).toContain("📝 Remaining: 2 pts");
      expect(lines).toContain("📦 Total: 4 pts");
    });

    it('should show "Backlog" for backlog filter', () => {
      const lines = formatTooltipLines(1, 3, "backlog");
      expect(lines).toContain("📊 Showing: Backlog");
    });

    it("should include header but NOT click hint (DS-153)", () => {
      const lines = formatTooltipLines(0, 0, null);
      expect(lines).toContain("**DevStories: Sprint Progress**");
      expect(lines).not.toContain("*Click to change sprint filter*");
    });

    it("should calculate remaining correctly", () => {
      const lines = formatTooltipLines(7, 10, null);
      expect(lines).toContain("📝 Remaining: 3 pts");
    });

    it("should handle zero stories", () => {
      const lines = formatTooltipLines(0, 0, "sprint-1");
      expect(lines).toContain("✅ Done: 0 pts");
      expect(lines).toContain("📝 Remaining: 0 pts");
      expect(lines).toContain("📦 Total: 0 pts");
    });
  });
});
