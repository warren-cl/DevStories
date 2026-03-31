import { describe, it, expect } from "vitest";
import {
  computeArchiveCutoffIndex,
  getEligibleStories,
  getEligibleEpics,
  getEligibleThemes,
  getRestorableStories,
  getRestorableEpics,
  getRestorableThemes,
  buildArchivePlan,
  computeArchiveDestination,
  computeStorydocsArchiveDestination,
  computeLiveDestination,
} from "../../commands/archiveSprintUtils";
import { Story } from "../../types/story";
import { Epic } from "../../types/epic";
import { Theme } from "../../types/theme";
import { StatusDef } from "../../core/configServiceUtils";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStory(overrides: Partial<Story> & { id: string }): Story {
  return {
    title: overrides.id,
    type: "feature",
    epic: "",
    status: "todo",
    size: "M",
    priority: 500,
    created: new Date("2026-01-01"),
    content: "",
    filePath: `/project/.devstories/stories/${overrides.id}.md`,
    ...overrides,
  };
}

function makeEpic(overrides: Partial<Epic> & { id: string }): Epic {
  return {
    title: overrides.id,
    status: "todo",
    priority: 500,
    created: new Date("2026-01-01"),
    content: "",
    filePath: `/project/.devstories/epics/${overrides.id}.md`,
    ...overrides,
  };
}

function makeTheme(overrides: Partial<Theme> & { id: string }): Theme {
  return {
    title: overrides.id,
    status: "todo",
    priority: 500,
    created: new Date("2026-01-01"),
    content: "",
    filePath: `/project/.devstories/themes/${overrides.id}.md`,
    ...overrides,
  };
}

const sprintSequence = ["sprint-1", "sprint-2", "sprint-3", "sprint-4", "sprint-5"];
const statuses: StatusDef[] = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done", isCompletion: true, canArchive: true },
];

// ─── C1: Eligibility Logic ─────────────────────────────────────────────────

describe("computeArchiveCutoffIndex", () => {
  it("returns index of the selected sprint", () => {
    expect(computeArchiveCutoffIndex("sprint-3", sprintSequence)).toBe(2);
  });

  it("returns 0 for the first sprint", () => {
    expect(computeArchiveCutoffIndex("sprint-1", sprintSequence)).toBe(0);
  });

  it("returns last index for the last sprint", () => {
    expect(computeArchiveCutoffIndex("sprint-5", sprintSequence)).toBe(4);
  });

  it("returns -1 for sprint not in sequence", () => {
    expect(computeArchiveCutoffIndex("sprint-99", sprintSequence)).toBe(-1);
  });

  it("returns -1 for empty sequence", () => {
    expect(computeArchiveCutoffIndex("sprint-1", [])).toBe(-1);
  });
});

