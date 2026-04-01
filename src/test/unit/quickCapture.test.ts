import { describe, it, expect } from "vitest";
import { parseQuickInput, truncateForTitle, cleanSelectionText, INBOX_EPIC_ID, OPEN_STORY_ACTION } from "../../commands/quickCaptureUtils";

describe("quickCaptureUtils", () => {
  const defaultKeys = ["feature", "bug", "task", "chore", "spike"];

  describe("parseQuickInput", () => {
    it("should parse plain title", () => {
      const result = parseQuickInput("Add dark mode toggle", defaultKeys);
      expect(result.title).toBe("Add dark mode toggle");
      expect(result.type).toBe("feature"); // first key in config
      expect(result.notes).toBeUndefined();
    });

    it("should parse bug: prefix", () => {
      const result = parseQuickInput("bug: Login fails on Safari", defaultKeys);
      expect(result.title).toBe("Login fails on Safari");
      expect(result.type).toBe("bug");
    });

    it("should parse feature: prefix", () => {
      const result = parseQuickInput("feature: Export to PDF", defaultKeys);
      expect(result.title).toBe("Export to PDF");
      expect(result.type).toBe("feature");
    });

    it("should parse chore: prefix", () => {
      const result = parseQuickInput("chore: Update dependencies", defaultKeys);
      expect(result.title).toBe("Update dependencies");
      expect(result.type).toBe("chore");
    });

    it("should parse task: prefix", () => {
      const result = parseQuickInput("task: Review PR", defaultKeys);
      expect(result.title).toBe("Review PR");
      expect(result.type).toBe("task");
    });

    it("should be case-insensitive for type prefix", () => {
      const result = parseQuickInput("BUG: Case sensitivity issue", defaultKeys);
      expect(result.title).toBe("Case sensitivity issue");
      expect(result.type).toBe("bug");
    });

    it("should not match unknown prefixes", () => {
      const result = parseQuickInput("feat: Dark mode support", defaultKeys);
      // 'feat' is not an exact config key — treated as title
      expect(result.title).toBe("feat: Dark mode support");
      expect(result.type).toBe("feature"); // default
    });

    it("should parse pipe syntax for notes", () => {
      const result = parseQuickInput("Fix login | users report 500 on submit", defaultKeys);
      expect(result.title).toBe("Fix login");
      expect(result.notes).toBe("users report 500 on submit");
      expect(result.type).toBe("feature"); // first key
    });

    it("should parse type prefix with pipe syntax", () => {
      const result = parseQuickInput("bug: Login 500 error | Users on Safari report 500 when submitting", defaultKeys);
      expect(result.title).toBe("Login 500 error");
      expect(result.type).toBe("bug");
      expect(result.notes).toBe("Users on Safari report 500 when submitting");
    });

    it("should handle multiple pipes (first one splits)", () => {
      const result = parseQuickInput("Task | note 1 | note 2", defaultKeys);
      expect(result.title).toBe("Task");
      expect(result.notes).toBe("note 1 | note 2");
    });

    it("should trim whitespace", () => {
      const result = parseQuickInput("  bug:   Fix issue   |   some notes  ", defaultKeys);
      expect(result.title).toBe("Fix issue");
      expect(result.notes).toBe("some notes");
    });

    it("should handle empty input", () => {
      const result = parseQuickInput("", defaultKeys);
      expect(result.title).toBe("");
      expect(result.type).toBe("feature"); // first key
    });

    it("should default to task when no keys provided", () => {
      const result = parseQuickInput("Something");
      expect(result.type).toBe("task");
    });
  });

  describe("truncateForTitle", () => {
    it("should return short text unchanged", () => {
      const text = "Short title";
      expect(truncateForTitle(text, 100)).toBe("Short title");
    });

    it("should truncate long text with ellipsis", () => {
      const text = "This is a very long title that exceeds the limit";
      const result = truncateForTitle(text, 20);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result.endsWith("...")).toBe(true);
    });

    it("should truncate at word boundary", () => {
      const text = "Word boundary truncation test here";
      const result = truncateForTitle(text, 25);
      expect(result).toBe("Word boundary...");
    });

    it("should handle text equal to limit", () => {
      const text = "Exact limit";
      expect(truncateForTitle(text, 11)).toBe("Exact limit");
    });

    it("should use default limit of 100", () => {
      const text = "A".repeat(150);
      const result = truncateForTitle(text);
      expect(result.length).toBeLessThanOrEqual(100);
    });
  });

  describe("cleanSelectionText", () => {
    it("should remove TODO: prefix", () => {
      expect(cleanSelectionText("TODO: implement feature")).toBe("implement feature");
    });

    it("should remove FIXME: prefix", () => {
      expect(cleanSelectionText("FIXME: handle edge case")).toBe("handle edge case");
    });

    it("should remove // comment prefix", () => {
      expect(cleanSelectionText("// this is a comment")).toBe("this is a comment");
    });

    it("should remove # comment prefix", () => {
      expect(cleanSelectionText("# Python comment")).toBe("Python comment");
    });

    it("should remove multiple prefixes", () => {
      expect(cleanSelectionText("// TODO: fix this")).toBe("fix this");
    });

    it("should be case-insensitive for TODO/FIXME", () => {
      expect(cleanSelectionText("todo: lowercase")).toBe("lowercase");
      expect(cleanSelectionText("fixme: lowercase")).toBe("lowercase");
    });

    it("should trim whitespace", () => {
      expect(cleanSelectionText("   spaced out   ")).toBe("spaced out");
    });

    it("should handle empty string", () => {
      expect(cleanSelectionText("")).toBe("");
    });

    it("should normalize internal whitespace", () => {
      expect(cleanSelectionText("multiple   spaces")).toBe("multiple spaces");
    });

    it("should remove newlines", () => {
      expect(cleanSelectionText("line1\nline2")).toBe("line1 line2");
    });
  });

  describe("INBOX_EPIC_ID", () => {
    it("should be EPIC-INBOX", () => {
      expect(INBOX_EPIC_ID).toBe("EPIC-INBOX");
    });
  });

  describe("OPEN_STORY_ACTION", () => {
    it('should be exported and equal to "Open Story"', () => {
      expect(OPEN_STORY_ACTION).toBe("Open Story");
    });
  });
});
