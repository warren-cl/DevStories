/**
 * Unit tests for burndownUtils — sprint date calculations and burndown data.
 */

import { describe, it, expect } from "vitest";
import {
  parseISODate,
  formatISODate,
  addDays,
  formatShortDate,
  getSprintDateRange,
  isBurndownConfigured,
  calculateBurndown,
  findStoriesMissingCompletedOn,
} from "../../view/burndownUtils";
import { Story } from "../../types/story";
import { StatusDef } from "../../core/configServiceUtils";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "DS-001",
    title: "Test story",
    type: "feature",
    epic: "EPIC-001",
    status: "todo",
    sprint: "sprint-1",
    size: "M",
    priority: 500,
    dependencies: [],
    created: new Date("2026-01-01"),
    content: "",
    ...overrides,
  };
}

const DEFAULT_STATUSES: StatusDef[] = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done", isCompletion: true },
  { id: "cancelled", label: "Cancelled", isExcluded: true },
  { id: "deferred", label: "Deferred", isExcluded: true },
];

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL"];
const DEFAULT_STORYPOINTS = [1, 2, 4, 8, 16];
const SPRINT_SEQUENCE = ["sprint-1", "sprint-2", "sprint-3", "sprint-4"];
const FIRST_SPRINT_START = "2026-01-06";
const SPRINT_LENGTH = 14;

// ─── parseISODate / formatISODate / addDays ─────────────────────────────────

describe("date helpers", () => {
  it("parseISODate returns UTC midnight", () => {
    const d = parseISODate("2026-03-02");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2); // March = 2
    expect(d.getUTCDate()).toBe(2);
    expect(d.getUTCHours()).toBe(0);
  });

  it("formatISODate round-trips", () => {
    expect(formatISODate(parseISODate("2026-01-06"))).toBe("2026-01-06");
    expect(formatISODate(parseISODate("2026-12-31"))).toBe("2026-12-31");
  });

  it("addDays adds correctly", () => {
    const base = parseISODate("2026-01-06");
    expect(formatISODate(addDays(base, 0))).toBe("2026-01-06");
    expect(formatISODate(addDays(base, 13))).toBe("2026-01-19");
    expect(formatISODate(addDays(base, 14))).toBe("2026-01-20");
  });

  it("addDays handles month boundaries", () => {
    const d = parseISODate("2026-01-28");
    expect(formatISODate(addDays(d, 5))).toBe("2026-02-02");
  });

  it("formatShortDate shows month and day", () => {
    expect(formatShortDate(parseISODate("2026-03-02"), "en-US")).toBe("Mar 2");
    expect(formatShortDate(parseISODate("2026-12-25"), "en-US")).toBe("Dec 25");
  });
});

// ─── getSprintDateRange ─────────────────────────────────────────────────────

describe("getSprintDateRange", () => {
  it("returns correct range for first sprint", () => {
    const range = getSprintDateRange("sprint-1", SPRINT_SEQUENCE, FIRST_SPRINT_START, SPRINT_LENGTH);
    expect(range).toBeDefined();
    expect(formatISODate(range!.start)).toBe("2026-01-06");
    expect(formatISODate(range!.end)).toBe("2026-01-19");
  });

  it("returns correct range for second sprint", () => {
    const range = getSprintDateRange("sprint-2", SPRINT_SEQUENCE, FIRST_SPRINT_START, SPRINT_LENGTH);
    expect(range).toBeDefined();
    expect(formatISODate(range!.start)).toBe("2026-01-20");
    expect(formatISODate(range!.end)).toBe("2026-02-02");
  });

  it("returns correct range for fourth sprint", () => {
    const range = getSprintDateRange("sprint-4", SPRINT_SEQUENCE, FIRST_SPRINT_START, SPRINT_LENGTH);
    expect(range).toBeDefined();
    expect(formatISODate(range!.start)).toBe("2026-02-17");
    expect(formatISODate(range!.end)).toBe("2026-03-02");
  });

  it("returns undefined for sprint not in sequence", () => {
    expect(getSprintDateRange("sprint-99", SPRINT_SEQUENCE, FIRST_SPRINT_START, SPRINT_LENGTH)).toBeUndefined();
  });

  it("returns undefined for empty sequence", () => {
    expect(getSprintDateRange("sprint-1", [], FIRST_SPRINT_START, SPRINT_LENGTH)).toBeUndefined();
  });

  it("handles sprint length of 7 days", () => {
    const range = getSprintDateRange("sprint-2", SPRINT_SEQUENCE, FIRST_SPRINT_START, 7);
    expect(range).toBeDefined();
    expect(formatISODate(range!.start)).toBe("2026-01-13");
    expect(formatISODate(range!.end)).toBe("2026-01-19");
  });
});