describe("getEligibleStories", () => {
  it("includes stories with sprint at or before cutoff", () => {
    const stories = [
      makeStory({ id: "S1", sprint: "sprint-1", status: "done" }),
      makeStory({ id: "S2", sprint: "sprint-2", status: "done" }),
      makeStory({ id: "S3", sprint: "sprint-3", status: "done" }),
    ];
    const result = getEligibleStories(stories, sprintSequence, 1, statuses);
    const ids = result.map((s) => s.id);
    expect(ids).toContain("S1");
    expect(ids).toContain("S2");
    expect(ids).not.toContain("S3");
  });

  it("includes stories at exact cutoff index", () => {
    const stories = [makeStory({ id: "S1", sprint: "sprint-2", status: "done" })];
    const result = getEligibleStories(stories, sprintSequence, 1, statuses);
    expect(result.map((s) => s.id)).toContain("S1");
  });

  it("excludes stories with sprint after cutoff", () => {
    const stories = [makeStory({ id: "S1", sprint: "sprint-4", status: "done" })];
    const result = getEligibleStories(stories, sprintSequence, 2, statuses);
    expect(result).toHaveLength(0);
  });

  it("excludes already-archived stories", () => {
    const stories = [makeStory({ id: "S1", sprint: "sprint-1", status: "done", isArchived: true })];
    const result = getEligibleStories(stories, sprintSequence, 2, statuses);
    expect(result).toHaveLength(0);
  });

  it("includes no-sprint stories with canArchive status when completedOn is before cutoff end date", () => {
    const stories = [
      makeStory({
        id: "S1",
        sprint: undefined,
        status: "done",
        completedOn: new Date("2026-01-10"),
      }),
    ];
    // cutoff sprint end = 2026-01-14 (sprint-1 starts 2026-01-01, length 14, cutoff index 0)
    const result = getEligibleStories(stories, sprintSequence, 0, statuses, {
      firstSprintStartDate: "2026-01-01",
      sprintLength: 14,
    });
    expect(result.map((s) => s.id)).toContain("S1");
  });

  it("excludes no-sprint stories with canArchive status when completedOn is after cutoff end date", () => {
    const stories = [
      makeStory({
        id: "S1",
        sprint: undefined,
        status: "done",
        completedOn: new Date("2026-02-01"),
      }),
    ];
    const result = getEligibleStories(stories, sprintSequence, 0, statuses, {
      firstSprintStartDate: "2026-01-01",
      sprintLength: 14,
    });
    expect(result).toHaveLength(0);
  });

  it("excludes no-sprint stories without canArchive status even with dates", () => {
    const stories = [makeStory({ id: "S1", sprint: undefined, status: "todo", updated: new Date("2026-01-05") })];
    const result = getEligibleStories(stories, sprintSequence, 2, statuses, {
      firstSprintStartDate: "2026-01-01",
      sprintLength: 14,
    });
    expect(result).toHaveLength(0);
  });

  it("excludes stories with unknown sprint (not in sequence)", () => {
    const stories = [makeStory({ id: "S1", sprint: "unknown-sprint", status: "done" })];
    const result = getEligibleStories(stories, sprintSequence, 2, statuses);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no stories match", () => {
    const stories = [makeStory({ id: "S1", sprint: "sprint-5", status: "todo" })];
    const result = getEligibleStories(stories, sprintSequence, 0, statuses);
    expect(result).toHaveLength(0);
  });

  it("includes any status in eligible sprint (status-agnostic)", () => {
    const stories = [makeStory({ id: "S1", sprint: "sprint-1", status: "in_progress" })];
    const result = getEligibleStories(stories, sprintSequence, 0, statuses);
    expect(result).toHaveLength(1);
  });

  it("includes cancelled story in eligible sprint", () => {
    const cancelledStatuses: StatusDef[] = [
      { id: "todo", label: "To Do" },
      { id: "done", label: "Done", isCompletion: true, canArchive: true },
      { id: "cancelled", label: "Cancelled", canArchive: true },
    ];
    const stories = [makeStory({ id: "S1", sprint: "sprint-1", status: "cancelled" })];
    const result = getEligibleStories(stories, sprintSequence, 0, cancelledStatuses);
    expect(result).toHaveLength(1);
  });

  it("includes no-sprint story with canArchive status using updated date fallback", () => {
    const stories = [
      makeStory({
        id: "S1",
        sprint: undefined,
        status: "done",
        updated: new Date("2026-01-10"),
      }),
    ];
    const result = getEligibleStories(stories, sprintSequence, 0, statuses, {
      firstSprintStartDate: "2026-01-01",
      sprintLength: 14,
    });
    expect(result.map((s) => s.id)).toContain("S1");
  });

  it("excludes no-sprint story with canArchive status but no dates", () => {
    const stories = [makeStory({ id: "S1", sprint: undefined, status: "done" })];
    const result = getEligibleStories(stories, sprintSequence, 0, statuses, {
      firstSprintStartDate: "2026-01-01",
      sprintLength: 14,
    });
    expect(result).toHaveLength(0);
  });
});

