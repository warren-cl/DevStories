import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Store } from "../../core/store";
import { Watcher } from "../../core/watcher";
import { SprintFilterService } from "../../core/sprintFilterService";
import { ConfigService } from "../../core/configService";
import { ConfigData } from "../../core/configServiceUtils";
import { StoriesProvider, TreeElement } from "../../view/storiesProvider";
import { getTreeViewTitle } from "../../view/storiesProviderUtils";
import { isSprintNode } from "../../types/sprintNode";
import { isInboxSpikeNode, isInboxSpikeFile } from "../../types/inboxSpikeNode";

/** Helper: get .id from a TreeElement, handling SprintNode which has sprintId instead. */
function getElementId(el: TreeElement): string {
  if (isSprintNode(el)) {
    return el.sprintId;
  }
  if (isInboxSpikeNode(el)) {
    return el.nodeId;
  }
  if (isInboxSpikeFile(el)) {
    return el.filePath;
  }
  return el.id;
}

suite("StoriesProvider Test Suite", () => {
  const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const storiesDir = path.join(workspaceRoot, ".devstories", "stories");
  const epicsDir = path.join(workspaceRoot, ".devstories", "epics");

  const epicFile = path.join(epicsDir, "EPIC-VIEW.md");
  const storyFile = path.join(storiesDir, "STORY-VIEW.md");
  const bugFile = path.join(storiesDir, "STORY-BUG.md");

  let watcher: Watcher;
  let store: Store;
  let provider: StoriesProvider;

  // Mock extension path for icon tests
  const mockExtensionPath = path.join(workspaceRoot, ".."); // Parent of test-workspace

  setup(async () => {
    // Ensure directories exist
    if (!fs.existsSync(storiesDir)) {
      fs.mkdirSync(storiesDir, { recursive: true });
    }
    if (!fs.existsSync(epicsDir)) {
      fs.mkdirSync(epicsDir, { recursive: true });
    }

    // Create sample epic
    fs.writeFileSync(
      epicFile,
      `---
id: EPIC-VIEW
title: View Epic
status: todo
created: 2025-01-01
---
# View Epic`,
    );

    // Create feature story
    fs.writeFileSync(
      storyFile,
      `---
id: STORY-VIEW
title: View Story
type: feature
epic: EPIC-VIEW
status: todo
size: S
created: 2025-01-01
---
# View Story`,
    );

    // Create bug story (for icon type testing)
    fs.writeFileSync(
      bugFile,
      `---
id: STORY-BUG
title: Bug Story
type: bug
epic: EPIC-VIEW
status: in_progress
size: M
created: 2025-01-01
---
# Bug Story`,
    );

    watcher = new Watcher();
    store = new Store(watcher);
    const mockConfigService = {
      config: {
        statuses: [
          { id: "todo", label: "To Do" },
          { id: "in_progress", label: "In Progress" },
          { id: "done", label: "Done" },
        ],
        sprintSequence: [],
      },
      onDidConfigChange: new vscode.EventEmitter<ConfigData>().event,
    } as unknown as ConfigService;
    provider = new StoriesProvider(store, mockExtensionPath, mockConfigService);
    // Set to breakdown mode so existing tests work with Theme→Epic→Story hierarchy
    provider.setViewMode("breakdown");
    await store.load();
  });

  teardown(() => {
    watcher.dispose();
    if (fs.existsSync(epicFile)) {
      fs.unlinkSync(epicFile);
    }
    if (fs.existsSync(storyFile)) {
      fs.unlinkSync(storyFile);
    }
    if (fs.existsSync(bugFile)) {
      fs.unlinkSync(bugFile);
    }
  });

  test("should return epics as root children", async () => {
    const children = await provider.getChildren();
    const epic = children.find((c) => getElementId(c) === "EPIC-VIEW");
    assert.ok(epic, "Epic should be found in root children");
  });

  test("should return stories as children of epic", async () => {
    const epics = await provider.getChildren();
    const epic = epics.find((c) => getElementId(c) === "EPIC-VIEW");
    assert.ok(epic, "Epic should be found");

    if (epic) {
      const stories = await provider.getChildren(epic);
      const story = stories.find((s) => getElementId(s) === "STORY-VIEW");
      assert.ok(story, "Story should be found in epic children");
    }
  });

  test("should return correct tree item for epic", async () => {
    const epics = await provider.getChildren();
    const epic = epics.find((c) => getElementId(c) === "EPIC-VIEW");

    if (epic) {
      const treeItem = provider.getTreeItem(epic);
      assert.strictEqual(treeItem.label, "EPIC-VIEW: View Epic");
      assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
      assert.strictEqual(treeItem.contextValue, "epic");
    }
  });

  test("epic tree item should NOT have command (single-click expands)", async () => {
    const epics = await provider.getChildren();
    const epic = epics.find((c) => getElementId(c) === "EPIC-VIEW");

    if (epic) {
      const treeItem = provider.getTreeItem(epic);
      assert.strictEqual(treeItem.command, undefined, "Epic should not have a command so single-click expands/collapses");
    }
  });

  test("epic tree item should have resourceUri set", async () => {
    const epics = await provider.getChildren();
    const epic = epics.find((c) => getElementId(c) === "EPIC-VIEW");

    if (epic) {
      const treeItem = provider.getTreeItem(epic);
      assert.ok(treeItem.resourceUri, "Epic should have resourceUri for file operations");
      assert.ok(treeItem.resourceUri!.fsPath.endsWith("EPIC-VIEW.md"), "resourceUri should point to epic file");
    }
  });

  test("should return correct tree item for story", async () => {
    const epics = await provider.getChildren();
    const epic = epics.find((c) => getElementId(c) === "EPIC-VIEW");

    if (epic) {
      const stories = await provider.getChildren(epic);
      const story = stories.find((s) => getElementId(s) === "STORY-VIEW");

      if (story) {
        const treeItem = provider.getTreeItem(story);
        assert.strictEqual(treeItem.label, "STORY-VIEW: View Story");
        assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
        assert.strictEqual(treeItem.contextValue, "story");
        assert.ok(treeItem.command, "Story should have a command");
        assert.strictEqual(treeItem.command?.command, "vscode.open");
      }
    }
  });

  // DS-008: Icon Tests
  test("should display icon for epic", async () => {
    const epics = await provider.getChildren();
    const epic = epics.find((c) => getElementId(c) === "EPIC-VIEW");

    if (epic) {
      const treeItem = provider.getTreeItem(epic);
      assert.ok(treeItem.iconPath, "Epic should have an iconPath");

      // Check it's a light/dark icon object
      const iconPath = treeItem.iconPath as { light: vscode.Uri; dark: vscode.Uri };
      assert.ok(iconPath.light, "Should have light icon");
      assert.ok(iconPath.dark, "Should have dark icon");
      assert.ok(iconPath.light.fsPath.includes("epic-light.svg"), "Light icon should be epic");
      assert.ok(iconPath.dark.fsPath.includes("epic-dark.svg"), "Dark icon should be epic");
    }
  });

  test("should display correct icon based on story type", async () => {
    const epics = await provider.getChildren();
    const epic = epics.find((c) => getElementId(c) === "EPIC-VIEW");

    if (epic) {
      const stories = await provider.getChildren(epic);

      // Check feature story icon
      const featureStory = stories.find((s) => getElementId(s) === "STORY-VIEW");
      if (featureStory) {
        const featureItem = provider.getTreeItem(featureStory);
        const featureIcon = featureItem.iconPath as { light: vscode.Uri; dark: vscode.Uri };
        assert.ok(featureIcon.light.fsPath.includes("feature-light.svg"), "Feature should have feature icon");
      }

      // Check bug story icon
      const bugStory = stories.find((s) => getElementId(s) === "STORY-BUG");
      if (bugStory) {
        const bugItem = provider.getTreeItem(bugStory);
        const bugIcon = bugItem.iconPath as { light: vscode.Uri; dark: vscode.Uri };
        assert.ok(bugIcon.light.fsPath.includes("bug-light.svg"), "Bug should have bug icon");
      }
    }
  });

  test("should display status indicator in description", async () => {
    const epics = await provider.getChildren();
    const epic = epics.find((c) => getElementId(c) === "EPIC-VIEW");

    if (epic) {
      // Epic with todo status
      const epicItem = provider.getTreeItem(epic);
      assert.ok(epicItem.description?.toString().includes("○"), "Todo status should show empty circle");
      assert.ok(epicItem.description?.toString().includes("todo"), "Description should include status text");

      const stories = await provider.getChildren(epic);

      // Bug story with in_progress status
      const bugStory = stories.find((s) => getElementId(s) === "STORY-BUG");
      if (bugStory) {
        const bugItem = provider.getTreeItem(bugStory);
        assert.ok(bugItem.description?.toString().includes("◐"), "In progress should show half circle");
        assert.ok(bugItem.description?.toString().includes("in_progress"), "Description should include status text");
      }
    }
  });

  test("should show tooltip with story details", async () => {
    const epics = await provider.getChildren();
    const epic = epics.find((c) => getElementId(c) === "EPIC-VIEW");

    if (epic) {
      const stories = await provider.getChildren(epic);
      const story = stories.find((s) => getElementId(s) === "STORY-VIEW");

      if (story) {
        const treeItem = provider.getTreeItem(story);
        assert.ok(treeItem.tooltip, "Story should have tooltip");

        const tooltipValue = (treeItem.tooltip as vscode.MarkdownString).value;
        assert.ok(tooltipValue.includes("STORY-VIEW"), "Tooltip should include story ID");
        assert.ok(tooltipValue.includes("feature"), "Tooltip should include type");
        assert.ok(tooltipValue.includes("todo"), "Tooltip should include status");
        assert.ok(tooltipValue.includes("S"), "Tooltip should include size");
      }
    }
  });

  // DS-181: Epic tooltip parity
  test("should show tooltip with epic details", async () => {
    const epics = await provider.getChildren();
    const epic = epics.find((c) => getElementId(c) === "EPIC-VIEW");

    if (epic) {
      const treeItem = provider.getTreeItem(epic);
      assert.ok(treeItem.tooltip, "Epic should have tooltip");

      const tooltipValue = (treeItem.tooltip as vscode.MarkdownString).value;
      assert.ok(tooltipValue.includes("EPIC-VIEW"), "Tooltip should include epic ID");
      assert.ok(tooltipValue.includes("View Epic"), "Tooltip should include title");
      assert.ok(tooltipValue.includes("todo"), "Tooltip should include status");
      assert.ok(tooltipValue.includes("2025-01-01"), "Tooltip should include created date");
      assert.ok(tooltipValue.includes("Stories:"), "Tooltip should include story count");
    }
  });

  // DS-139: Tree view title tests
  test("getTreeViewTitle should return current sprint label when no filter", () => {
    assert.strictEqual(getTreeViewTitle("sprint-1", null, "backlog"), "BACKLOG: Current sprint-1");
  });

  test("getTreeViewTitle should return current sprint label when filter matches current", () => {
    assert.strictEqual(getTreeViewTitle("sprint-1", "sprint-1", "backlog"), "BACKLOG: Current sprint-1");
  });

  test("getTreeViewTitle should show filter sprint when different from current", () => {
    assert.strictEqual(getTreeViewTitle("sprint-1", "sprint-2", "breakdown"), "BREAKDOWN: Current sprint-1: Showing sprint-2");
  });

  test("getTreeViewTitle should show Backlog label when filtering backlog", () => {
    assert.strictEqual(getTreeViewTitle("sprint-1", "backlog", "backlog"), "BACKLOG: Current sprint-1: Showing Backlog");
  });

  test("StoriesProvider should accept SprintFilterService", () => {
    const sprintFilter = new SprintFilterService();
    const providerWithFilter = new StoriesProvider(store, mockExtensionPath, undefined, sprintFilter);
    assert.ok(providerWithFilter, "Should create provider with sprint filter service");
    sprintFilter.dispose();
  });

  test("should return tasks as children of a story when loaded", async () => {
    // Create storydocs directory structure with a task for STORY-VIEW
    const storydocsRoot = path.join(workspaceRoot, "test-storydocs-tree");
    const taskDir = path.join(storydocsRoot, "stories", "STORY-VIEW", "tasks");
    const taskFile = path.join(taskDir, "TASK-TV-001-implement.md");

    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(
      taskFile,
      `---
id: TASK-TV-001
title: Implement view
task_type: code
story: STORY-VIEW
status: todo
priority: 1
created: 2025-01-15
---
# Implement view`,
    );

    try {
      // Reload store with storydocs root so tasks are loaded
      await store.load(storydocsRoot);

      // Navigate to the story node
      const epics = await provider.getChildren();
      const epic = epics.find((c) => getElementId(c) === "EPIC-VIEW");
      assert.ok(epic, "Epic should be found");

      const stories = await provider.getChildren(epic!);
      const story = stories.find((s) => getElementId(s) === "STORY-VIEW");
      assert.ok(story, "Story should be found");

      // Story should be collapsible (has task children)
      const storyItem = provider.getTreeItem(story!);
      assert.strictEqual(storyItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed, "Story with tasks should be collapsible");

      // Get task children of the story
      const children = await provider.getChildren(story!);
      assert.strictEqual(children.length, 1, "Story should have one task child");

      const task = children[0];
      assert.strictEqual(getElementId(task), "TASK-TV-001");

      // Verify task tree item rendering
      const taskItem = provider.getTreeItem(task);
      assert.strictEqual(taskItem.label, "TASK-TV-001: Implement view");
      assert.strictEqual(taskItem.contextValue, "task");
      assert.strictEqual(taskItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    } finally {
      fs.rmSync(storydocsRoot, { recursive: true, force: true });
    }
  });
});
