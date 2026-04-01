/**
 * Unit tests for task-related config extensions in configServiceUtils
 */

import { describe, it, expect } from "vitest";
import { parseConfigJsonContent, mergeConfigWithDefaults, DEFAULT_CONFIG, DEFAULT_TASK_TYPES } from "../../core/configServiceUtils";

describe("ConfigServiceUtils — Task config", () => {
  describe("DEFAULT_CONFIG", () => {
    it("has default taskPrefix", () => {
      expect(DEFAULT_CONFIG.taskPrefix).toBe("TASK");
    });

    it("has default taskTypes as Record<string, string>", () => {
      expect(DEFAULT_CONFIG.taskTypes).toEqual(DEFAULT_TASK_TYPES);
    });
  });

  describe("DEFAULT_TASK_TYPES", () => {
    it("includes the 6 default task type keys", () => {
      const keys = Object.keys(DEFAULT_TASK_TYPES);
      expect(keys).toContain("code");
      expect(keys).toContain("document");
      expect(keys).toContain("remediate");
      expect(keys).toContain("investigate");
      expect(keys).toContain("plan");
      expect(keys).toContain("validate");
    });

    it("maps type keys to template filenames", () => {
      expect(DEFAULT_TASK_TYPES.code).toBe("code.template.md");
      expect(DEFAULT_TASK_TYPES.document).toBe("document.template.md");
    });
  });

  describe("parseConfigJsonContent with task fields", () => {
    it("parses idPrefix.task", () => {
      const json = JSON.stringify({
        idPrefix: { task: "TSK" },
      });
      const parsed = parseConfigJsonContent(json);
      expect(parsed.taskPrefix).toBe("TSK");
    });

    it("parses taskTypes as Record", () => {
      const json = JSON.stringify({
        taskTypes: { custom1: "c1.md", custom2: "c2.md" },
      });
      const parsed = parseConfigJsonContent(json);
      expect(parsed.taskTypes).toEqual({ custom1: "c1.md", custom2: "c2.md" });
    });

    it("parses storyTemplateRoot", () => {
      const json = JSON.stringify({
        storyTemplateRoot: "docs/templates",
      });
      const parsed = parseConfigJsonContent(json);
      expect(parsed.storyTemplateRoot).toBe("docs/templates");
    });

    it("parses taskTemplateRoot", () => {
      const json = JSON.stringify({
        taskTemplateRoot: "docs/task-templates",
      });
      const parsed = parseConfigJsonContent(json);
      expect(parsed.taskTemplateRoot).toBe("docs/task-templates");
    });

    it("returns defaults when task fields are missing", () => {
      const parsed = parseConfigJsonContent("{}");
      const merged = mergeConfigWithDefaults(parsed);
      expect(merged.taskPrefix).toBe("TASK");
      expect(merged.taskTypes).toEqual(DEFAULT_TASK_TYPES);
    });
  });

  describe("mergeConfigWithDefaults for task fields", () => {
    it("preserves custom taskPrefix", () => {
      const config = parseConfigJsonContent(JSON.stringify({ idPrefix: { task: "TSK" } }));
      const merged = mergeConfigWithDefaults(config);
      expect(merged.taskPrefix).toBe("TSK");
    });

    it("falls back to default taskPrefix when not specified", () => {
      const config = parseConfigJsonContent("{}");
      const merged = mergeConfigWithDefaults(config);
      expect(merged.taskPrefix).toBe("TASK");
    });

    it("preserves custom taskTypes", () => {
      const config = parseConfigJsonContent(JSON.stringify({ taskTypes: { custom1: "c1.md", custom2: "c2.md" } }));
      const merged = mergeConfigWithDefaults(config);
      expect(merged.taskTypes).toEqual({ custom1: "c1.md", custom2: "c2.md" });
    });
  });
});