describe("getEligibleEpics", () => {
  it("includes epic when ALL its stories are eligible or already archived and epic has canArchive status", () => {
    const stories = [
      makeStory({ id: "S1", epic: "E1", sprint: "sprint-1", status: "done" }),
      makeStory({ id: "S2", epic: "E1", sprint: "sprint-2", status: "done", isArchived: true }),
    ];
    const epics = [makeEpic({ id: "E1", status: "done" })];
    const eligibleStoryIds = new Set(["S1"]);
    const result = getEligibleEpics(epics, eligibleStoryIds, stories, statuses);
    expect(result.map((e) => e.id)).toContain("E1");
  });

  it("excludes epic when some stories are not eligible and not archived", () => {
    const stories = [
      makeStory({ id: "S1", epic: "E1", sprint: "sprint-1", status: "done" }),
      makeStory({ id: "S2", epic: "E1", sprint: "sprint-5", status: "todo" }),
    ];
    const epics = [makeEpic({ id: "E1", status: "done" })];
    const eligibleStoryIds = new Set(["S1"]);
    const result = getEligibleEpics(epics, eligibleStoryIds, stories, statuses);
    expect(result).toHaveLength(0);
  });

  it("excludes already-archived epics", () => {
    const stories = [makeStory({ id: "S1", epic: "E1", sprint: "sprint-1", status: "done" })];
    const epics = [makeEpic({ id: "E1", isArchived: true, status: "done" })];
    const eligibleStoryIds = new Set(["S1"]);
    const result = getEligibleEpics(epics, eligibleStoryIds, stories, statuses);
    expect(result).toHaveLength(0);
  });

  it("excludes orphan epic without canArchive status", () => {
    const epics = [makeEpic({ id: "E1", status: "todo" })];
    const result = getEligibleEpics(epics, new Set(), [], statuses);
    expect(result).toHaveLength(0);
  });

  it("includes orphan epic with canArchive status", () => {
    const epics = [makeEpic({ id: "E1", status: "done" })];
    const result = getEligibleEpics(epics, new Set(), [], statuses);
    expect(result.map((e) => e.id)).toContain("E1");
  });

  it("handles multiple epics independently", () => {
    const stories = [
      makeStory({ id: "S1", epic: "E1", sprint: "sprint-1", status: "done" }),
      makeStory({ id: "S2", epic: "E2", sprint: "sprint-5", status: "todo" }),
    ];
    const epics = [makeEpic({ id: "E1", status: "done" }), makeEpic({ id: "E2", status: "done" })];
    const eligibleStoryIds = new Set(["S1"]);
    const result = getEligibleEpics(epics, eligibleStoryIds, stories, statuses);
    expect(result.map((e) => e.id)).toEqual(["E1"]);
  });

  it("excludes epic without canArchive status even when all children are eligible", () => {
    const stories = [makeStory({ id: "S1", epic: "E1", sprint: "sprint-1", status: "done" })];
    const epics = [makeEpic({ id: "E1", status: "in_progress" })];
    const eligibleStoryIds = new Set(["S1"]);
    const result = getEligibleEpics(epics, eligibleStoryIds, stories, statuses);
    expect(result).toHaveLength(0);
  });
});

describe("getEligibleThemes", () => {
  it("includes theme when ALL its epics are eligible or already archived and theme has canArchive status", () => {
    const epics = [makeEpic({ id: "E1", theme: "T1" }), makeEpic({ id: "E2", theme: "T1", isArchived: true })];
    const themes = [makeTheme({ id: "T1", status: "done" })];
    const eligibleEpicIds = new Set(["E1"]);
    const result = getEligibleThemes(themes, eligibleEpicIds, epics, statuses);
    expect(result.map((t) => t.id)).toContain("T1");
  });

  it("excludes theme when some epics are not eligible and not archived", () => {
    const epics = [makeEpic({ id: "E1", theme: "T1" }), makeEpic({ id: "E2", theme: "T1" })];
    const themes = [makeTheme({ id: "T1", status: "done" })];
    const eligibleEpicIds = new Set(["E1"]);
    const result = getEligibleThemes(themes, eligibleEpicIds, epics, statuses);
    expect(result).toHaveLength(0);
  });

  it("excludes already-archived themes", () => {
    const epics = [makeEpic({ id: "E1", theme: "T1" })];
    const themes = [makeTheme({ id: "T1", isArchived: true, status: "done" })];
    const eligibleEpicIds = new Set(["E1"]);
    const result = getEligibleThemes(themes, eligibleEpicIds, epics, statuses);
    expect(result).toHaveLength(0);
  });

  it("excludes orphan theme without canArchive status", () => {
    const themes = [makeTheme({ id: "T1", status: "todo" })];
    const result = getEligibleThemes(themes, new Set(), [], statuses);
    expect(result).toHaveLength(0);
  });

  it("includes orphan theme with canArchive status", () => {
    const themes = [makeTheme({ id: "T1", status: "done" })];
    const result = getEligibleThemes(themes, new Set(), [], statuses);
    expect(result.map((t) => t.id)).toContain("T1");
  });

  it("excludes theme without canArchive status even when all children are eligible", () => {
    const epics = [makeEpic({ id: "E1", theme: "T1" })];
    const themes = [makeTheme({ id: "T1", status: "in_progress" })];
    const eligibleEpicIds = new Set(["E1"]);
    const result = getEligibleThemes(themes, eligibleEpicIds, epics, statuses);
    expect(result).toHaveLength(0);
  });
});

