/**
 * Unit tests for changeStatus utilities
 * TDD: Write tests first, then implement
 */

import { describe, it, expect } from "vitest";
import { localToday } from "../../utils/dateUtils";
import {
  updateStoryStatus,
  updateEpicStatus,
  updateStoryPriority,
  getNextWorkflowStatus,
  parseStatusesFromConfig,
} from "../../commands/changeStatusUtils";

describe("changeStatusUtils", () => {
  describe("parseStatusesFromConfig", () => {
    it("should parse statuses from config.json content", () => {
      const configContent = JSON.stringify({
        statuses: [
          { id: "todo", label: "To Do" },
          { id: "in_progress", label: "In Progress" },
          { id: "review", label: "Review" },
          { id: "done", label: "Done" },
        ],
      });
      const statuses = parseStatusesFromConfig(configContent);
      expect(statuses).toEqual(["todo", "in_progress", "review", "done"]);
    });

    it("should return default statuses if config is empty", () => {
      const statuses = parseStatusesFromConfig("");
      expect(statuses).toEqual(["todo", "in_progress", "review", "done"]);
    });

    it("should return default statuses if statuses section is missing", () => {
      const configContent = JSON.stringify({
        idPrefix: {
          story: "DS",
          epic: "EPIC",
        },
      });
      const statuses = parseStatusesFromConfig(configContent);
      expect(statuses).toEqual(["todo", "in_progress", "review", "done"]);
    });

    it("should return default statuses for invalid JSON", () => {
      const statuses = parseStatusesFromConfig("{ invalid json");
      expect(statuses).toEqual(["todo", "in_progress", "review", "done"]);
    });
  });

  describe("getNextWorkflowStatus", () => {
    const statuses = ["todo", "in_progress", "review", "done"];

    it("should return in_progress for todo", () => {
      expect(getNextWorkflowStatus("todo", statuses)).toBe("in_progress");
    });

    it("should return review for in_progress", () => {
      expect(getNextWorkflowStatus("in_progress", statuses)).toBe("review");
    });

    it("should return done for review", () => {
      expect(getNextWorkflowStatus("review", statuses)).toBe("done");
    });

    it("should return todo for done (cycle back)", () => {
      expect(getNextWorkflowStatus("done", statuses)).toBe("todo");
    });

    it("should handle unknown status by returning first status", () => {
      expect(getNextWorkflowStatus("unknown", statuses)).toBe("todo");
    });

    it("should work with custom status list", () => {
      const customStatuses = ["backlog", "active", "complete"];
      expect(getNextWorkflowStatus("backlog", customStatuses)).toBe("active");
      expect(getNextWorkflowStatus("active", customStatuses)).toBe("complete");
      expect(getNextWorkflowStatus("complete", customStatuses)).toBe("backlog");
    });
  });

  describe("updateStoryStatus", () => {
    const storyContent = `---
id: DS-001
title: "Test Story"
type: feature
epic: EPIC-001
status: todo
sprint: sprint-1
size: M
assignee: ""
dependencies:
created: 2025-01-15
updated: 2025-01-15
---

# Test Story

Description here.
`;

    it("should update status in frontmatter", () => {
      const result = updateStoryStatus(storyContent, "in_progress");
      expect(result).toContain("status: in_progress");
      expect(result).not.toContain("status: todo");
    });

    it("should update the updated timestamp", () => {
      const result = updateStoryStatus(storyContent, "in_progress");
      const today = localToday();
      // gray-matter may quote the date
      expect(result).toMatch(new RegExp(`updated: ['"]?${today}['"]?`));
    });

    it("should preserve all other frontmatter fields", () => {
      const result = updateStoryStatus(storyContent, "done");
      expect(result).toContain("id: DS-001");
      expect(result).toMatch(/title:.*Test Story/); // gray-matter may remove quotes
      expect(result).toContain("type: feature");
      expect(result).toContain("epic: EPIC-001");
      expect(result).toContain("sprint: sprint-1");
      expect(result).toContain("size: M");
    });

    it("should preserve markdown content", () => {
      const result = updateStoryStatus(storyContent, "review");
      expect(result).toContain("# Test Story");
      expect(result).toContain("Description here.");
    });

    it("should handle stories with dependencies", () => {
      const storyWithDeps = `---
id: DS-002
title: "Story with deps"
type: task
epic: EPIC-001
status: todo
sprint: sprint-1
size: S
assignee: ""
dependencies:
  - DS-001
  - DS-003
created: 2025-01-15
updated: 2025-01-15
---

# Story with deps
`;
      const result = updateStoryStatus(storyWithDeps, "in_progress");
      expect(result).toContain("status: in_progress");
      expect(result).toContain("- DS-001");
      expect(result).toContain("- DS-003");
    });

    it("should handle quotes in title", () => {
      const storyWithQuotes = `---
id: DS-003
title: "Story with \\"quotes\\""
type: bug
epic: EPIC-001
status: todo
sprint: sprint-1
size: S
assignee: ""
dependencies:
created: 2025-01-15
updated: 2025-01-15
---

# Story
`;
      const result = updateStoryStatus(storyWithQuotes, "done");
      expect(result).toContain("status: done");
      // Title should be preserved
      expect(result).toContain("title:");
    });

    it("should preserve priority field when updating status", () => {
      const storyWithPriority = `---
id: DS-004
title: "Priority Story"
type: feature
epic: EPIC-001
status: todo
sprint: sprint-1
size: M
priority: 100
assignee: ""
dependencies:
created: 2025-01-15
updated: 2025-01-15
---

# Priority Story
`;
      const result = updateStoryStatus(storyWithPriority, "in_progress");
      expect(result).toContain("status: in_progress");
      expect(result).toContain("priority: 100");
    });

    // --- completed_on lifecycle tests ---

    it("should set completed_on when status changes to completion status", () => {
      const statuses = [
        { id: "todo", label: "To Do" },
        { id: "done", label: "Done", isCompletion: true },
      ];
      const result = updateStoryStatus(storyContent, "done", statuses);
      const today = localToday();
      expect(result).toMatch(new RegExp(`completed_on: ['"]?${today}['"]?`));
    });

    it("should not set completed_on when status is not completion", () => {
      const statuses = [
        { id: "todo", label: "To Do" },
        { id: "in_progress", label: "In Progress" },
        { id: "done", label: "Done", isCompletion: true },
      ];
      const result = updateStoryStatus(storyContent, "in_progress", statuses);
      expect(result).not.toContain("completed_on");
    });

    it("should remove completed_on when moving away from completion status", () => {
      const storyWithDateDone = `---
id: DS-005
title: "Done Story"
type: feature
epic: EPIC-001
status: done
sprint: sprint-1
size: M
priority: 500
assignee: ""
dependencies:
created: 2025-01-15
updated: 2025-01-20
completed_on: 2025-01-20
---

# Done Story
`;
      const statuses = [
        { id: "todo", label: "To Do" },
        { id: "in_progress", label: "In Progress" },
        { id: "done", label: "Done", isCompletion: true },
      ];
      const result = updateStoryStatus(storyWithDateDone, "in_progress", statuses);
      expect(result).toContain("status: in_progress");
      expect(result).not.toContain("completed_on");
    });

    it("should not set completed_on when statuses are not provided (backward compat)", () => {
      const result = updateStoryStatus(storyContent, "done");
      expect(result).not.toContain("completed_on");
    });

    it("should use fallback completion for last status when no isCompletion flag", () => {
      const statuses = [
        { id: "todo", label: "To Do" },
        { id: "in_progress", label: "In Progress" },
        { id: "done", label: "Done" }, // no isCompletion flag
      ];
      // Last status in array is treated as completion
      const result = updateStoryStatus(storyContent, "done", statuses);
      const today = localToday();
      expect(result).toMatch(new RegExp(`completed_on: ['"]?${today}['"]?`));
    });
  });

  describe("updateEpicStatus", () => {
    const epicContent = `---
id: EPIC-001
title: "Test Epic"
status: todo
sprint: sprint-1
created: 2025-01-15
updated: 2025-01-15
---

# Test Epic

Description of the epic.

## Stories
- [[DS-001]] Test Story
`;

    it("should update status in frontmatter", () => {
      const result = updateEpicStatus(epicContent, "in_progress");
      expect(result).toContain("status: in_progress");
      expect(result).not.toContain("status: todo");
    });

    it("should update the updated timestamp", () => {
      const result = updateEpicStatus(epicContent, "in_progress");
      const today = localToday();
      // gray-matter may quote the date
      expect(result).toMatch(new RegExp(`updated: ['"]?${today}['"]?`));
    });

    it("should preserve all other frontmatter fields", () => {
      const result = updateEpicStatus(epicContent, "done");
      expect(result).toContain("id: EPIC-001");
      expect(result).toMatch(/title:.*Test Epic/); // gray-matter may remove quotes
      expect(result).toContain("sprint: sprint-1");
    });

    it("should preserve markdown content including Stories section", () => {
      const result = updateEpicStatus(epicContent, "review");
      expect(result).toContain("# Test Epic");
      expect(result).toContain("Description of the epic.");
      expect(result).toContain("## Stories");
      expect(result).toContain("[[DS-001]]");
    });
  });

  // === DS-083: Priority Update Tests ===

  describe("updateStoryPriority", () => {
    const storyContent = `---
id: DS-001
title: "Test Story"
type: feature
epic: EPIC-001
status: todo
sprint: sprint-1
size: M
priority: 500
assignee: ""
dependencies:
created: 2025-01-15
updated: 2025-01-15
---

# Test Story

Description here.
`;

    it("should update priority in frontmatter", () => {
      const result = updateStoryPriority(storyContent, 250);
      expect(result).toContain("priority: 250");
      expect(result).not.toContain("priority: 500");
    });

    it("should update the updated timestamp", () => {
      const result = updateStoryPriority(storyContent, 100);
      const today = localToday();
      expect(result).toMatch(new RegExp(`updated: ['"]?${today}['"]?`));
    });

    it("should preserve all other frontmatter fields", () => {
      const result = updateStoryPriority(storyContent, 750);
      expect(result).toContain("id: DS-001");
      expect(result).toContain("status: todo");
      expect(result).toContain("sprint: sprint-1");
      expect(result).toContain("size: M");
    });

    it("should preserve markdown content", () => {
      const result = updateStoryPriority(storyContent, 1);
      expect(result).toContain("# Test Story");
      expect(result).toContain("Description here.");
    });

    it("should handle priority value of 1 (minimum)", () => {
      const result = updateStoryPriority(storyContent, 1);
      expect(result).toContain("priority: 1");
    });
  });
});
