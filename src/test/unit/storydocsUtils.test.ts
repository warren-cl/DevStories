import { describe, it, expect } from "vitest";
import * as path from "path";
import {
  isStorydocsEnabled,
  computeThemeFolderPath,
  computeEpicFolderPath,
  computeStoryFolderPath,
  computeNodeFolderPath,
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