describe("buildArchivePlan", () => {
  it("returns summary with counts of stories, epics, and themes", () => {
    const stories = [makeStory({ id: "S1" }), makeStory({ id: "S2" })];
    const epics = [makeEpic({ id: "E1" })];
    const themes = [makeTheme({ id: "T1" })];
    const plan = buildArchivePlan(stories, epics, themes);
    expect(plan.stories).toEqual(stories);
    expect(plan.epics).toEqual(epics);
    expect(plan.themes).toEqual(themes);
    expect(plan.storyCount).toBe(2);
    expect(plan.epicCount).toBe(1);
    expect(plan.themeCount).toBe(1);
  });

  it("handles empty arrays", () => {
    const plan = buildArchivePlan([], [], []);
    expect(plan.storyCount).toBe(0);
    expect(plan.epicCount).toBe(0);
    expect(plan.themeCount).toBe(0);
  });
});

// ─── C2: Path Computation ──────────────────────────────────────────────────

describe("computeArchiveDestination", () => {
  it("inserts archive segment between .devstories and stories/ (forward slash)", () => {
    expect(computeArchiveDestination("/project/.devstories/stories/DS-00001-foo.md", "archive")).toBe(
      "/project/.devstories/archive/stories/DS-00001-foo.md",
    );
  });

  it("inserts archive segment between .devstories and epics/ (forward slash)", () => {
    expect(computeArchiveDestination("/project/.devstories/epics/EPIC-0001-bar.md", "archive")).toBe(
      "/project/.devstories/archive/epics/EPIC-0001-bar.md",
    );
  });

  it("inserts archive segment between .devstories and themes/ (forward slash)", () => {
    expect(computeArchiveDestination("/project/.devstories/themes/THEME-001-baz.md", "archive")).toBe(
      "/project/.devstories/archive/themes/THEME-001-baz.md",
    );
  });

  it("handles Windows backslash paths (normalizes to forward slashes)", () => {
    expect(computeArchiveDestination("C:\\project\\.devstories\\stories\\DS-00001-foo.md", "archive")).toBe(
      "C:/project/.devstories/archive/stories/DS-00001-foo.md",
    );
  });

  it("handles mixed separators (normalizes to forward slashes)", () => {
    expect(computeArchiveDestination("C:\\project\\.devstories/stories/DS-00001-foo.md", "archive")).toBe(
      "C:/project/.devstories/archive/stories/DS-00001-foo.md",
    );
  });

  it("handles custom archive segment", () => {
    expect(computeArchiveDestination("/project/.devstories/stories/DS-00001.md", "soft-archive")).toBe(
      "/project/.devstories/soft-archive/stories/DS-00001.md",
    );
  });
});

