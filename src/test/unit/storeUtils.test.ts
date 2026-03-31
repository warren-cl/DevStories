import { describe, it, expect } from "vitest";
import { isArchivedPath } from "../../core/storeUtils";

describe("isArchivedPath", () => {
  describe("with default archive segment", () => {
    const segment = "archive";

    it("returns true for story in archive directory (forward slash)", () => {
      expect(isArchivedPath("/project/.devstories/archive/stories/DS-00001-foo.md", segment)).toBe(true);
    });

    it("returns true for epic in archive directory (forward slash)", () => {
      expect(isArchivedPath("/project/.devstories/archive/epics/EPIC-0001-bar.md", segment)).toBe(true);
    });

    it("returns true for theme in archive directory (forward slash)", () => {
      expect(isArchivedPath("/project/.devstories/archive/themes/THEME-001-baz.md", segment)).toBe(true);
    });

    it("returns true for task in archive directory (forward slash)", () => {
      expect(isArchivedPath("/project/docs/storydocs/archive/stories/DS-00001/tasks/TASK-001-impl.md", segment)).toBe(true);
    });

    it("returns true for archive path with backslashes (Windows)", () => {
      expect(isArchivedPath("C:\\project\\.devstories\\archive\\stories\\DS-00001-foo.md", segment)).toBe(true);
    });

    it("returns true for archive task path with backslashes (Windows)", () => {
      expect(isArchivedPath("C:\\project\\docs\\storydocs\\archive\\stories\\DS-00001\\tasks\\TASK-001.md", segment)).toBe(true);
    });

    it("returns false for live story path", () => {
      expect(isArchivedPath("/project/.devstories/stories/DS-00001-foo.md", segment)).toBe(false);
    });

    it("returns false for live epic path", () => {
      expect(isArchivedPath("/project/.devstories/epics/EPIC-0001-bar.md", segment)).toBe(false);
    });

    it("returns false for live task path", () => {
      expect(isArchivedPath("/project/docs/storydocs/stories/DS-00001/tasks/TASK-001.md", segment)).toBe(false);
    });

    it("returns false when 'archive' appears as part of a folder name", () => {
      // e.g. a folder named "archived-projects" should NOT trigger isArchived
      expect(isArchivedPath("/project/.devstories/archived-projects/stories/DS-00001.md", segment)).toBe(false);
    });

    it("returns false when 'archive' appears as part of a filename", () => {
      expect(isArchivedPath("/project/.devstories/stories/DS-00001-archive-feature.md", segment)).toBe(false);
    });

    it("returns false when 'archive' is a prefix of folder name", () => {
      expect(isArchivedPath("/project/.devstories/archives/stories/DS-00001.md", segment)).toBe(false);
    });
  });

  describe("with custom archive segment", () => {
    it("matches custom segment name", () => {
      expect(isArchivedPath("/project/.devstories/soft-archive/stories/DS-00001.md", "soft-archive")).toBe(true);
    });

    it("does not match default when custom is configured", () => {
      expect(isArchivedPath("/project/.devstories/archive/stories/DS-00001.md", "soft-archive")).toBe(false);
    });

    it("handles custom segment with backslashes", () => {
      expect(isArchivedPath("C:\\project\\.devstories\\soft-archive\\stories\\DS-00001.md", "soft-archive")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles empty path gracefully", () => {
      expect(isArchivedPath("", "archive")).toBe(false);
    });

    it("handles path with mixed separators", () => {
      expect(isArchivedPath("C:\\project/.devstories\\archive/stories/DS-00001.md", "archive")).toBe(true);
    });
  });
});
