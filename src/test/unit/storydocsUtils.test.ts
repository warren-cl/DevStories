import { describe, it, expect } from "vitest";
import * as path from "path";
import {
  isStorydocsEnabled,
  computeThemeFolderPath,
  computeEpicFolderPath,
  computeStoryFolderPath,
  computeNodeFolderPath,
  computeArchivedNodeFolderPath,
  computeOrphanFolders,
  TYPE_FOLDERS,
} from "../../core/storydocsUtils";
import { DEFAULT_CONFIG, ConfigData } from "../../core/configServiceUtils";

describe("isStorydocsEnabled", () => {
  it("returns false when storydocsEnabled is undefined", () => {
    expect(isStorydocsEnabled(DEFAULT_CONFIG)).toBe(false);
  });

  it("returns false when storydocsEnabled is false", () => {
    const config: ConfigData = { ...DEFAULT_CONFIG, storydocsEnabled: false, storydocsRoot: "docs" };
    expect(isStorydocsEnabled(config)).toBe(false);
  });

  it("returns false when storydocsRoot is undefined", () => {
    const config: ConfigData = { ...DEFAULT_CONFIG, storydocsEnabled: true };
    expect(isStorydocsEnabled(config)).toBe(false);
  });

  it("returns false when storydocsRoot is empty string", () => {
    const config: ConfigData = { ...DEFAULT_CONFIG, storydocsEnabled: true, storydocsRoot: "" };
    expect(isStorydocsEnabled(config)).toBe(false);
  });

  it("returns true when enabled and root is set", () => {
    const config: ConfigData = { ...DEFAULT_CONFIG, storydocsEnabled: true, storydocsRoot: "docs/storydocs" };
    expect(isStorydocsEnabled(config)).toBe(true);
  });
});

describe("computeThemeFolderPath", () => {
  const root = path.join("project", "docs", "storydocs");

  it("returns root/themes/themeId", () => {
    expect(computeThemeFolderPath(root, "THEME-001")).toBe(path.join(root, "themes", "THEME-001"));
  });

  it("handles custom theme prefix", () => {
    expect(computeThemeFolderPath(root, "TH-042")).toBe(path.join(root, "themes", "TH-042"));
  });
});

describe("computeEpicFolderPath", () => {
  const root = path.join("project", "docs", "storydocs");

  it("returns root/epics/epicId", () => {
    expect(computeEpicFolderPath(root, "EPIC-0001")).toBe(path.join(root, "epics", "EPIC-0001"));
  });

  it("handles custom epic prefix", () => {
    expect(computeEpicFolderPath(root, "EP-042")).toBe(path.join(root, "epics", "EP-042"));
  });
});

describe("computeStoryFolderPath", () => {
  const root = path.join("project", "docs", "storydocs");

  it("returns root/stories/storyId", () => {
    expect(computeStoryFolderPath(root, "DS-00001")).toBe(path.join(root, "stories", "DS-00001"));
  });

  it("handles custom story prefix", () => {
    expect(computeStoryFolderPath(root, "STORY-042")).toBe(path.join(root, "stories", "STORY-042"));
  });
});

describe("computeNodeFolderPath", () => {
  const root = path.join("project", "docs", "storydocs");

  it("dispatches to theme path", () => {
    expect(computeNodeFolderPath(root, "THEME-001", "theme")).toBe(path.join(root, "themes", "THEME-001"));
  });

  it("dispatches to epic path", () => {
    expect(computeNodeFolderPath(root, "EPIC-0001", "epic")).toBe(path.join(root, "epics", "EPIC-0001"));
  });

  it("dispatches to story path", () => {
    expect(computeNodeFolderPath(root, "DS-00001", "story")).toBe(path.join(root, "stories", "DS-00001"));
  });
});

describe("TYPE_FOLDERS", () => {
  it("maps theme to themes", () => {
    expect(TYPE_FOLDERS.theme).toBe("themes");
  });

  it("maps epic to epics", () => {
    expect(TYPE_FOLDERS.epic).toBe("epics");
  });

  it("maps story to stories", () => {
    expect(TYPE_FOLDERS.story).toBe("stories");
  });
});

describe("computeArchivedNodeFolderPath", () => {
  const root = path.join("project", "docs", "storydocs");

  it("computes archived theme folder path", () => {
    expect(computeArchivedNodeFolderPath(root, "archive", "THEME-001", "theme")).toBe(path.join(root, "archive", "themes", "THEME-001"));
  });

  it("computes archived epic folder path", () => {
    expect(computeArchivedNodeFolderPath(root, "archive", "EPIC-0001", "epic")).toBe(path.join(root, "archive", "epics", "EPIC-0001"));
  });

  it("computes archived story folder path", () => {
    expect(computeArchivedNodeFolderPath(root, "archive", "DS-00001", "story")).toBe(path.join(root, "archive", "stories", "DS-00001"));
  });

  it("handles custom archive segment", () => {
    expect(computeArchivedNodeFolderPath(root, "soft-archive", "EPIC-0001", "epic")).toBe(
      path.join(root, "soft-archive", "epics", "EPIC-0001"),
    );
  });
});

describe("computeOrphanFolders", () => {
  it("returns empty array when all folders are known", () => {
    const entries = ["STORY-001", "STORY-002", "STORY-003"];
    const known = new Set(["STORY-001", "STORY-002", "STORY-003"]);
    expect(computeOrphanFolders(entries, known)).toEqual([]);
  });

  it("returns folders not in the known set", () => {
    const entries = ["STORY-001", "STORY-002", "STORY-003"];
    const known = new Set(["STORY-001", "STORY-003"]);
    expect(computeOrphanFolders(entries, known)).toEqual(["STORY-002"]);
  });

  it("returns all folders when known set is empty", () => {
    const entries = ["EPIC-001", "EPIC-002"];
    const known = new Set<string>();
    expect(computeOrphanFolders(entries, known)).toEqual(["EPIC-001", "EPIC-002"]);
  });

  it("returns empty array when directory is empty", () => {
    const known = new Set(["THEME-001"]);
    expect(computeOrphanFolders([], known)).toEqual([]);
  });

  it("returns empty array when both are empty", () => {
    expect(computeOrphanFolders([], new Set())).toEqual([]);
  });

  it("handles mixed known and orphan IDs", () => {
    const entries = ["THEME-001", "THEME-002", "THEME-003", "THEME-004"];
    const known = new Set(["THEME-001", "THEME-004"]);
    expect(computeOrphanFolders(entries, known)).toEqual(["THEME-002", "THEME-003"]);
  });
});