describe("computeStorydocsArchiveDestination", () => {
  it("inserts archive segment after storydocs root", () => {
    expect(computeStorydocsArchiveDestination("/project/docs/storydocs/stories/DS-00001", "/project/docs/storydocs", "archive")).toBe(
      "/project/docs/storydocs/archive/stories/DS-00001",
    );
  });

  it("handles Windows paths (normalizes to forward slashes)", () => {
    expect(
      computeStorydocsArchiveDestination("C:\\project\\docs\\storydocs\\stories\\DS-00001", "C:\\project\\docs\\storydocs", "archive"),
    ).toBe("C:/project/docs/storydocs/archive/stories/DS-00001");
  });

  it("handles mixed separators — the original bug scenario", () => {
    // storydocsRoot from .fsPath has backslashes, sourcePath built with forward slashes
    expect(
      computeStorydocsArchiveDestination("C:/project/docs/storydocs/stories/DS-00001", "C:\\project\\docs\\storydocs", "archive"),
    ).toBe("C:/project/docs/storydocs/archive/stories/DS-00001");
  });

  it("handles custom archive segment", () => {
    expect(computeStorydocsArchiveDestination("/project/docs/storydocs/epics/EPIC-0001", "/project/docs/storydocs", "soft-archive")).toBe(
      "/project/docs/storydocs/soft-archive/epics/EPIC-0001",
    );
  });

  it("returns source unchanged when root does not match", () => {
    expect(computeStorydocsArchiveDestination("/other/path/stories/S1", "/project/docs/storydocs", "archive")).toBe(
      "/other/path/stories/S1",
    );
  });
});

describe("computeLiveDestination", () => {
  it("strips archive segment from .devstories path (forward slash)", () => {
    expect(computeLiveDestination("/project/.devstories/archive/stories/DS-00001-foo.md", "archive")).toBe(
      "/project/.devstories/stories/DS-00001-foo.md",
    );
  });

  it("strips archive segment from .devstories path (backslash → normalized to forward slash)", () => {
    expect(computeLiveDestination("C:\\project\\.devstories\\archive\\stories\\DS-00001-foo.md", "archive")).toBe(
      "C:/project/.devstories/stories/DS-00001-foo.md",
    );
  });

  it("strips archive segment from storydocs path", () => {
    expect(computeLiveDestination("/project/docs/storydocs/archive/stories/DS-00001", "archive")).toBe(
      "/project/docs/storydocs/stories/DS-00001",
    );
  });

  it("handles custom archive segment", () => {
    expect(computeLiveDestination("/project/.devstories/soft-archive/epics/EPIC-0001.md", "soft-archive")).toBe(
      "/project/.devstories/epics/EPIC-0001.md",
    );
  });

  it("returns path unchanged if archive segment not found", () => {
    const path = "/project/.devstories/stories/DS-00001.md";
    expect(computeLiveDestination(path, "archive")).toBe(path);
  });
});

// ─── C3: Restore Eligibility Logic ─────────────────────────────────────────

