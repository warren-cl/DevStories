import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Store } from "../../core/store";
import { Watcher } from "../../core/watcher";

suite("Store Integration Test", () => {
  const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const storiesDir = path.join(workspaceRoot, ".devstories", "stories");
  const epicsDir = path.join(workspaceRoot, ".devstories", "epics");

  const epicFile = path.join(epicsDir, "EPIC-TEST.md");
  const storyFile = path.join(storiesDir, "STORY-TEST.md");

  let watcher: Watcher;
  let store: Store;

  setup(async () => {
    // Ensure directories exist
    if (!fs.existsSync(storiesDir)) {
      fs.mkdirSync(storiesDir, { recursive: true });
    }
    if (!fs.existsSync(epicsDir)) {
      fs.mkdirSync(epicsDir, { recursive: true });
    }

    // Create sample files
    fs.writeFileSync(
      epicFile,
      `---
id: EPIC-TEST
title: Test Epic
status: todo
created: 2025-01-01
---
# Test Epic`,
    );

    fs.writeFileSync(
      storyFile,
      `---
id: STORY-TEST
title: Test Story
type: feature
epic: EPIC-TEST
status: todo
size: S
created: 2025-01-01
---
# Test Story`,
    );

    watcher = new Watcher();
    store = new Store(watcher);
  });

  teardown(() => {
    watcher.dispose();
    if (fs.existsSync(epicFile)) {
      fs.unlinkSync(epicFile);
    }
    if (fs.existsSync(storyFile)) {
      fs.unlinkSync(storyFile);
    }
  });

  test("should load stories and epics", async () => {
    await store.load();

    const epic = store.getEpic("EPIC-TEST");
    assert.ok(epic, "Epic should be loaded");
    assert.strictEqual(epic?.title, "Test Epic");

    const story = store.getStory("STORY-TEST");
    assert.ok(story, "Story should be loaded");
    assert.strictEqual(story?.title, "Test Story");
    assert.strictEqual(story?.epic, "EPIC-TEST");
  });

  test("should get stories by epic", async () => {
    await store.load();
    const stories = store.getStoriesByEpic("EPIC-TEST");
    assert.strictEqual(stories.length, 1);
    assert.strictEqual(stories[0].id, "STORY-TEST");
  });

  test("should fire onDidUpdate after load completes", async () => {
    // Wait for any watcher events from setup() to settle
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Create a fresh store with its own watcher to avoid watcher-triggered events
    const freshWatcher = new Watcher();
    const freshStore = new Store(freshWatcher);

    let updateFired = false;
    const disposable = freshStore.onDidUpdate(() => {
      updateFired = true;
    });

    // load() should fire onDidUpdate when done
    await freshStore.load();

    // Give a small delay for any async event firing
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.ok(updateFired, "load() should fire onDidUpdate after completing");

    // Verify data was loaded
    const epic = freshStore.getEpic("EPIC-TEST");
    assert.ok(epic, "Epic should be loaded after onDidUpdate fires");

    disposable.dispose();
    freshWatcher.dispose();
  });

  test("should update on file change", async () => {
    await store.load();

    // Wait for initial watcher events to settle
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const updatePromise = new Promise<void>((resolve) => {
      const disposable = store.onDidUpdate(() => {
        disposable.dispose();
        resolve();
      });
    });

    // Update story title
    const newContent = `---
id: STORY-TEST
title: Updated Story
type: feature
epic: EPIC-TEST
status: todo
size: S
created: 2025-01-01
---
# Test Story`;
    await vscode.workspace.fs.writeFile(vscode.Uri.file(storyFile), Buffer.from(newContent));

    await updatePromise;

    const story = store.getStory("STORY-TEST");
    assert.strictEqual(story?.title, "Updated Story");
  });

  test("getEpicsBySprintOrder should sort epics by earliest story sprint", async () => {
    // Create additional files for sprint ordering test
    const epicAFile = path.join(epicsDir, "EPIC-A.md");
    const epicBFile = path.join(epicsDir, "EPIC-B.md");
    const storyAFile = path.join(storiesDir, "STORY-A.md");
    const storyBFile = path.join(storiesDir, "STORY-B.md");

    fs.writeFileSync(
      epicAFile,
      `---
id: EPIC-A
title: Epic A
status: todo
created: 2025-01-15
---
# Epic A`,
    );

    fs.writeFileSync(
      epicBFile,
      `---
id: EPIC-B
title: Epic B
status: todo
created: 2025-01-10
---
# Epic B`,
    );

    fs.writeFileSync(
      storyAFile,
      `---
id: STORY-A
title: Story A
type: feature
epic: EPIC-A
status: todo
size: S
sprint: polish-1
created: 2025-01-01
---
# Story A`,
    );

    fs.writeFileSync(
      storyBFile,
      `---
id: STORY-B
title: Story B
type: feature
epic: EPIC-B
status: todo
size: S
sprint: foundation-1
created: 2025-01-01
---
# Story B`,
    );

    try {
      await store.load();

      const sprintSequence = ["foundation-1", "polish-1", "launch-1"];
      const sortedEpics = store.getEpicsBySprintOrder(sprintSequence);

      // EPIC-B should be first (foundation-1 is before polish-1)
      const epicBIndex = sortedEpics.findIndex((e) => e.id === "EPIC-B");
      const epicAIndex = sortedEpics.findIndex((e) => e.id === "EPIC-A");
      assert.ok(epicBIndex < epicAIndex, "EPIC-B (foundation-1) should come before EPIC-A (polish-1)");
    } finally {
      // Clean up test files
      if (fs.existsSync(epicAFile)) {
        fs.unlinkSync(epicAFile);
      }
      if (fs.existsSync(epicBFile)) {
        fs.unlinkSync(epicBFile);
      }
      if (fs.existsSync(storyAFile)) {
        fs.unlinkSync(storyAFile);
      }
      if (fs.existsSync(storyBFile)) {
        fs.unlinkSync(storyBFile);
      }
    }
  });

  test("should load tasks when storydocsRoot is provided", async () => {
    // Create storydocs directory structure: {root}/stories/STORY-TEST/tasks/
    const storydocsRoot = path.join(workspaceRoot, "test-storydocs");
    const taskDir = path.join(storydocsRoot, "stories", "STORY-TEST", "tasks");
    const taskFile = path.join(taskDir, "TASK-001-implement.md");

    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(
      taskFile,
      `---
id: TASK-001
title: Implement feature
task_type: code
story: STORY-TEST
status: todo
priority: 1
created: 2025-01-15
---
# Implement feature`,
    );

    try {
      await store.load(storydocsRoot);

      const tasks = store.getTasksByStory("STORY-TEST");
      assert.strictEqual(tasks.length, 1, "Should find one task for STORY-TEST");
      assert.strictEqual(tasks[0].id, "TASK-001");
      assert.strictEqual(tasks[0].title, "Implement feature");
      assert.strictEqual(tasks[0].taskType, "code");
    } finally {
      fs.rmSync(storydocsRoot, { recursive: true, force: true });
    }
  });

  test("should clear tasks on reload without storydocsRoot", async () => {
    // First load WITH storydocs root to populate tasks
    const storydocsRoot = path.join(workspaceRoot, "test-storydocs-clear");
    const taskDir = path.join(storydocsRoot, "stories", "STORY-TEST", "tasks");
    const taskFile = path.join(taskDir, "TASK-002-write-tests.md");

    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(
      taskFile,
      `---
id: TASK-002
title: Write tests
task_type: code
story: STORY-TEST
status: todo
priority: 1
created: 2025-01-15
---
# Write tests`,
    );

    try {
      await store.load(storydocsRoot);
      assert.strictEqual(store.getTasks().length, 1, "Task should be loaded");

      // Reload WITHOUT storydocs root — tasks should be cleared
      await store.load();
      assert.strictEqual(store.getTasks().length, 0, "Tasks should be cleared after reload without storydocsRoot");
    } finally {
      fs.rmSync(storydocsRoot, { recursive: true, force: true });
    }
  });
});
