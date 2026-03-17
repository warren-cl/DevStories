import { describe, it, expect } from "vitest";
import { buildQuickPickItems, type StorydocEntry } from "../../commands/browseStorydocsUtils";

describe("buildQuickPickItems", () => {
  it("returns empty array for empty input", () => {
    expect(buildQuickPickItems([])).toEqual([]);
  });

  it("sorts entries alphabetically (case-insensitive)", () => {
    const entries: StorydocEntry[] = [
      { name: "Zebra.md", isDirectory: false },
      { name: "alpha.txt", isDirectory: false },
      { name: "Beta", isDirectory: true },
    ];
    const items = buildQuickPickItems(entries);
    expect(items.map((i) => i.name)).toEqual(["alpha.txt", "Beta", "Zebra.md"]);
  });

  it("prefixes folders with $(folder) and files with $(file)", () => {
    const entries: StorydocEntry[] = [
      { name: "notes", isDirectory: true },
      { name: "spec.md", isDirectory: false },
    ];
    const items = buildQuickPickItems(entries);
    expect(items[0].label).toBe("$(folder) notes");
    expect(items[1].label).toBe("$(file) spec.md");
  });

  it("sets description to 'folder' for directories only", () => {
    const entries: StorydocEntry[] = [
      { name: "docs", isDirectory: true },
      { name: "readme.md", isDirectory: false },
    ];
    const items = buildQuickPickItems(entries);
    expect(items[0].description).toBe("folder");
    expect(items[1].description).toBeUndefined();
  });

  it("preserves isDirectory flag on each item", () => {
    const entries: StorydocEntry[] = [
      { name: "sub", isDirectory: true },
      { name: "file.txt", isDirectory: false },
    ];
    const items = buildQuickPickItems(entries);
    const folder = items.find((i) => i.name === "sub")!;
    const file = items.find((i) => i.name === "file.txt")!;
    expect(folder.isDirectory).toBe(true);
    expect(file.isDirectory).toBe(false);
  });

  it("does not mutate the original array", () => {
    const entries: StorydocEntry[] = [
      { name: "b.md", isDirectory: false },
      { name: "a.md", isDirectory: false },
    ];
    const original = [...entries];
    buildQuickPickItems(entries);
    expect(entries).toEqual(original);
  });
});