describe("getRestorableStories", () => {
  it("includes archived stories in selected sprint and newer", () => {
    const stories = [
      makeStory({ id: "S1", sprint: "sprint-1", status: "done", isArchived: true }),
      makeStory({ id: "S2", sprint: "sprint-2", status: "done", isArchived: true }),
      makeStory({ id: "S3", sprint: "sprint-3", status: "done", isArchived: true }),
    ];
    // cutoffIndex 1 = sprint-2: restore sprint-2 and newer (sprint-2, sprint-3)
    const result = getRestorableStories(stories, sprintSequence, 1);
    const ids = result.map((s) => s.id);
    expect(ids).not.toContain("S1");
    expect(ids).toContain("S2");
    expect(ids).toContain("S3");
  });

  it("includes story at exact cutoff index", () => {
    const stories = [makeStory({ id: "S1", sprint: "sprint-2", status: "done", isArchived: true })];
    const result = getRestorableStories(stories, sprintSequence, 1);
    expect(result.map((s) => s.id)).toContain("S1");
  });

  it("excludes stories in sprints older than cutoff", () => {
    const stories = [makeStory({ id: "S1", sprint: "sprint-1", status: "done", isArchived: true })];
    const result = getRestorableStories(stories, sprintSequence, 2);
    expect(result).toHaveLength(0);
  });

  it("excludes non-archived stories", () => {
    const stories = [makeStory({ id: "S1", sprint: "sprint-3", status: "done", isArchived: false })];
    const result = getRestorableStories(stories, sprintSequence, 0);
    expect(result).toHaveLength(0);
  });

  it("excludes stories with unknown sprint (not in sequence)", () => {
    const stories = [makeStory({ id: "S1", sprint: "unknown-sprint", status: "done", isArchived: true })];
    const result = getRestorableStories(stories, sprintSequence, 0);
    expect(result).toHaveLength(0);
  });

  it("includes no-sprint archived stories when effective date >= cutoff start date", () => {
    const stories = [
      makeStory({
        id: "S1",
        sprint: undefined,
        status: "done",
        isArchived: true,
        completedOn: new Date("2026-01-20"),
      }),
    ];
    // cutoff sprint-2 starts at day 14 (index 1 * 14 = 14 days after 2026-01-01 = 2026-01-15)
    const result = getRestorableStories(stories, sprintSequence, 1, {
      firstSprintStartDate: "2026-01-01",
      sprintLength: 14,
    });
    expect(result.map((s) => s.id)).toContain("S1");
  });

  it("excludes no-sprint archived stories when effective date < cutoff start date", () => {
    const stories = [
      makeStory({
        id: "S1",
        sprint: undefined,
        status: "done",
        isArchived: true,
        completedOn: new Date("2026-01-10"),
      }),
    ];
    // cutoff sprint-2 starts at 2026-01-15 — completedOn is before that
    const result = getRestorableStories(stories, sprintSequence, 1, {
      firstSprintStartDate: "2026-01-01",
      sprintLength: 14,
    });
    expect(result).toHaveLength(0);
  });

  it("includes no-sprint archived stories using updated date when completedOn missing", () => {
    const stories = [
      makeStory({
        id: "S1",
        sprint: undefined,
        status: "done",
        isArchived: true,
        updated: new Date("2026-01-20"),
      }),
    ];
    const result = getRestorableStories(stories, sprintSequence, 1, {
      firstSprintStartDate: "2026-01-01",
      sprintLength: 14,
    });
    expect(result.map((s) => s.id)).toContain("S1");
  });

  it("excludes no-sprint archived stories without completedOn or updated even with sprintDateInfo", () => {
    const stories = [
      makeStory({
        id: "S1",
        sprint: undefined,
        status: "done",
        isArchived: true,
      }),
    ];
    const result = getRestorableStories(stories, sprintSequence, 0, {
      firstSprintStartDate: "2026-01-01",
      sprintLength: 14,
    });
    expect(result).toHaveLength(0);
  });

  it("excludes no-sprint archived stories when no sprintDateInfo provided", () => {
    const stories = [
      makeStory({
        id: "S1",
        sprint: undefined,
        status: "done",
        isArchived: true,
        completedOn: new Date("2026-01-10"),
      }),
    ];
    const result = getRestorableStories(stories, sprintSequence, 0);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no stories match", () => {
    const stories = [makeStory({ id: "S1", sprint: "sprint-1", status: "done", isArchived: true })];
    // cutoff at last sprint — S1 is older
    const result = getRestorableStories(stories, sprintSequence, 4);
    expect(result).toHaveLength(0);
  });

  it("does not check status — restores regardless of current status", () => {
    const stories = [makeStory({ id: "S1", sprint: "sprint-2", status: "todo", isArchived: true })];
    const result = getRestorableStories(stories, sprintSequence, 1);
    expect(result.map((s) => s.id)).toContain("S1");
  });
});