// ─── isBurndownConfigured ───────────────────────────────────────────────────

describe("isBurndownConfigured", () => {
  it("returns true when both fields are set", () => {
    expect(isBurndownConfigured({ sprintLength: 14, firstSprintStartDate: "2026-01-06" })).toBe(true);
  });

  it("returns false when sprintLength missing", () => {
    expect(isBurndownConfigured({ firstSprintStartDate: "2026-01-06" })).toBe(false);
  });

  it("returns false when firstSprintStartDate missing", () => {
    expect(isBurndownConfigured({ sprintLength: 14 })).toBe(false);
  });

  it("returns false when both missing", () => {
    expect(isBurndownConfigured({})).toBe(false);
  });

  it("returns false when sprintLength is 0", () => {
    expect(isBurndownConfigured({ sprintLength: 0, firstSprintStartDate: "2026-01-06" })).toBe(false);
  });

  it("returns false when firstSprintStartDate is empty string", () => {
    expect(isBurndownConfigured({ sprintLength: 14, firstSprintStartDate: "" })).toBe(false);
  });
});

// ─── calculateBurndown ──────────────────────────────────────────────────────

describe("calculateBurndown", () => {
  const sprintStart = parseISODate("2026-01-06");

  it("returns one data point per sprint day", () => {
    const stories = [makeStory({ size: "M" })];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-10");
    expect(result).toHaveLength(14);
  });

  it("ideal line starts at total points and ends at 0", () => {
    const stories = [
      makeStory({ id: "DS-001", size: "M" }), // 4 pts
      makeStory({ id: "DS-002", size: "S" }), // 2 pts
    ];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-06");

    // Total planned = 6
    expect(result[0].ideal).toBe(6);
    expect(result[result.length - 1].ideal).toBe(0);
  });

  it("ideal line is linear", () => {
    const stories = [makeStory({ size: "L" })]; // 8 pts, 14 days
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-06");

    // Should decrease linearly
    for (let i = 1; i < result.length; i++) {
      expect(result[i].ideal).toBeLessThan(result[i - 1].ideal);
    }
  });

  it("actual line starts at total when nothing is done", () => {
    const stories = [makeStory({ size: "M", status: "todo" })]; // 4 pts
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-06");

    expect(result[0].actual).toBe(4);
  });

  it("actual line decreases when stories are done", () => {
    const stories = [
      makeStory({ id: "DS-001", size: "M", status: "done", completedOn: new Date("2026-01-08") }), // 4 pts, done day 3
      makeStory({ id: "DS-002", size: "S", status: "todo" }), // 2 pts, not done
    ];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-10");

    // Day 0 (Jan 6): nothing done yet -> 6
    expect(result[0].actual).toBe(6);
    // Day 1 (Jan 7): still nothing done -> 6
    expect(result[1].actual).toBe(6);
    // Day 2 (Jan 8): DS-001 done -> 6 - 4 = 2
    expect(result[2].actual).toBe(2);
    // Day 4 (Jan 10): still 2
    expect(result[4].actual).toBe(2);
  });

  it("actual is null for future dates", () => {
    const stories = [makeStory({ size: "M" })];
    // Today is Jan 8, sprint is 14 days from Jan 6
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-08");

    // Jan 6, 7, 8 have actuals (days 0, 1, 2)
    expect(result[0].actual).not.toBeNull();
    expect(result[1].actual).not.toBeNull();
    expect(result[2].actual).not.toBeNull();
    // Jan 9 onward should be null
    expect(result[3].actual).toBeNull();
    expect(result[13].actual).toBeNull();
  });

  it("excluded stories are not counted at all", () => {
    const stories = [
      makeStory({ id: "DS-001", size: "L", status: "todo" }), // 8 pts - counted
      makeStory({ id: "DS-002", size: "XL", status: "cancelled" }), // 16 pts - excluded
      makeStory({ id: "DS-003", size: "M", status: "deferred" }), // 4 pts - excluded
    ];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-06");

    // Only DS-001 counts: 8 pts
    expect(result[0].ideal).toBe(8);
    expect(result[0].actual).toBe(8);
  });

  it("completed + excluded story has no contribution", () => {
    // A cancelled story with completedOn set should still be excluded
    const stories = [makeStory({ id: "DS-001", size: "M", status: "cancelled", completedOn: new Date("2026-01-07") })];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-10");

    expect(result[0].ideal).toBe(0);
    expect(result[0].actual).toBe(0);
  });

  it("empty sprint returns all-zero data", () => {
    const result = calculateBurndown([], sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-10");
    expect(result).toHaveLength(14);
    expect(result[0].ideal).toBe(0);
    expect(result[0].actual).toBe(0);
  });

  it("single-day sprint has ideal of 0", () => {
    const stories = [makeStory({ size: "M" })]; // 4 pts
    const result = calculateBurndown(stories, sprintStart, 1, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-06");
    expect(result).toHaveLength(1);
    expect(result[0].ideal).toBe(0); // no time to burn down
    expect(result[0].actual).toBe(4);
  });

  it("handles multiple stories done on the same day", () => {
    const stories = [
      makeStory({ id: "DS-001", size: "S", status: "done", completedOn: new Date("2026-01-08") }), // 2
      makeStory({ id: "DS-002", size: "M", status: "done", completedOn: new Date("2026-01-08") }), // 4
      makeStory({ id: "DS-003", size: "L", status: "todo" }), // 8
    ];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-08");

    // Total = 14, done on day 2 (Jan 8) = 6
    expect(result[0].actual).toBe(14);
    expect(result[2].actual).toBe(14 - 6); // 8
  });

  it("story done before sprint start still counts", () => {
    // Edge case: story marked done before sprint even started
    const stories = [
      makeStory({ id: "DS-001", size: "M", status: "done", completedOn: new Date("2026-01-01") }), // before sprint
      makeStory({ id: "DS-002", size: "S", status: "todo" }),
    ];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-06");

    // Total = 6, done from day 0 = 4, actual = 2
    expect(result[0].actual).toBe(2);
  });

  it("uses correct points from size mapping", () => {
    const stories = [
      makeStory({ id: "DS-001", size: "XS" }), // 1
      makeStory({ id: "DS-002", size: "XL" }), // 16
    ];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-06");

    expect(result[0].ideal).toBe(17);
  });

  it("falls back to 1 point for unknown size", () => {
    const stories = [makeStory({ size: "UNKNOWN" as never })];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-06");

    expect(result[0].ideal).toBe(1);
  });

  it("actual line ends at 0 when all stories are done", () => {
    const stories = [
      makeStory({ id: "DS-001", size: "M", status: "done", completedOn: new Date("2026-01-08") }),
      makeStory({ id: "DS-002", size: "S", status: "done", completedOn: new Date("2026-01-10") }),
    ];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-19");

    // Last day: all done
    const lastDay = result[result.length - 1];
    expect(lastDay.actual).toBe(0);
  });

  it("dates in data points match sprint days", () => {
    const result = calculateBurndown([makeStory()], sprintStart, 5, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-10");

    expect(result.map((d) => d.date)).toEqual(["2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10"]);
  });

  it("falls back to updated date when completedOn is missing", () => {
    const stories = [
      makeStory({ id: "DS-001", size: "M", status: "done", completedOn: undefined, updated: new Date("2026-01-09") }),
      makeStory({ id: "DS-002", size: "S", status: "todo" }),
    ];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-10");

    // Day 0-2 (Jan 6-8): nothing done yet -> 6
    expect(result[0].actual).toBe(6);
    expect(result[2].actual).toBe(6);
    // Day 3 (Jan 9): DS-001 counted as done via updated -> 6 - 4 = 2
    expect(result[3].actual).toBe(2);
  });

  it("prefers completedOn over updated when both present", () => {
    const stories = [
      makeStory({
        id: "DS-001",
        size: "M",
        status: "done",
        completedOn: new Date("2026-01-08"),
        updated: new Date("2026-01-10"), // later, but should be ignored
      }),
    ];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-12");

    // Should use completedOn (Jan 8), not updated (Jan 10)
    expect(result[1].actual).toBe(4); // Jan 7: not yet
    expect(result[2].actual).toBe(0); // Jan 8: done
  });

  it("excludes done story from actual line when both completedOn and updated are missing", () => {
    const stories = [
      makeStory({ id: "DS-001", size: "M", status: "done", completedOn: undefined, updated: undefined }),
      makeStory({ id: "DS-002", size: "S", status: "todo" }),
    ];
    const result = calculateBurndown(stories, sprintStart, 14, DEFAULT_STATUSES, DEFAULT_SIZES, DEFAULT_STORYPOINTS, "2026-01-19");

    // DS-001 is done but excluded from actual line (no effective date).
    // Total planned points = 6 (both stories counted).
    // Actual never goes below 4 because DS-001 never has a counted completion day.
    expect(result[0].actual).toBe(6);
    expect(result[13].actual).toBe(6);
  });
});

// ─── findStoriesMissingCompletedOn ──────────────────────────────────────────

describe("findStoriesMissingCompletedOn", () => {
  it("returns IDs of done stories without completedOn", () => {
    const stories = [
      makeStory({ id: "DS-001", status: "done", completedOn: undefined }),
      makeStory({ id: "DS-002", status: "done", completedOn: new Date("2026-01-08") }),
      makeStory({ id: "DS-003", status: "todo" }),
    ];
    expect(findStoriesMissingCompletedOn(stories, DEFAULT_STATUSES)).toEqual(["DS-001"]);
  });

  it("returns empty array when all done stories have completedOn", () => {
    const stories = [
      makeStory({ id: "DS-001", status: "done", completedOn: new Date("2026-01-08") }),
      makeStory({ id: "DS-002", status: "todo" }),
    ];
    expect(findStoriesMissingCompletedOn(stories, DEFAULT_STATUSES)).toEqual([]);
  });

  it("returns empty array for no stories", () => {
    expect(findStoriesMissingCompletedOn([], DEFAULT_STATUSES)).toEqual([]);
  });

  it("ignores excluded statuses even without completedOn", () => {
    const stories = [makeStory({ id: "DS-001", status: "cancelled", completedOn: undefined })];
    expect(findStoriesMissingCompletedOn(stories, DEFAULT_STATUSES)).toEqual([]);
  });

  it("returns multiple IDs when several done stories lack completedOn", () => {
    const stories = [
      makeStory({ id: "DS-001", status: "done", completedOn: undefined }),
      makeStory({ id: "DS-002", status: "done", completedOn: undefined }),
      makeStory({ id: "DS-003", status: "done", completedOn: new Date("2026-01-10") }),
    ];
    expect(findStoriesMissingCompletedOn(stories, DEFAULT_STATUSES)).toEqual(["DS-001", "DS-002"]);
  });
});
