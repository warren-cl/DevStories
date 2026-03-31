import { describe, expect, it } from "vitest";
import { generateConfigJson, detectProjectName, InitConfig } from "../../commands/initUtils";

describe("Init Command", () => {
  describe("generateConfigJson", () => {
    it("should generate valid config json with defaults", () => {
      const config: InitConfig = {
        projectName: "my-project",
        epicPrefix: "EPIC",
        storyPrefix: "DS",
        themePrefix: "THEME",
        taskPrefix: "TASK",
        sprint: "sprint-1",
      };

      const json = generateConfigJson(config, "3.2.2");
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe("3.2.2");
      expect(parsed.project).toBe("my-project");
      expect(parsed.idPrefix.epic).toBe("EPIC");
      expect(parsed.idPrefix.story).toBe("DS");
      expect(parsed.idPrefix.task).toBe("TASK");
      expect(parsed.sprints.current).toBe("sprint-1");
      expect(parsed.sprints.length).toBe(7);
      expect(parsed.sprints.firstSprintStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(parsed.statuses).toHaveLength(4);
      expect(parsed.statuses[0].id).toBe("todo");
      expect(parsed.statuses[1].id).toBe("in_progress");
      expect(parsed.statuses[2].id).toBe("review");
      expect(parsed.statuses[3].id).toBe("done");
      expect(parsed.sizes).toEqual(["XXS", "XS", "S", "M", "L", "XL", "XXL"]);
      expect(parsed.storypoints).toEqual([1, 2, 4, 8, 16, 32, 64]);
      expect(parsed.autoFilterCurrentSprint).toBe(true);
      expect(parsed.quickCapture).toEqual({ defaultToCurrentSprint: false });
      expect(parsed.storydocs).toEqual({ enabled: false, root: "docs/storydocs" });
      expect(parsed.taskTypes).toBeDefined();
      expect(Object.keys(parsed.taskTypes)).toContain("code");
      expect(Object.keys(parsed.taskTypes)).toContain("document");
      expect(parsed.templateRoot).toBe(".devstories/templates");
      expect(parsed.archive).toEqual({
        soft: { devstories: "archive", storydocs: "archive" },
        hard: { devstories: "glacier", storydocs: "glacier" },
      });
    });

    it("should handle custom prefixes", () => {
      const config: InitConfig = {
        projectName: "acme-app",
        epicPrefix: "EP",
        storyPrefix: "US",
        themePrefix: "THEME",
        taskPrefix: "TSK",
        sprint: "iteration-1",
      };

      const json = generateConfigJson(config, "3.2.2");
      const parsed = JSON.parse(json);

      expect(parsed.idPrefix.epic).toBe("EP");
      expect(parsed.idPrefix.story).toBe("US");
      expect(parsed.idPrefix.task).toBe("TSK");
      expect(parsed.sprints.current).toBe("iteration-1");
    });

    it("should handle special characters in project name", () => {
      const config: InitConfig = {
        projectName: 'my "quoted" project',
        epicPrefix: "EPIC",
        storyPrefix: "DS",
        themePrefix: "THEME",
        taskPrefix: "TASK",
        sprint: "sprint-1",
      };

      const json = generateConfigJson(config, "3.2.2");
      const parsed = JSON.parse(json);

      expect(parsed.project).toBe('my "quoted" project');
    });

    it("should include sprint in sequence", () => {
      const config: InitConfig = {
        projectName: "my-project",
        epicPrefix: "EPIC",
        storyPrefix: "DS",
        themePrefix: "THEME",
        taskPrefix: "TASK",
        sprint: "sprint-1",
      };

      const json = generateConfigJson(config, "3.2.2");
      const parsed = JSON.parse(json);

      expect(parsed.sprints.sequence).toContain("sprint-1");
      expect(parsed.sprints.sequence).toContain("backlog");
    });
  });

  describe("detectProjectName", () => {
    it("should detect from package.json", () => {
      const files = new Map([["package.json", '{"name": "my-npm-package"}']]);

      const name = detectProjectName(files);
      expect(name).toBe("my-npm-package");
    });

    it("should detect from Cargo.toml", () => {
      const files = new Map([["Cargo.toml", '[package]\nname = "my-rust-crate"']]);

      const name = detectProjectName(files);
      expect(name).toBe("my-rust-crate");
    });

    it("should detect from pyproject.toml", () => {
      const files = new Map([["pyproject.toml", '[project]\nname = "my-python-pkg"']]);

      const name = detectProjectName(files);
      expect(name).toBe("my-python-pkg");
    });

    it("should detect from go.mod", () => {
      const files = new Map([["go.mod", "module github.com/user/my-go-mod"]]);

      const name = detectProjectName(files);
      expect(name).toBe("my-go-mod");
    });

    it("should prefer package.json when multiple files exist", () => {
      const files = new Map([
        ["package.json", '{"name": "npm-pkg"}'],
        ["Cargo.toml", '[package]\nname = "rust-crate"'],
      ]);

      const name = detectProjectName(files);
      expect(name).toBe("npm-pkg");
    });

    it("should return undefined when no project files found", () => {
      const files = new Map<string, string>();
      const name = detectProjectName(files);
      expect(name).toBeUndefined();
    });

    it("should return undefined for invalid package.json", () => {
      const files = new Map([["package.json", "invalid json"]]);

      const name = detectProjectName(files);
      expect(name).toBeUndefined();
    });
  });
});