describe("getRestorableEpics", () => {
  it("includes epic when ALL children are being restored or already live", () => {
    const stories = [
      makeStory({ id: "S1", epic: "E1", sprint: "sprint-2", status: "done", isArchived: true }),
      makeStory({ id: "S2", epic: "E1", sprint: "sprint-1", status: "done", isArchived: false }),
    ];
    const epics = [makeEpic({ id: "E1", status: "done", isArchived: true })];
    const restoreStoryIds = new Set(["S1"]);
    const result = getRestorableEpics(epics, restoreStoryIds, stories);
    expect(result.map((e) => e.id)).toContain("E1");
  });

  it("excludes epic when some children remain archived and not in restore set", () => {
    const stories = [
      makeStory({ id: "S1", epic: "E1", sprint: "sprint-2", status: "done", isArchived: true }),
      makeStory({ id: "S2", epic: "E1", sprint: "sprint-1", status: "done", isArchived: true }),
    ];
    const epics = [makeEpic({ id: "E1", status: "done", isArchived: true })];
    // Only S1 is being restored, S2 remains archived
    const restoreStoryIds = new Set(["S1"]);
    const result = getRestorableEpics(epics, restoreStoryIds, stories);
    expect(result).toHaveLength(0);
  });

  it("excludes non-archived epics", () => {
    const stories = [makeStory({ id: "S1", epic: "E1", sprint: "sprint-2", status: "done", isArchived: true })];
    const epics = [makeEpic({ id: "E1", status: "done", isArchived: false })];
    const result = getRestorableEpics(epics, new Set(["S1"]), stories);
    expect(result).toHaveLength(0);
  });

  it("includes orphan epic (no children)", () => {
    const epics = [makeEpic({ id: "E1", status: "done", isArchived: true })];
    const result = getRestorableEpics(epics, new Set(), []);
    expect(result.map((e) => e.id)).toContain("E1");
  });

  it("does not check status — restores regardless of current status", () => {
    const epics = [makeEpic({ id: "E1", status: "todo", isArchived: true })];
    const result = getRestorableEpics(epics, new Set(), []);
    expect(result.map((e) => e.id)).toContain("E1");
  });

  it("handles multiple epics independently", () => {
    const stories = [makeStory({ id: "S1", epic: "E1", isArchived: true }), makeStory({ id: "S2", epic: "E2", isArchived: true })];
    const epics = [makeEpic({ id: "E1", isArchived: true }), makeEpic({ id: "E2", isArchived: true })];
    // Only S1 being restored
    const restoreStoryIds = new Set(["S1"]);
    const result = getRestorableEpics(epics, restoreStoryIds, stories);
    expect(result.map((e) => e.id)).toEqual(["E1"]);
  });
});

describe("getRestorableThemes", () => {
  it("includes theme when ALL its epics are being restored or already live", () => {
    const epics = [makeEpic({ id: "E1", theme: "T1", isArchived: true }), makeEpic({ id: "E2", theme: "T1", isArchived: false })];
    const themes = [makeTheme({ id: "T1", status: "done", isArchived: true })];
    const restoreEpicIds = new Set(["E1"]);
    const result = getRestorableThemes(themes, restoreEpicIds, epics);
    expect(result.map((t) => t.id)).toContain("T1");
  });

  it("excludes theme when some epics remain archived and not in restore set", () => {
    const epics = [makeEpic({ id: "E1", theme: "T1", isArchived: true }), makeEpic({ id: "E2", theme: "T1", isArchived: true })];
    const themes = [makeTheme({ id: "T1", status: "done", isArchived: true })];
    const restoreEpicIds = new Set(["E1"]);
    const result = getRestorableThemes(themes, restoreEpicIds, epics);
    expect(result).toHaveLength(0);
  });

  it("excludes non-archived themes", () => {
    const epics = [makeEpic({ id: "E1", theme: "T1", isArchived: true })];
    const themes = [makeTheme({ id: "T1", isArchived: false })];
    const result = getRestorableThemes(themes, new Set(["E1"]), epics);
    expect(result).toHaveLength(0);
  });

  it("includes orphan theme (no children)", () => {
    const themes = [makeTheme({ id: "T1", status: "done", isArchived: true })];
    const result = getRestorableThemes(themes, new Set(), []);
    expect(result.map((t) => t.id)).toContain("T1");
  });

  it("does not check status — restores regardless of current status", () => {
    const themes = [makeTheme({ id: "T1", status: "todo", isArchived: true })];
    const result = getRestorableThemes(themes, new Set(), []);
    expect(result.map((t) => t.id)).toContain("T1");
  });
});
