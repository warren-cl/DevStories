/**
 * Unit tests for computeTaskFolderPath in storydocsUtils
 */

import { describe, it, expect } from "vitest";
import * as path from "path";
import { computeTaskFolderPath } from "../../core/storydocsUtils";

describe("computeTaskFolderPath", () => {
  const root = path.join("project", "docs", "storydocs");

  it("returns root/stories/storyId/tasks", () => {
    expect(computeTaskFolderPath(root, "DS-00001")).toBe(
      path.join(root, "stories", "DS-00001", "tasks"),
    );
  });

  it("handles different story ID formats", () => {
    expect(computeTaskFolderPath(root, "STORY-042")).toBe(
      path.join(root, "stories", "STORY-042", "tasks"),
    );
  });

  it("works with different root paths", () => {
    expect(computeTaskFolderPath("docs", "DS-001")).toBe(
      path.join("docs", "stories", "DS-001", "tasks"),
    );
  });
});
