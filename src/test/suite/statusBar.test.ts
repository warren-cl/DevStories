import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Store } from '../../core/store';
import { Watcher } from '../../core/watcher';
import { SprintFilterService } from '../../core/sprintFilterService';
import { StatusBarController } from '../../view/statusBar';

suite('StatusBar Test Suite', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const storiesDir = path.join(workspaceRoot, '.devstories', 'stories');
  const epicsDir = path.join(workspaceRoot, '.devstories', 'epics');

  const epicFile = path.join(epicsDir, 'EPIC-STATUS.md');
  const story1File = path.join(storiesDir, 'STATUS-001.md');
  const story2File = path.join(storiesDir, 'STATUS-002.md');
  const story3File = path.join(storiesDir, 'STATUS-003.md');
  const story4File = path.join(storiesDir, 'STATUS-004.md');
  const story5File = path.join(storiesDir, 'STATUS-005.md');

  let watcher: Watcher;
  let store: Store;
  let sprintFilterService: SprintFilterService;
  let statusBar: StatusBarController;

  setup(async () => {
    // Ensure directories exist
    if (!fs.existsSync(storiesDir)) {
      fs.mkdirSync(storiesDir, { recursive: true });
    }
    if (!fs.existsSync(epicsDir)) {
      fs.mkdirSync(epicsDir, { recursive: true });
    }

    // Create epic
    fs.writeFileSync(epicFile, `---
id: EPIC-STATUS
title: Status Test Epic
status: todo
created: 2025-01-01
---
# Status Test Epic`);

    // Create 4 stories: 2 done, 1 in_progress, 1 todo (for sprint-1)
    fs.writeFileSync(story1File, `---
id: STATUS-001
title: Done Story 1
type: feature
epic: EPIC-STATUS
status: done
sprint: sprint-1
size: S
created: 2025-01-01
---
# Done Story 1`);

    fs.writeFileSync(story2File, `---
id: STATUS-002
title: Done Story 2
type: task
epic: EPIC-STATUS
status: done
sprint: sprint-1
size: M
created: 2025-01-01
---
# Done Story 2`);

    fs.writeFileSync(story3File, `---
id: STATUS-003
title: In Progress Story
type: bug
epic: EPIC-STATUS
status: in_progress
sprint: sprint-1
size: S
created: 2025-01-01
---
# In Progress Story`);

    fs.writeFileSync(story4File, `---
id: STATUS-004
title: Todo Story
type: chore
epic: EPIC-STATUS
status: todo
sprint: sprint-1
size: XS
created: 2025-01-01
---
# Todo Story`);

    // DS-034: Add story in sprint-2 for multi-sprint testing
    fs.writeFileSync(story5File, `---
id: STATUS-005
title: Sprint 2 Story
type: feature
epic: EPIC-STATUS
status: done
sprint: sprint-2
size: M
created: 2025-01-01
---
# Sprint 2 Story`);

    watcher = new Watcher();
    store = new Store(watcher);
    sprintFilterService = new SprintFilterService();
    statusBar = new StatusBarController(store, undefined, sprintFilterService);
    await store.load();
  });

  teardown(() => {
    watcher.dispose();
    sprintFilterService.dispose();
    statusBar.dispose();

    const files = [epicFile, story1File, story2File, story3File, story4File, story5File];
    for (const file of files) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  });

  test('should count stories accurately', () => {
    const stats = statusBar.getStats();
    assert.strictEqual(stats.totalPoints, 5, 'Should have 5 total stories');
    assert.strictEqual(stats.donePoints, 3, 'Should have 3 done stories');
  });

  test('should count stories by sprint', () => {
    const stats = statusBar.getStats('sprint-1');
    assert.strictEqual(stats.totalPoints, 4, 'Sprint-1 should have 4 stories');
    assert.strictEqual(stats.donePoints, 2, 'Sprint-1 should have 2 done');
  });

  test('should update on store change', async () => {
    // Change a story status from todo to done
    fs.writeFileSync(story4File, `---
id: STATUS-004
title: Todo Story
type: chore
epic: EPIC-STATUS
status: done
sprint: sprint-1
size: XS
created: 2025-01-01
---
# Todo Story (now done)`);

    // Wait for watcher to trigger (debounce 100ms + VS Code fs notification latency)
    await new Promise(resolve => setTimeout(resolve, 1500));

    const stats = statusBar.getStats();
    assert.strictEqual(stats.donePoints, 4, 'Should now have 4 done stories');
  });

  test('should format status bar text correctly', () => {
    const text = statusBar.getFormattedText();
    // Expected format: "$(checklist) All Sprints: ███░░░ 3/5"
    assert.ok(text.includes('3/5'), 'Should show done/total count');
    assert.ok(text.includes('All Sprints'), 'Should show All Sprints when no filter');
  });

  test('should show progress bar characters', () => {
    const text = statusBar.getFormattedText();
    // Should contain filled and empty bar characters
    assert.ok(text.includes('█') || text.includes('░'), 'Should contain progress bar characters');
  });

  // DS-034: New tests for sprint-aware status bar
  test('should show sprint name when sprint filter is set', () => {
    sprintFilterService.setSprint('sprint-1');
    const text = statusBar.getFormattedText();
    assert.ok(text.includes('sprint-1'), 'Should show sprint-1 in status bar');
    assert.ok(text.includes('2/4'), 'Should show filtered count 2/4');
  });

  test('should show Backlog when backlog filter is set', () => {
    sprintFilterService.setSprint('backlog');
    const text = statusBar.getFormattedText();
    assert.ok(text.includes('Backlog'), 'Should show Backlog in status bar');
  });

  test('should update when sprint filter changes', async () => {
    // Start with all sprints
    let text = statusBar.getFormattedText();
    assert.ok(text.includes('All Sprints'), 'Should start with All Sprints');

    // Change to sprint-2
    sprintFilterService.setSprint('sprint-2');
    // Give time for event to fire
    await new Promise(resolve => setTimeout(resolve, 50));

    text = statusBar.getFormattedText();
    assert.ok(text.includes('sprint-2'), 'Should show sprint-2 after filter change');
    assert.ok(text.includes('1/1'), 'Sprint-2 should show 1/1 (1 done story)');
  });

  test('should collect available sprints', () => {
    const sprints = statusBar.getAvailableSprints();
    assert.ok(sprints.includes('sprint-1'), 'Should include sprint-1');
    assert.ok(sprints.includes('sprint-2'), 'Should include sprint-2');
    assert.ok(!sprints.includes('backlog'), 'Should not include backlog in sprint list');
  });

  // DS-153: Status bar is display-only, no click handler
  test('should NOT have click handler command (DS-153)', () => {
    // Status bar is display-only; use filter icon in tree view title bar
    const command = statusBar.getCommand();
    assert.strictEqual(command, undefined, 'Should NOT have command - display only');
  });

  test('should be visible after construction', () => {
    // Verify the status bar is visible (shown by default)
    const isVisible = statusBar.isVisible();
    assert.strictEqual(isVisible, true, 'Should be visible after construction');
  });

  test('should toggle visibility', () => {
    // Test show/hide functionality
    assert.strictEqual(statusBar.isVisible(), true, 'Should start visible');

    statusBar.hide();
    assert.strictEqual(statusBar.isVisible(), false, 'Should be hidden after hide()');

    statusBar.show();
    assert.strictEqual(statusBar.isVisible(), true, 'Should be visible after show()');
  });

  test('should not throw on dispose', () => {
    // Create a new status bar to test dispose independently
    const testStore = new Store(watcher);
    const testSprintFilter = new SprintFilterService();
    const testStatusBar = new StatusBarController(testStore, undefined, testSprintFilter);

    // Dispose should not throw
    assert.doesNotThrow(() => {
      testStatusBar.dispose();
    }, 'dispose() should not throw');

    // Clean up
    testSprintFilter.dispose();
  });
});
