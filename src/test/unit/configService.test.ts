import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseConfigJsonContent,
  parseTemplateFile,
  mergeConfigWithDefaults,
  validateSprintConfig,
  ConfigData,
  TemplateData,
  DEFAULT_CONFIG,
  debounce,
  getSprintIndex,
  isCompletedStatus,
  isExcludedStatus,
  isCanArchiveStatus,
  StatusDef,
  computeConfigUpgrade,
} from "../../core/configServiceUtils";

describe("ConfigService Utils", () => {
  describe("parseConfigJsonContent", () => {
    it("should parse complete config.json", () => {
      const json = JSON.stringify({
        version: 1,
        project: "Test Project",
        idPrefix: {
          epic: "EPIC",
          story: "STORY",
        },
        statuses: [
          { id: "todo", label: "To Do" },
          { id: "in_progress", label: "In Progress" },
          { id: "done", label: "Done" },
        ],
        sprints: {
          current: "sprint-1",
        },
        sizes: ["XS", "S", "M", "L", "XL"],
      });
      const result = parseConfigJsonContent(json);

      expect(result.epicPrefix).toBe("EPIC");
      expect(result.storyPrefix).toBe("STORY");
      expect(result.currentSprint).toBe("sprint-1");
      expect(result.statuses).toEqual([
        { id: "todo", label: "To Do" },
        { id: "in_progress", label: "In Progress" },
        { id: "done", label: "Done" },
      ]);
      expect(result.sizes).toEqual(["XS", "S", "M", "L", "XL"]);
    });

    it("should return partial result for minimal config", () => {
      const json = JSON.stringify({ version: 1 });
      const result = parseConfigJsonContent(json);

      expect(result.epicPrefix).toBeUndefined();
      expect(result.storyPrefix).toBeUndefined();
      expect(result.statuses).toBeUndefined();
    });

    it("should return empty object for invalid json", () => {
      const result = parseConfigJsonContent("{ invalid json [");
      expect(result).toEqual({});
    });

    it("should return empty object for empty string", () => {
      const result = parseConfigJsonContent("");
      expect(result).toEqual({});
    });

    it("should parse quickCapture.defaultToCurrentSprint when true", () => {
      const json = JSON.stringify({
        version: 1,
        quickCapture: {
          defaultToCurrentSprint: true,
        },
      });
      const result = parseConfigJsonContent(json);
      expect(result.quickCaptureDefaultToCurrentSprint).toBe(true);
    });

    it("should parse quickCapture.defaultToCurrentSprint when false", () => {
      const json = JSON.stringify({
        version: 1,
        quickCapture: {
          defaultToCurrentSprint: false,
        },
      });
      const result = parseConfigJsonContent(json);
      expect(result.quickCaptureDefaultToCurrentSprint).toBe(false);
    });

    it("should default quickCaptureDefaultToCurrentSprint to false when not specified", () => {
      const json = JSON.stringify({ version: 1 });
      const result = parseConfigJsonContent(json);
      const merged = mergeConfigWithDefaults(result);
      expect(merged.quickCaptureDefaultToCurrentSprint).toBe(false);
    });

    it("should parse autoFilterCurrentSprint when true", () => {
      const json = JSON.stringify({
        version: 1,
        autoFilterCurrentSprint: true,
      });
      const result = parseConfigJsonContent(json);
      expect(result.autoFilterCurrentSprint).toBe(true);
    });

    it("should parse autoFilterCurrentSprint when false", () => {
      const json = JSON.stringify({
        version: 1,
        autoFilterCurrentSprint: false,
      });
      const result = parseConfigJsonContent(json);
      expect(result.autoFilterCurrentSprint).toBe(false);
    });

    it("should default autoFilterCurrentSprint to true when not specified (DS-153)", () => {
      const json = JSON.stringify({ version: 1 });
      const result = parseConfigJsonContent(json);
      const merged = mergeConfigWithDefaults(result);
      expect(merged.autoFilterCurrentSprint).toBe(true);
    });

    it("should parse sprint sequence array", () => {
      const json = JSON.stringify({
        version: 1,
        sprints: {
          current: "sprint-2",
          sequence: ["sprint-1", "sprint-2", "sprint-3", "backlog"],
        },
      });
      const result = parseConfigJsonContent(json);

      expect(result.currentSprint).toBe("sprint-2");
      expect(result.sprintSequence).toEqual(["sprint-1", "sprint-2", "sprint-3", "backlog"]);
    });

    it("should handle missing sequence", () => {
      const json = JSON.stringify({
        version: 1,
        sprints: {
          current: "sprint-1",
        },
      });
      const result = parseConfigJsonContent(json);
      const merged = mergeConfigWithDefaults(result);

      expect(merged.currentSprint).toBe("sprint-1");
      expect(merged.sprintSequence).toEqual([]);
    });

    it("should handle empty sequence", () => {
      const json = JSON.stringify({
        version: 1,
        sprints: {
          current: "sprint-1",
          sequence: [],
        },
      });
      const result = parseConfigJsonContent(json);

      expect(result.sprintSequence).toEqual([]);
    });

    it("should preserve isCompletion flag when parsing statuses", () => {
      const json = JSON.stringify({
        version: 1,
        statuses: [
          { id: "todo", label: "To Do" },
          { id: "in_progress", label: "In Progress" },
          { id: "done", label: "Done", isCompletion: true },
          { id: "blocked", label: "Blocked" },
          { id: "cancelled", label: "Cancelled" },
        ],
      });
      const result = parseConfigJsonContent(json);
      expect(result.statuses).toEqual([
        { id: "todo", label: "To Do" },
        { id: "in_progress", label: "In Progress" },
        { id: "done", label: "Done", isCompletion: true },
        { id: "blocked", label: "Blocked" },
        { id: "cancelled", label: "Cancelled" },
      ]);
    });

    it("should preserve canArchive flag when parsing statuses", () => {
      const json = JSON.stringify({
        version: 1,
        statuses: [
          { id: "todo", label: "To Do", canArchive: false },
          { id: "done", label: "Done", isCompletion: true, canArchive: true },
          { id: "cancelled", label: "Cancelled", canArchive: true },
        ],
      });
      const result = parseConfigJsonContent(json);
      expect(result.statuses).toEqual([
        { id: "todo", label: "To Do", canArchive: false },
        { id: "done", label: "Done", isCompletion: true, canArchive: true },
        { id: "cancelled", label: "Cancelled", canArchive: true },
      ]);
    });
  });

  describe("validateSprintConfig", () => {
    it("should return valid when currentSprint exists in sequence", () => {
      const config: ConfigData = {
        ...DEFAULT_CONFIG,
        currentSprint: "sprint-2",
        sprintSequence: ["sprint-1", "sprint-2", "sprint-3"],
      };
      const result = validateSprintConfig(config);
      expect(result.valid).toBe(true);
    });

    it("should return valid when no currentSprint is set", () => {
      const config: ConfigData = {
        ...DEFAULT_CONFIG,
        currentSprint: undefined,
        sprintSequence: ["sprint-1", "sprint-2"],
      };
      const result = validateSprintConfig(config);
      expect(result.valid).toBe(true);
    });

    it("should return valid when sequence is empty", () => {
      const config: ConfigData = {
        ...DEFAULT_CONFIG,
        currentSprint: "sprint-1",
        sprintSequence: [],
      };
      const result = validateSprintConfig(config);
      expect(result.valid).toBe(true);
    });

    it("should return invalid when currentSprint does not exist in sequence", () => {
      const config: ConfigData = {
        ...DEFAULT_CONFIG,
        currentSprint: "sprint-99",
        sprintSequence: ["sprint-1", "sprint-2", "sprint-3"],
      };
      const result = validateSprintConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("sprint-99");
    });
  });

  describe("parseTemplateFile", () => {
    it("should parse template with frontmatter", () => {
      const content = `---
title: API Endpoint
description: Create REST endpoint
types: [feature, task]
---

## Endpoint Details
- Method:
- Path:
`;
      const result = parseTemplateFile("api-endpoint.md", content);

      expect(result.name).toBe("api-endpoint");
      expect(result.displayName).toBe("API Endpoint");
      expect(result.description).toBe("Create REST endpoint");
      expect(result.types).toEqual(["feature", "task"]);
      expect(result.content).toContain("## Endpoint Details");
    });

    it("should use filename as displayName if no title", () => {
      const content = `## Just content`;
      const result = parseTemplateFile("my-template.md", content);

      expect(result.name).toBe("my-template");
      expect(result.displayName).toBe("my-template");
      expect(result.content).toBe("## Just content");
    });

    it("should handle empty frontmatter", () => {
      const content = `---
---
Some content`;
      const result = parseTemplateFile("test.md", content);

      expect(result.name).toBe("test");
      expect(result.displayName).toBe("test");
    });
  });

  describe("mergeConfigWithDefaults", () => {
    it("should use parsed values when available", () => {
      const parsed: Partial<ConfigData> = {
        epicPrefix: "PROJ",
        storyPrefix: "FEAT",
        statuses: [{ id: "open", label: "Open" }],
      };
      const result = mergeConfigWithDefaults(parsed);

      expect(result.epicPrefix).toBe("PROJ");
      expect(result.storyPrefix).toBe("FEAT");
      expect(result.statuses).toEqual([{ id: "open", label: "Open" }]);
      // Defaults for missing
      expect(result.sizes).toEqual(DEFAULT_CONFIG.sizes);
    });

    it("should use all defaults when parsed is empty", () => {
      const result = mergeConfigWithDefaults({});

      expect(result.epicPrefix).toBe(DEFAULT_CONFIG.epicPrefix);
      expect(result.storyPrefix).toBe(DEFAULT_CONFIG.storyPrefix);
      expect(result.statuses).toEqual(DEFAULT_CONFIG.statuses);
      expect(result.sizes).toEqual(DEFAULT_CONFIG.sizes);
    });
  });

  describe("debounce", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should delay function execution", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should reset timer on subsequent calls", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should pass arguments to function", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced("arg1", "arg2");
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith("arg1", "arg2");
    });

    it("should cancel previous pending call", () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced("first");
      vi.advanceTimersByTime(50);
      debounced("second");
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("second");
    });
  });

  describe("DEFAULT_CONFIG", () => {
    it("should have sensible defaults", () => {
      expect(DEFAULT_CONFIG.epicPrefix).toBe("EPIC");
      expect(DEFAULT_CONFIG.storyPrefix).toBe("STORY");
      expect(DEFAULT_CONFIG.statuses.length).toBeGreaterThan(0);
      expect(DEFAULT_CONFIG.sizes.length).toBe(7);
      expect(DEFAULT_CONFIG.storypoints.length).toBe(7);
    });

    it("should have required status workflow", () => {
      const statusIds = DEFAULT_CONFIG.statuses.map((s) => s.id);
      expect(statusIds).toContain("todo");
      expect(statusIds).toContain("done");
    });
  });

  describe("getSprintIndex", () => {
    const sequence = ["foundation-1", "polish-1", "polish-2", "launch-1", "backlog"];

    it("should return index for sprint in sequence", () => {
      expect(getSprintIndex("foundation-1", sequence)).toBe(0);
      expect(getSprintIndex("polish-1", sequence)).toBe(1);
      expect(getSprintIndex("backlog", sequence)).toBe(4);
    });

    it("should return Infinity for sprint not in sequence", () => {
      expect(getSprintIndex("unknown-sprint", sequence)).toBe(Infinity);
    });

    it("should return Infinity for undefined sprint", () => {
      expect(getSprintIndex(undefined, sequence)).toBe(Infinity);
    });

    it("should return Infinity for empty sequence", () => {
      expect(getSprintIndex("sprint-1", [])).toBe(Infinity);
    });

    it("should handle empty string sprint", () => {
      expect(getSprintIndex("", sequence)).toBe(Infinity);
    });
  });

  describe("isCompletedStatus", () => {
    const defaultStatuses: StatusDef[] = [
      { id: "todo", label: "To Do" },
      { id: "in_progress", label: "In Progress" },
      { id: "review", label: "Review" },
      { id: "done", label: "Done" },
    ];

    const customStatuses: StatusDef[] = [
      { id: "todo", label: "To Do" },
      { id: "in_progress", label: "In Progress" },
      { id: "done", label: "Done" },
      { id: "deployed", label: "Deployed" },
    ];

    it("should return true for last status in default workflow", () => {
      expect(isCompletedStatus("done", defaultStatuses)).toBe(true);
    });

    it("should return false for non-last status in default workflow", () => {
      expect(isCompletedStatus("todo", defaultStatuses)).toBe(false);
      expect(isCompletedStatus("in_progress", defaultStatuses)).toBe(false);
      expect(isCompletedStatus("review", defaultStatuses)).toBe(false);
    });

    it("should return true for last status in custom workflow", () => {
      expect(isCompletedStatus("deployed", customStatuses)).toBe(true);
    });

    it("should return false for done when custom workflow ends with deployed", () => {
      expect(isCompletedStatus("done", customStatuses)).toBe(false);
    });

    it("should fall back to literal done check for empty statuses array", () => {
      expect(isCompletedStatus("done", [])).toBe(true);
      expect(isCompletedStatus("deployed", [])).toBe(false);
    });

    it("should handle single-status workflow", () => {
      const singleStatus: StatusDef[] = [{ id: "complete", label: "Complete" }];
      expect(isCompletedStatus("complete", singleStatus)).toBe(true);
      expect(isCompletedStatus("done", singleStatus)).toBe(false);
    });

    it("should use isCompletion flag when statuses extend beyond done", () => {
      const statuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "in_progress", label: "In Progress" },
        { id: "review", label: "Review" },
        { id: "done", label: "Done", isCompletion: true },
        { id: "blocked", label: "Blocked" },
        { id: "deferred", label: "Deferred" },
        { id: "cancelled", label: "Cancelled" },
      ];
      expect(isCompletedStatus("done", statuses)).toBe(true);
      expect(isCompletedStatus("cancelled", statuses)).toBe(false);
      expect(isCompletedStatus("blocked", statuses)).toBe(false);
      expect(isCompletedStatus("todo", statuses)).toBe(false);
    });

    it("should support multiple isCompletion statuses", () => {
      const statuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "done", label: "Done", isCompletion: true },
        { id: "deployed", label: "Deployed", isCompletion: true },
        { id: "cancelled", label: "Cancelled" },
      ];
      expect(isCompletedStatus("done", statuses)).toBe(true);
      expect(isCompletedStatus("deployed", statuses)).toBe(true);
      expect(isCompletedStatus("cancelled", statuses)).toBe(false);
    });
  });

  describe("isExcludedStatus", () => {
    it("returns true for statuses with isExcluded flag", () => {
      const statuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "cancelled", label: "Cancelled", isExcluded: true },
        { id: "deferred", label: "Deferred", isExcluded: true },
      ];
      expect(isExcludedStatus("cancelled", statuses)).toBe(true);
      expect(isExcludedStatus("deferred", statuses)).toBe(true);
    });

    it("returns false for statuses without isExcluded flag", () => {
      const statuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "done", label: "Done", isCompletion: true },
        { id: "cancelled", label: "Cancelled", isExcluded: true },
      ];
      expect(isExcludedStatus("todo", statuses)).toBe(false);
      expect(isExcludedStatus("done", statuses)).toBe(false);
    });

    it("returns false for unknown status", () => {
      const statuses: StatusDef[] = [{ id: "cancelled", label: "Cancelled", isExcluded: true }];
      expect(isExcludedStatus("unknown", statuses)).toBe(false);
    });

    it("returns false for empty statuses", () => {
      expect(isExcludedStatus("cancelled", [])).toBe(false);
    });
  });

  describe("isCanArchiveStatus", () => {
    it("returns true for statuses with canArchive flag", () => {
      const statuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "done", label: "Done", isCompletion: true, canArchive: true },
        { id: "cancelled", label: "Cancelled", canArchive: true },
      ];
      expect(isCanArchiveStatus("done", statuses)).toBe(true);
      expect(isCanArchiveStatus("cancelled", statuses)).toBe(true);
    });

    it("returns false for statuses without canArchive flag", () => {
      const statuses: StatusDef[] = [
        { id: "todo", label: "To Do" },
        { id: "done", label: "Done", isCompletion: true, canArchive: true },
      ];
      expect(isCanArchiveStatus("todo", statuses)).toBe(false);
    });

    it("returns false for unknown status", () => {
      const statuses: StatusDef[] = [{ id: "done", label: "Done", canArchive: true }];
      expect(isCanArchiveStatus("unknown", statuses)).toBe(false);
    });

    it("returns false for empty statuses", () => {
      expect(isCanArchiveStatus("done", [])).toBe(false);
    });

    it("returns false when canArchive is explicitly false", () => {
      const statuses: StatusDef[] = [{ id: "done", label: "Done", canArchive: false }];
      expect(isCanArchiveStatus("done", statuses)).toBe(false);
    });
  });

  describe("sprint date config parsing", () => {
    it("parses sprints.length from config JSON", () => {
      const config = parseConfigJsonContent(
        JSON.stringify({
          sprints: { sequence: ["sprint-1"], length: 14 },
          statuses: [{ id: "todo", label: "To Do" }],
          sizes: ["M"],
        }),
      );
      expect(config.sprintLength).toBe(14);
    });

    it("parses sprints.firstSprintStartDate from config JSON", () => {
      const config = parseConfigJsonContent(
        JSON.stringify({
          sprints: { sequence: ["sprint-1"], firstSprintStartDate: "2026-01-06" },
          statuses: [{ id: "todo", label: "To Do" }],
          sizes: ["M"],
        }),
      );
      expect(config.firstSprintStartDate).toBe("2026-01-06");
    });

    it("parses isExcluded flag on statuses", () => {
      const config = parseConfigJsonContent(
        JSON.stringify({
          statuses: [
            { id: "todo", label: "To Do" },
            { id: "cancelled", label: "Cancelled", isExcluded: true },
          ],
          sizes: ["M"],
        }),
      );
      expect(config.statuses![1].isExcluded).toBe(true);
      expect(config.statuses![0].isExcluded).toBeUndefined();
    });

    it("mergeConfigWithDefaults preserves sprint date fields", () => {
      const merged = mergeConfigWithDefaults({
        sprintLength: 14,
        firstSprintStartDate: "2026-01-06",
      });
      expect(merged.sprintLength).toBe(14);
      expect(merged.firstSprintStartDate).toBe("2026-01-06");
    });

    it("mergeConfigWithDefaults applies default sprint date fields when not set", () => {
      const merged = mergeConfigWithDefaults({});
      expect(merged.sprintLength).toBe(7);
      expect(merged.firstSprintStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("themePrefix", () => {
    it("parseConfigJsonContent parses idPrefix.theme", () => {
      const json = JSON.stringify({
        version: 2,
        idPrefix: { theme: "TH", epic: "EP", story: "ST" },
      });
      const result = parseConfigJsonContent(json);
      expect(result.themePrefix).toBe("TH");
    });

    it("parseConfigJsonContent leaves themePrefix undefined when not set", () => {
      const json = JSON.stringify({
        version: 2,
        idPrefix: { epic: "EP", story: "ST" },
      });
      const result = parseConfigJsonContent(json);
      expect(result.themePrefix).toBeUndefined();
    });

    it("mergeConfigWithDefaults uses THEME as default themePrefix", () => {
      const merged = mergeConfigWithDefaults({});
      expect(merged.themePrefix).toBe("THEME");
    });

    it("mergeConfigWithDefaults preserves parsed themePrefix", () => {
      const merged = mergeConfigWithDefaults({ themePrefix: "TH" });
      expect(merged.themePrefix).toBe("TH");
    });
  });

  describe("computeConfigUpgrade", () => {
    const TARGET = "3.2.2";

    it("returns null when config is already at target version", () => {
      const raw = { version: TARGET, idMode: "auto" };
      expect(computeConfigUpgrade(raw, TARGET)).toBeNull();
    });

    it("returns null when config version is a higher semver", () => {
      const raw = { version: "99.0.0" };
      expect(computeConfigUpgrade(raw, TARGET)).toBeNull();
    });

    it("upgrades from old integer version 1", () => {
      const raw = { version: 1, idPrefix: { epic: "EP", story: "ST", theme: "TH" } };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result).not.toBeNull();
      expect(result!.upgraded.version).toBe(TARGET);
    });

    it("upgrades from old integer version 3 to semver", () => {
      const raw = { version: 3, idMode: "auto" };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result).not.toBeNull();
      expect(result!.upgraded.version).toBe(TARGET);
    });

    it("adds idMode when missing", () => {
      const raw = { version: 1, idPrefix: { epic: "EP", story: "ST", theme: "TH" } };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result).not.toBeNull();
      expect(result!.upgraded.idMode).toBe("auto");
      expect(result!.fieldsAdded).toContain("idMode");
    });

    it("does not overwrite existing idMode", () => {
      const raw = { version: 1, idMode: "manual", idPrefix: { epic: "E", story: "S", theme: "T" } };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.idMode).toBe("manual");
      expect(result!.fieldsAdded).not.toContain("idMode");
    });

    it("adds autoFilterCurrentSprint when missing", () => {
      const raw = { version: 1 };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.autoFilterCurrentSprint).toBe(true);
      expect(result!.fieldsAdded).toContain("autoFilterCurrentSprint");
    });

    it("does not overwrite existing autoFilterCurrentSprint", () => {
      const raw = { version: 1, autoFilterCurrentSprint: false };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.autoFilterCurrentSprint).toBe(false);
      expect(result!.fieldsAdded).not.toContain("autoFilterCurrentSprint");
    });

    it("adds quickCapture when entirely missing", () => {
      const raw = { version: 1 };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.quickCapture).toEqual({ defaultToCurrentSprint: false });
      expect(result!.fieldsAdded).toContain("quickCapture");
    });

    it("adds quickCapture.defaultToCurrentSprint when quickCapture exists but field missing", () => {
      const raw = { version: 1, quickCapture: {} };
      const result = computeConfigUpgrade(raw, TARGET);
      expect((result!.upgraded.quickCapture as Record<string, unknown>).defaultToCurrentSprint).toBe(false);
      expect(result!.fieldsAdded).toContain("quickCapture.defaultToCurrentSprint");
    });

    it("does not overwrite existing quickCapture.defaultToCurrentSprint", () => {
      const raw = { version: 1, quickCapture: { defaultToCurrentSprint: true } };
      const result = computeConfigUpgrade(raw, TARGET);
      expect((result!.upgraded.quickCapture as Record<string, unknown>).defaultToCurrentSprint).toBe(true);
      expect(result!.fieldsAdded).not.toContain("quickCapture");
      expect(result!.fieldsAdded).not.toContain("quickCapture.defaultToCurrentSprint");
    });

    it("adds idPrefix.theme when idPrefix exists but theme missing", () => {
      const raw = { version: 1, idPrefix: { epic: "EPIC", story: "DS" } };
      const result = computeConfigUpgrade(raw, TARGET);
      expect((result!.upgraded.idPrefix as Record<string, unknown>).theme).toBe("THEME");
      expect(result!.fieldsAdded).toContain("idPrefix.theme");
    });

    it("does not add idPrefix.theme when idPrefix is absent", () => {
      const raw = { version: 1 };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.fieldsAdded).not.toContain("idPrefix.theme");
    });

    it("does not overwrite existing idPrefix.theme", () => {
      const raw = { version: 1, idPrefix: { epic: "EP", story: "ST", theme: "TH" } };
      const result = computeConfigUpgrade(raw, TARGET);
      expect((result!.upgraded.idPrefix as Record<string, unknown>).theme).toBe("TH");
      expect(result!.fieldsAdded).not.toContain("idPrefix.theme");
    });

    it("adds storypoints when sizes has 7 items and storypoints missing", () => {
      const raw = { version: 1, sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"] };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.storypoints).toEqual([1, 2, 4, 8, 16, 32, 64]);
      expect(result!.fieldsAdded).toContain("storypoints");
    });

    it("does not add storypoints when sizes has non-7 items", () => {
      const raw = { version: 1, sizes: ["S", "M", "L"] };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.storypoints).toBeUndefined();
      expect(result!.fieldsAdded).not.toContain("storypoints");
    });

    it("does not overwrite existing storypoints", () => {
      const raw = { version: 1, sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"], storypoints: [1, 1, 2, 3, 5, 8, 13] };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.storypoints).toEqual([1, 1, 2, 3, 5, 8, 13]);
      expect(result!.fieldsAdded).not.toContain("storypoints");
    });

    it("bumps version to target version string", () => {
      const raw = { version: 1 };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.version).toBe(TARGET);
    });

    it("handles version-only upgrade when all fields already present", () => {
      const raw = {
        version: 1,
        idMode: "auto",
        autoFilterCurrentSprint: true,
        quickCapture: { defaultToCurrentSprint: false },
        idPrefix: { epic: "EP", story: "ST", theme: "TH", task: "TASK" },
        storypoints: [1, 2, 4, 8, 16, 32, 64],
        sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"],
        statuses: [
          { id: "todo", label: "To Do", canArchive: false },
          { id: "done", label: "Done", isCompletion: true, canArchive: true },
        ],
        storydocs: { enabled: false, root: "docs/storydocs" },
        taskTypes: { code: "code.template.md" },
        storyTypes: { feature: { template: "feature.template.md", description: "New", icon: "lightbulb", emoji: "✨" } },
        storyTemplateRoot: ".devstories/templates",
        taskTemplateRoot: ".devstories/templates",
        archive: { soft: { devstories: "archive", storydocs: "archive" }, hard: { devstories: "glacier", storydocs: "glacier" } },
        sprints: { current: "sprint-1", sequence: ["sprint-1"], length: 14, firstSprintStartDate: "2026-01-05" },
      };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result).not.toBeNull();
      expect(result!.upgraded.version).toBe(TARGET);
      expect(result!.fieldsAdded).toEqual(["version"]);
    });

    it("does not mutate the input object", () => {
      const raw = { version: 1 };
      const originalStr = JSON.stringify(raw);
      computeConfigUpgrade(raw, TARGET);
      expect(JSON.stringify(raw)).toBe(originalStr);
    });

    it("handles missing version field (treats as v0)", () => {
      const raw = { idPrefix: { epic: "EP", story: "ST" } };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result).not.toBeNull();
      expect(result!.upgraded.version).toBe(TARGET);
    });

    it("preserves non-sprint fields and augments sprints with defaults", () => {
      const raw = {
        version: 1,
        sprints: { current: "sprint-1", sequence: ["sprint-1"] },
        storydocs: { enabled: true, root: "docs" },
        project: "My Project",
      };
      const result = computeConfigUpgrade(raw, TARGET);
      const sprints = result!.upgraded.sprints as Record<string, unknown>;
      expect(sprints.current).toBe("sprint-1");
      expect(sprints.sequence).toEqual(["sprint-1"]);
      expect(sprints.length).toBe(7);
      expect(sprints.firstSprintStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result!.upgraded.storydocs).toEqual({ enabled: true, root: "docs" });
      expect(result!.upgraded.project).toBe("My Project");
    });

    it("adds storydocs with enabled:false when missing", () => {
      const raw = { version: 1 };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.storydocs).toEqual({ enabled: false, root: "docs/storydocs" });
      expect(result!.fieldsAdded).toContain("storydocs");
    });

    it("does not overwrite existing storydocs config", () => {
      const raw = { version: 1, storydocs: { enabled: true, root: "my-docs" } };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.storydocs).toEqual({ enabled: true, root: "my-docs" });
      expect(result!.fieldsAdded).not.toContain("storydocs");
    });

    it("adds idPrefix.task when idPrefix exists but task missing", () => {
      const raw = { version: 1, idPrefix: { epic: "EPIC", story: "DS", theme: "TH" } };
      const result = computeConfigUpgrade(raw, TARGET);
      expect((result!.upgraded.idPrefix as Record<string, unknown>).task).toBe("TASK");
      expect(result!.fieldsAdded).toContain("idPrefix.task");
    });

    it("does not overwrite existing idPrefix.task", () => {
      const raw = { version: 1, idPrefix: { epic: "EP", story: "ST", theme: "TH", task: "TSK" } };
      const result = computeConfigUpgrade(raw, TARGET);
      expect((result!.upgraded.idPrefix as Record<string, unknown>).task).toBe("TSK");
      expect(result!.fieldsAdded).not.toContain("idPrefix.task");
    });

    it("does not add idPrefix.task when idPrefix is absent", () => {
      const raw = { version: 1 };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.fieldsAdded).not.toContain("idPrefix.task");
    });

    it("adds taskTypes when missing", () => {
      const raw = { version: 1 };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.taskTypes).toBeDefined();
      expect(Object.keys(result!.upgraded.taskTypes as Record<string, string>)).toContain("code");
      expect(result!.fieldsAdded).toContain("taskTypes");
    });

    it("does not overwrite existing taskTypes", () => {
      const raw = { version: 1, taskTypes: { custom: "custom.template.md" } };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.taskTypes).toEqual({ custom: "custom.template.md" });
      expect(result!.fieldsAdded).not.toContain("taskTypes");
    });

    it("adds storyTemplateRoot and taskTemplateRoot when missing", () => {
      const raw = { version: 1 };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.storyTemplateRoot).toBe(".devstories/templates");
      expect(result!.upgraded.taskTemplateRoot).toBe(".devstories/templates");
      expect(result!.fieldsAdded).toContain("storyTemplateRoot");
      expect(result!.fieldsAdded).toContain("taskTemplateRoot");
    });

    it("migrates legacy templateRoot to both new fields", () => {
      const raw = { version: 1, templateRoot: "docs/my-templates" };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.storyTemplateRoot).toBe("docs/my-templates");
      expect(result!.upgraded.taskTemplateRoot).toBe("docs/my-templates");
      expect(result!.upgraded.templateRoot).toBeUndefined();
      expect(result!.fieldsAdded).toContain("storyTemplateRoot");
      expect(result!.fieldsAdded).toContain("taskTemplateRoot");
      expect(result!.fieldsAdded).toContain("(removed templateRoot)");
    });

    it("adds storyTypes defaults when missing", () => {
      const raw = { version: 1 };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.storyTypes).toBeDefined();
      expect(Object.keys(result!.upgraded.storyTypes as Record<string, unknown>)).toContain("feature");
      expect(Object.keys(result!.upgraded.storyTypes as Record<string, unknown>)).toContain("bug");
      expect(result!.fieldsAdded).toContain("storyTypes");
    });

    it("does not overwrite existing storyTypes", () => {
      const raw = { version: 1, storyTypes: { custom: { template: "custom.md", description: "Custom", icon: "star", emoji: "⭐" } } };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(Object.keys(result!.upgraded.storyTypes as Record<string, unknown>)).toEqual(["custom"]);
      expect(result!.fieldsAdded).not.toContain("storyTypes");
    });

    it("adds archive with full defaults when missing", () => {
      const raw = { version: 1 };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.archive).toEqual({
        soft: { devstories: "archive", storydocs: "archive" },
        hard: { devstories: "glacier", storydocs: "glacier" },
      });
      expect(result!.fieldsAdded).toContain("archive");
    });

    it("does not overwrite existing archive config", () => {
      const raw = {
        version: 1,
        archive: {
          soft: { devstories: "my-archive", storydocs: "my-docs-archive" },
          hard: { devstories: "my-hard", storydocs: "my-hard-docs" },
        },
      };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.archive).toEqual(raw.archive);
      expect(result!.fieldsAdded).not.toContain("archive");
      expect(result!.fieldsAdded).not.toContain("archive.soft");
      expect(result!.fieldsAdded).not.toContain("archive.hard");
    });

    it("adds archive.hard when archive.soft exists but hard missing", () => {
      const raw = {
        version: 1,
        archive: {
          soft: { devstories: "my-archive", storydocs: "my-docs-archive" },
        },
      };
      const result = computeConfigUpgrade(raw, TARGET);
      const archive = result!.upgraded.archive as Record<string, unknown>;
      expect(archive.soft).toEqual({ devstories: "my-archive", storydocs: "my-docs-archive" });
      expect(archive.hard).toEqual({ devstories: "glacier", storydocs: "glacier" });
      expect(result!.fieldsAdded).toContain("archive.hard");
    });

    it("adds archive.soft when archive.hard exists but soft missing", () => {
      const raw = {
        version: 1,
        archive: {
          hard: { devstories: "my-hard", storydocs: "my-hard-docs" },
        },
      };
      const result = computeConfigUpgrade(raw, TARGET);
      const archive = result!.upgraded.archive as Record<string, unknown>;
      expect(archive.soft).toEqual({ devstories: "archive", storydocs: "archive" });
      expect(archive.hard).toEqual({ devstories: "my-hard", storydocs: "my-hard-docs" });
      expect(result!.fieldsAdded).toContain("archive.soft");
    });

    it("adds sprints.length and sprints.firstSprintStartDate when sprints exists but fields missing", () => {
      const raw = {
        version: 1,
        sprints: { current: "sprint-1", sequence: ["sprint-1"] },
      };
      const result = computeConfigUpgrade(raw, TARGET);
      const sprints = result!.upgraded.sprints as Record<string, unknown>;
      expect(sprints.length).toBe(7);
      expect(sprints.firstSprintStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result!.fieldsAdded).toContain("sprints.length");
      expect(result!.fieldsAdded).toContain("sprints.firstSprintStartDate");
    });

    it("does not overwrite existing sprints.length", () => {
      const raw = {
        version: 1,
        sprints: { current: "sprint-1", sequence: ["sprint-1"], length: 14 },
      };
      const result = computeConfigUpgrade(raw, TARGET);
      const sprints = result!.upgraded.sprints as Record<string, unknown>;
      expect(sprints.length).toBe(14);
      expect(result!.fieldsAdded).not.toContain("sprints.length");
    });

    it("does not overwrite existing sprints.firstSprintStartDate", () => {
      const raw = {
        version: 1,
        sprints: { current: "sprint-1", sequence: ["sprint-1"], firstSprintStartDate: "2026-01-05" },
      };
      const result = computeConfigUpgrade(raw, TARGET);
      const sprints = result!.upgraded.sprints as Record<string, unknown>;
      expect(sprints.firstSprintStartDate).toBe("2026-01-05");
      expect(result!.fieldsAdded).not.toContain("sprints.firstSprintStartDate");
    });

    it("does not add sprint fields when sprints object is absent", () => {
      const raw = { version: 1 };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.sprints).toBeUndefined();
      expect(result!.fieldsAdded).not.toContain("sprints.length");
      expect(result!.fieldsAdded).not.toContain("sprints.firstSprintStartDate");
    });

    it("adds canArchive: false to all statuses when missing", () => {
      const raw = {
        version: 1,
        statuses: [
          { id: "todo", label: "To Do" },
          { id: "done", label: "Done", isCompletion: true },
        ],
      };
      const result = computeConfigUpgrade(raw, TARGET);
      const statuses = result!.upgraded.statuses as Array<Record<string, unknown>>;
      expect(statuses[0].canArchive).toBe(false);
      expect(statuses[1].canArchive).toBe(false);
      expect(result!.fieldsAdded).toContain("statuses[].canArchive");
    });

    it("does not overwrite existing canArchive values", () => {
      const raw = {
        version: 1,
        statuses: [
          { id: "todo", label: "To Do", canArchive: false },
          { id: "done", label: "Done", isCompletion: true, canArchive: true },
        ],
      };
      const result = computeConfigUpgrade(raw, TARGET);
      const statuses = result!.upgraded.statuses as Array<Record<string, unknown>>;
      expect(statuses[0].canArchive).toBe(false);
      expect(statuses[1].canArchive).toBe(true);
      expect(result!.fieldsAdded).not.toContain("statuses[].canArchive");
    });

    it("adds canArchive: false only to statuses missing the field", () => {
      const raw = {
        version: 1,
        statuses: [
          { id: "todo", label: "To Do" },
          { id: "done", label: "Done", canArchive: true },
        ],
      };
      const result = computeConfigUpgrade(raw, TARGET);
      const statuses = result!.upgraded.statuses as Array<Record<string, unknown>>;
      expect(statuses[0].canArchive).toBe(false);
      expect(statuses[1].canArchive).toBe(true);
      expect(result!.fieldsAdded).toContain("statuses[].canArchive");
    });

    it("does not touch canArchive when statuses array is absent", () => {
      const raw = { version: 1 };
      const result = computeConfigUpgrade(raw, TARGET);
      expect(result!.upgraded.statuses).toBeUndefined();
      expect(result!.fieldsAdded).not.toContain("statuses[].canArchive");
    });
  });

  describe("archive config (soft archive)", () => {
    describe("parseConfigJsonContent — archive fields", () => {
      it("parses archive.soft.devstories path", () => {
        const json = JSON.stringify({
          version: 3,
          archive: { soft: { devstories: "archived" } },
        });
        const result = parseConfigJsonContent(json);
        expect(result.archiveSoftDevstories).toBe("archived");
      });

      it("parses archive.soft.storydocs path", () => {
        const json = JSON.stringify({
          version: 3,
          archive: { soft: { storydocs: "archived-docs" } },
        });
        const result = parseConfigJsonContent(json);
        expect(result.archiveSoftStorydocs).toBe("archived-docs");
      });

      it("parses both archive.soft paths together", () => {
        const json = JSON.stringify({
          version: 3,
          archive: { soft: { devstories: "soft-archive", storydocs: "soft-docs" } },
        });
        const result = parseConfigJsonContent(json);
        expect(result.archiveSoftDevstories).toBe("soft-archive");
        expect(result.archiveSoftStorydocs).toBe("soft-docs");
      });

      it("leaves archive fields undefined when archive section is absent", () => {
        const json = JSON.stringify({ version: 3 });
        const result = parseConfigJsonContent(json);
        expect(result.archiveSoftDevstories).toBeUndefined();
        expect(result.archiveSoftStorydocs).toBeUndefined();
      });

      it("leaves archive fields undefined when archive.soft is absent", () => {
        const json = JSON.stringify({ version: 3, archive: {} });
        const result = parseConfigJsonContent(json);
        expect(result.archiveSoftDevstories).toBeUndefined();
        expect(result.archiveSoftStorydocs).toBeUndefined();
      });

      it("ignores empty-string archive paths", () => {
        const json = JSON.stringify({
          version: 3,
          archive: { soft: { devstories: "", storydocs: "  " } },
        });
        const result = parseConfigJsonContent(json);
        expect(result.archiveSoftDevstories).toBeUndefined();
        expect(result.archiveSoftStorydocs).toBeUndefined();
      });

      it("trims whitespace from archive paths", () => {
        const json = JSON.stringify({
          version: 3,
          archive: { soft: { devstories: "  archive  ", storydocs: " docs/archive " } },
        });
        const result = parseConfigJsonContent(json);
        expect(result.archiveSoftDevstories).toBe("archive");
        expect(result.archiveSoftStorydocs).toBe("docs/archive");
      });
    });

    describe("mergeConfigWithDefaults — archive fields", () => {
      it("passes through archive fields when present", () => {
        const merged = mergeConfigWithDefaults({
          archiveSoftDevstories: "archive",
          archiveSoftStorydocs: "docs/archive",
        });
        expect(merged.archiveSoftDevstories).toBe("archive");
        expect(merged.archiveSoftStorydocs).toBe("docs/archive");
      });

      it("leaves archive fields undefined when not set (no default)", () => {
        const merged = mergeConfigWithDefaults({});
        expect(merged.archiveSoftDevstories).toBeUndefined();
        expect(merged.archiveSoftStorydocs).toBeUndefined();
      });
    });
  });

  describe("archive config (hard archive)", () => {
    describe("parseConfigJsonContent — hard archive fields", () => {
      it("parses archive.hard.devstories path", () => {
        const json = JSON.stringify({
          version: 3,
          archive: { hard: { devstories: "glacierd" } },
        });
        const result = parseConfigJsonContent(json);
        expect(result.archiveHardDevstories).toBe("glacierd");
      });

      it("parses archive.hard.storydocs path", () => {
        const json = JSON.stringify({
          version: 3,
          archive: { hard: { storydocs: "glacierd-docs" } },
        });
        const result = parseConfigJsonContent(json);
        expect(result.archiveHardStorydocs).toBe("glacierd-docs");
      });

      it("parses both archive.hard paths together", () => {
        const json = JSON.stringify({
          version: 3,
          archive: { hard: { devstories: "glacier", storydocs: "hard-docs" } },
        });
        const result = parseConfigJsonContent(json);
        expect(result.archiveHardDevstories).toBe("glacier");
        expect(result.archiveHardStorydocs).toBe("hard-docs");
      });

      it("leaves hard archive fields undefined when archive.hard is absent", () => {
        const json = JSON.stringify({ version: 3, archive: {} });
        const result = parseConfigJsonContent(json);
        expect(result.archiveHardDevstories).toBeUndefined();
        expect(result.archiveHardStorydocs).toBeUndefined();
      });

      it("ignores empty-string hard archive paths", () => {
        const json = JSON.stringify({
          version: 3,
          archive: { hard: { devstories: "", storydocs: "  " } },
        });
        const result = parseConfigJsonContent(json);
        expect(result.archiveHardDevstories).toBeUndefined();
        expect(result.archiveHardStorydocs).toBeUndefined();
      });

      it("trims whitespace from hard archive paths", () => {
        const json = JSON.stringify({
          version: 3,
          archive: { hard: { devstories: "  glacier  ", storydocs: " docs/glacier " } },
        });
        const result = parseConfigJsonContent(json);
        expect(result.archiveHardDevstories).toBe("glacier");
        expect(result.archiveHardStorydocs).toBe("docs/glacier");
      });
    });

    describe("mergeConfigWithDefaults — hard archive fields", () => {
      it("passes through hard archive fields when present", () => {
        const merged = mergeConfigWithDefaults({
          archiveHardDevstories: "glacier",
          archiveHardStorydocs: "docs/glacier",
        });
        expect(merged.archiveHardDevstories).toBe("glacier");
        expect(merged.archiveHardStorydocs).toBe("docs/glacier");
      });

      it("leaves hard archive fields undefined when not set (no default)", () => {
        const merged = mergeConfigWithDefaults({});
        expect(merged.archiveHardDevstories).toBeUndefined();
        expect(merged.archiveHardStorydocs).toBeUndefined();
      });
    });
  });
});
