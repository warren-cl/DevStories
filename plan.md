# Proposal: Two-Tier Sprint Archive

## The Problem

Completed sprints accumulate .devstories files and `storydocs/` folders indefinitely. Over months/years this clutters the file explorer,
bloats extension memory, and slows file watchers.

### Design: Soft Archive + Hard Archive

|                        | **Live**               | **Soft Archive**               | **Hard Archive**                     |
| ---------------------- | ---------------------- | ------------------------------ | ------------------------------------ |
| **Files in**           | stories                | `.devstories/archive/stories/` | `.devstories/glacier/stories/`       |
| **Storydocs in**       | `{storydocs}/stories/` | `{storydocs}/archive/stories/` | `{storydocs}/glacier/stories/`       |
| **Watcher covers**     | Yes                    | Yes                            | **No**                               |
| **Store loads**        | Yes                    | Yes                            | **No** (unless archive mode toggled) |
| **Treeview visible**   | Yes                    | Yes (dimmed)                   | **No** (unless archive mode toggled) |
| **Full functionality** | Yes                    | Yes                            | Read-only when viewing               |
| **Workspace clutter**  | High                   | **Low** (files in subfolder)   | **None**                             |
| **Memory overhead**    | Yes                    | Yes                            | **None** (unless viewing)            |

---

### Soft Archive — Detail

**What happens:** Story/epic/theme files and storydocs folders are physically moved into configurable archive subdirectories. They remain
visible in the treeview with full functionality (status change, drag-and-drop, links, burndown, etc.).

**Why this works with the current architecture:**

1. **Watcher** already uses `**/.devstories/**/*.md` — this glob naturally covers subdirectories like `.devstories/archive/stories/*.md`
   with zero changes.

2. **Store.load()** uses `findFiles("**/.devstories/stories/*.md")` — this does **not** recurse into subdirectories. This needs updating to
   **also** scan the soft archive path. The simplest approach: add parallel `findFiles` calls for archive paths (e.g.,
   `**/.devstories/archive/stories/*.md`).

3. **`reloadFile()`** routes by path segment (`/stories/`, `/epics/`, etc.) — archive paths like `/archive/stories/` still contain
   `/stories/` so routing works unchanged.

4. **TaskWatcher** uses `RelativePattern(storydocsRoot, 'stories/*/tasks/*.md')` — needs a second watcher for
   `archive/stories/*/tasks/*.md`.

5. **StorydocsUtils** path computation — need to check whether a node is archived and compute paths in the archive subtree accordingly.

**Metadata:** Each parsed item gets `isArchived?: boolean` derived from its `filePath` at parse time (path contains `/archive/`). No
frontmatter changes. This allows the treeview to render a subtle visual cue (e.g., dimmed description).

**Command: `devstories.softArchive`**

```
User runs "Soft Archive Sprint..."
→ QuickPick listing sprints with completed-story counts
→ Selects "sprint-6 and earlier"
→ Confirmation: "Move 15 stories, 3 epics, 1 theme to soft archive?"
→ Files are moved; store refreshes
```

**Eligibility rules (sprint-based cascade):**

- A **story** is eligible if: sprint ≤ sprint cutoff
- A **task** moves with its parent story (same folder in storydocs)
- An **epic** is eligible if: ALL its stories are archived or eligible (none remain live/incomplete)
- A **theme** is eligible if: ALL its epics are archived or eligible
- Incomplete stories in old sprints are **included** (undone stories are manually moved to the next sprint so sprints don't contain undone
  stories)
- Stories without a sprint are archived if they are in `done` status and their `completed_on` date ≤ last date of cutoff sprint.

**Restore:** A `devstories.restoreFromArchive` command moves items back to live folders. Could also be a context-menu action on archived
nodes in the treeview.

---

### Hard Archive — Detail

**What happens:** Items already in the soft archive (or live) are moved to a separate glacier folder that watchers/store don't cover. Items
vanish from the treeview entirely.

**Viewing the hard archive:** A toggle command (`devstories.toggleArchiveView`) switches the treeview into **archive mode**:

- The store does a fresh `load()` that scopes **stories and tasks** to glacier paths only, but loads **epics and themes from all locations**
  (live + soft archive + hard archive). This ensures the hierarchy is always intact — glacierd stories can reference epics/themes that
  haven't been glacierd yet.
- Treeview title shows **"Stories (Archive)"**
- Context key `devstories:archiveMode` enables a title-bar button to switch back
- All read features work: tree navigation, hover previews, `[[ID]]` links, burndown for historical sprints
- Write features are disabled (no drag-and-drop, no status changes, no create commands) — the archive is read-only

**Why toggle-and-reload beats filter-based:**

- Avoids loading thousands of archived files into memory alongside live data
- Simple implementation — `Store.load()` just points at different paths
- Clean separation — archive mode is an explicit user action, not an always-loaded filter
- Watchers don't need to cover glacier paths (no memory/CPU overhead during normal use)

**Command: `devstories.hardArchive`**

```
User runs "Hard Archive Sprint..."
→ QuickPick listing soft-archived sprints
→ Selects "sprint-3 and earlier"
→ Confirmation: "glacier 8 stories, 2 epics? They will be removed from the tree view."
→ Files moved from soft-archive to glacier; store refreshes
```

**Progression model:** Hard archive operates on already-soft-archived items by default. This enforces a review period and keeps the mental
model simple: **live → soft archive → hard archive**. A "hard archive directly" option could skip the soft step for bulk cleanup of very old
sprints.

---

### Config Schema

```jsonc
// .devstories/config.json
{
  "archive": {
    "soft": {
      "devstories": "archive", // relative to .devstories/
      "storydocs": "archive", // relative to storydocs root
    },
    "hard": {
      "devstories": "glacier", // relative to .devstories/
      "storydocs": "glacier", // relative to storydocs root
    },
  },
}
```

**Resulting folder structure:**

```
.devstories/
├── config.json
├── stories/                    ← live
├── epics/
├── themes/
├── archive/                    ← soft archive (watched)
│   ├── stories/
│   ├── epics/
│   └── themes/
└── glacier/               ← hard archive (NOT watched)
    ├── stories/
    ├── epics/
    └── themes/

docs/storydocs/
├── stories/DS-00001/           ← live
├── archive/stories/DS-00005/   ← soft archive (watched)
└── glacier/stories/DS-00002/  ← hard archive (not watched)
```

---

### Implementation Plan (Files & Changes)

**Phase 1: Soft Archive**

| File                                             | Change                                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| configServiceUtils.ts                            | Add `archive` section to `ConfigData` interface and `DEFAULT_CONFIG`                                                                                                        |
| `devstories.schema.json`                         | Add `archive` schema with soft/hard paths                                                                                                                                   |
| store.ts                                         | `load()` adds parallel `findFiles` for `archive/{stories,epics,themes}/*.md` and `archive/stories/*/tasks/*.md`. Parse-time detection: set `isArchived` based on file path. |
| taskWatcher.ts                                   | Accept array of roots or create a second watcher instance for `archive/stories/*/tasks/*.md`                                                                                |
| `types/story.ts`, `epic.ts`, `theme.ts`, task.ts | Add `isArchived?: boolean` field                                                                                                                                            |
| `parser.ts`                                      | No changes (path-based detection happens in store, not parser)                                                                                                              |
| New: `commands/archiveSprint.ts`                 | `softArchive` command: sprint picker, eligibility cascade, file moves, store reload                                                                                         |
| New: `commands/archiveSprintUtils.ts`            | Pure: `computeArchiveEligibility()`, `buildArchivePlan()`                                                                                                                   |
| `storydocsService.ts` / `storydocsUtils.ts`      | Path computation should respect archive location for archived nodes                                                                                                         |
| `storiesProviderUtils.ts`                        | Visual indicator for archived items (e.g., dimmed icon or description suffix)                                                                                               |
| package.json                                     | Register `devstories.softArchive` and `devstories.restoreFromArchive` commands                                                                                              |

**Phase 2: Hard Archive**

| File                                 | Change                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| store.ts                             | Generalize `load()` to accept a mode parameter. In archive mode: load stories/tasks from glacier paths only; load epics/themes from **all** paths (live + soft + hard) to preserve hierarchy for stories referencing non-archived parents. |
| New: `commands/hardArchiveSprint.ts` | Move from soft → hard archive paths                                                                                                                                                                                                        |
| New: `core/archiveModeService.ts`    | Manages `devstories:archiveMode` context key, emits toggle events                                                                                                                                                                          |
| `extension.ts`                       | Wire archive mode toggle; disable write commands when `archiveMode` is true                                                                                                                                                                |
| `storiesProvider.ts`                 | Show "(Archive)" in title when archive mode active                                                                                                                                                                                         |
| storiesDragAndDropController.ts      | Return early from all operations when `archiveMode` is true                                                                                                                                                                                |
| package.json                         | Register `devstories.hardArchive`, `devstories.toggleArchiveView`; add `when: !devstories:archiveMode` to write commands                                                                                                                   |

**Phase 3: Tests**

| File                             | Scope                                                                 |
| -------------------------------- | --------------------------------------------------------------------- |
| `archiveSprintUtils.test.ts`     | Eligibility cascade logic, plan builder                               |
| `store.test.ts` (or integration) | Verify load() picks up archive paths, `isArchived` flag set correctly |
| `archiveModeService.test.ts`     | Toggle state, context key changes                                     |

---

### Key Design Decisions

1. **Watcher coverage is the dividing line** — soft archive is inside the watcher glob, hard archive is outside. This is the simplest, most
   robust way to control visibility without filters.

2. **No frontmatter changes** — archive status is purely path-based. Moving a file back to the live folder restores it instantly. No risk of
   frontmatter corruption or round-trip issues.

3. **Sprint-based with cascade** — commands operate on sprint boundaries. Epics/themes cascade only when all children are eligible. This
   prevents orphaned references in the live treeview.

4. **Progression enforced** — live → soft → hard. Soft archive is the staging area; hard archive is the deep freeze. This matches the user's
   two-step mental model and prevents accidental data loss.

5. **glacier view is toggle + reload, not filter** — keeps zero overhead during normal usage. Loading archived data is an explicit,
   infrequent action.

6. **`isArchived` is derived, not stored** — computed from the file path at parse time. No migration needed, no frontmatter drift risk,
   works retroactively if files are moved manually.

7. **Epics/themes always loaded from all locations in archive mode** — glacierd stories may reference epics/themes that are still live or
   soft-archived (epics cascade later than their stories). Rather than creating stub copies or accepting broken hierarchy,
   `store.load('archive')` loads epics and themes from all three locations (live + soft + hard) while scoping stories and tasks to glacier
   only. This is cheap (typically 5–30 epic/theme files vs hundreds/thousands of stories) and guarantees the archive treeview always renders
   a complete hierarchy with no orphaned nodes.

---

## Plan: Phase 1 — Soft Archive Implementation Plan

Add sprint-based soft archiving: move story/epic/theme/task files into `.devstories/archive/` subdirectories. Files remain fully functional
in the treeview with a visual "(archived)" indicator. Includes restore command (sprint-based + individual context-menu). No frontmatter
changes — archive status is purely path-derived.

---

### Phase A: Config & Types (foundation, no behavior change)

**Step A1: Add `archive` fields to ConfigData** — configServiceUtils.ts

- Add two optional fields to `ConfigData` interface (after `templateRoot`): `archiveSoftDevstories?: string` and
  `archiveSoftStorydocs?: string`
- Leave `DEFAULT_CONFIG` with both `undefined` (feature activates when the archive command runs, using `"archive"` as the default segment)
- Add to `mergeConfigWithDefaults()`: pass through both fields
- Add to `parseConfigJsonContent()`: read from `parsed.archive?.soft?.devstories` and `parsed.archive?.soft?.storydocs`
- **Pattern:** Follow the existing `storydocsEnabled`/`storydocsRoot` precedent

**Step A2: Add `archive` to JSON schema** — devstories.schema.json

- Add `"archive"` property with nested `"soft"` object (`devstories` + `storydocs` string subproperties)
- Include `"hard"` placeholder object (same shape, for forward-compat with Phase 2)

**Step A3: Add `isArchived` to type interfaces** — story.ts, epic.ts, theme.ts, task.ts

- Add `isArchived?: boolean` to `Story`, `Epic`, `Theme`, `Task` interfaces
- No change to `isTask()` type guard

**Step A4: Unit tests for config parsing** — src/test/unit/configServiceUtils.test.ts (existing file)

- Test `parseConfigJsonContent` with archive fields present and absent
- Test `mergeConfigWithDefaults` passes through archive fields

_A1, A2, A3 can run in parallel._

---

### Phase B: Store — load archived files & set `isArchived`

**Step B1: Extend `store.load()` to scan archive paths** — store.ts

- After the existing five `findFiles` calls (lines 47-51), add parallel calls for:
  - `**.devstories${archiveSegment}/stories/*.md`
  - `**.devstories${archiveSegment}/epics/*.md`
  - `**.devstories${archiveSegment}/themes/*.md`
- Concatenate archive results with live results before parsing (e.g., `[...storyFiles, ...archiveStoryFiles].map(...)`)
- For tasks: add `findFiles` with pattern `${archiveSegment}/stories/*/tasks/*.md` relative to `storydocsRoot`
- Default `archiveSegment` to `"archive"` when config field is undefined
- **Key insight:** The existing Watcher glob `**/.devstories/**/*.md` already covers `archive/` subdirectories — no watcher changes needed

**Step B2: Set `isArchived` at parse time** — store.ts

- Create pure helper: `isArchivedPath(fsPath: string, archiveSegment: string): boolean`
  - Normalize separators, check if path contains `/${archiveSegment}/` (or `\${archiveSegment}\` on Windows)
- In `parseAndAddStory()`, `parseAndAddEpic()`, `parseAndAddTheme()`, `parseAndAddTask()`: after successful parse, set
  `item.isArchived = isArchivedPath(uri.fsPath, archiveSegment)`
- The `archiveSegment` needs to be available in these private methods — store it as a private field set during `load()`

**Step B3: Pass archive config to `load()`** — store.ts

- Extend `load()` signature: `load(storydocsRoot?: string, archiveDevstoriesSegment?: string, archiveStorydocsSegment?: string)`
- Store segments as instance fields for use in parse methods
- When undefined, default to `"archive"`

**Step B4: Update extension.ts** — extension.ts

- Read archive paths from `configService.config` and pass to `store.load(...)`
- Update the `configService.onDidConfigChange` handler to re-pass archive config on reload
- **Depends on:** A1, B1, B3

**Step B5: Second TaskWatcher for archive** — extension.ts

- After creating the main `taskWatcher`, create a second one for `{storydocsRoot}/{archiveSegment}/stories/*/tasks/*.md`
- Wire its events to `store.reloadFile()` and `store.handleFileDeleted()` identically
- Dispose and recreate both watchers on config change (same `ensureTaskWatcher` pattern, extended)
- **No changes to `taskWatcher.ts`** — just a second instance

**Step B6: Tests** — new or extend existing

- Unit tests for `isArchivedPath()`: forward/backslash, different segment names, false positives (e.g., path containing "archive" as part of
  a folder name)
- Verify `isArchived` is set on parsed items from archive paths

_B1-B3 depend on A1+A3. B4-B5 depend on B1-B3._

---

### Phase C: Archive & Restore Commands

**Step C1: Pure archive eligibility logic** — NEW src/commands/archiveSprintUtils.ts

- `computeArchiveCutoffIndex(sprint, sprintSequence)` — returns index; all sprints ≤ index are eligible
- `getEligibleStories(stories, sprintSequence, cutoffIndex, sprintDateRange?)` — stories where sprint ≤ cutoff, OR no sprint + completed
  with `completed_on` ≤ cutoff sprint end date. Excludes `isArchived === true`.
- `getEligibleEpics(epics, eligibleStoryIds, allStories)` — epic eligible iff ALL its stories are either already archived or in the eligible
  set. Excludes already-archived.
- `getEligibleThemes(themes, eligibleEpicIds, allEpics)` — same cascade. Excludes already-archived.
- `buildArchivePlan(stories, epics, themes)` → `{ stories, epics, themes }` summary
- **Reference:** Use `getSprintDateRange()` from burndownUtils.ts for date boundary computation. Use `isCompletedStatus()` from
  configServiceUtils.ts for completion check.

**Step C2: Pure path computation** — same file

- `computeArchiveDestination(sourcePath, archiveSegment)` — inserts `archiveSegment/` between .devstories and `stories/` (or `epics/`,
  `themes/`)
  - Input: `C:/project/.devstories/stories/DS-00001-foo.md`, `"archive"`
  - Output: `C:/project/.devstories/archive/stories/DS-00001-foo.md`
- `computeStorydocsArchiveDestination(sourcePath, storydocsRoot, archiveSegment)` — same pattern for storydocs
- `computeLiveDestination(archivedPath, archiveSegment)` — reverse: strip the archive segment (for restore)
- Handle both `/` and `\` path separators

**Step C3: Soft archive command** — NEW src/commands/archiveSprint.ts

- `executeSoftArchive(store, configService, storydocsService?)` returning `Promise<boolean>`
- Flow:
  1. Get sprint sequence, archive config, storydocs config from `configService`
  2. QuickPick: list sprints with eligible-story counts, format as `"sprint-6 and earlier (15 stories)"` — use `getEligibleStories()`
     per-cutoff to compute counts. Reference pickSprint.ts QuickPick pattern.
  3. Compute full eligibility (stories + cascade to epics/themes)
  4. Confirmation dialog: `"Move 15 stories, 3 epics, 1 theme to soft archive?"`
  5. Ensure archive directories exist: `vscode.workspace.fs.createDirectory()` for each `archive/{stories,epics,themes}/`
  6. Move files: `vscode.workspace.fs.rename(sourceUri, destUri)` — **first file-move in the codebase**
  7. Move storydocs folders similarly (if enabled)
  8. `store.load(...)` to refresh everything
  9. Success message
- **Error handling:** try-catch per file, log failures, continue with rest

**Step C4: Restore command** — NEW src/commands/restoreFromArchive.ts

- **Sprint-based** `executeRestoreFromArchive(store, configService)` — QuickPick of archived sprints → reverse the move
- **Individual** `executeRestoreItem(store, item)` — context-menu on a single archived node → move back to live path
- Both use `computeLiveDestination()` from C2
- After moves: `store.load(...)` to refresh

**Step C5: Tests** — NEW src/test/unit/archiveSprintUtils.test.ts

- `computeArchiveCutoffIndex`: first/last/invalid sprint
- `getEligibleStories`: sprint-based, no-sprint-completed, already-archived exclusion, partial sprints
- `getEligibleEpics`: all-children-eligible, partial children, orphan epics
- `getEligibleThemes`: cascade through epics
- `computeArchiveDestination`: Windows/Unix paths, different segments
- `computeLiveDestination`: reverse correctness

_C1+C2 can run in parallel; C3+C4 depend on C1+C2. C5 can run in parallel with C3._

---

### Phase D: Treeview Visual Indicators

**Step D1: Dimmed description + context values** — storiesProvider.ts

- In `createStoryTreeItem()`: if `element.isArchived`, append `" (archived)"` to the `item.description` string; set
  `item.contextValue = "story-archived"` instead of `"story"`
- Same pattern: `createEpicTreeItem()` → `"epic-archived"`, `createThemeTreeItem()` → `"theme-archived"`, `createTaskTreeItem()` →
  `"task-archived"`
- The `-archived` suffix enables `when` clause menu filtering in package.json

**Step D2: StorydocsUtils archive paths** — storydocsUtils.ts

- Add `computeArchivedNodeFolderPath(root, archiveSegment, nodeId, nodeType)`: `{root}/{archiveSegment}/{typeFolder}/{nodeId}`
- Used by storydocsService and archive command for folder moves

**Step D3: StorydocsService awareness** — storydocsService.ts

- `cleanupEmptyFolder()` already receives the node ID — needs to check both live and archive paths when cleaning up
- Or: rely on the fact that `store.onWillDeleteNode` fires with the item that has `filePath` set, and derive the correct storydocs path from
  `filePath` (checking for archive segment)

_D1 depends on A3+B2. D2+D3 depend on A1._

---

### Phase E: Registration & Wiring

**Step E1: Register commands** — package.json

- Add to `contributes.commands`:
  - `devstories.softArchive` — `"Soft Archive Sprint..."`, category `"DevStories"`
  - `devstories.restoreFromArchive` — `"Restore from Archive..."`, category `"DevStories"`
  - `devstories.restoreItem` — `"Restore from Archive"`, category `"DevStories"` (context menu)
- Add menu entries:
  - `devstories.restoreItem` in `view/item/context` with `"when": "viewItem =~ /.*-archived/"`
  - `devstories.softArchive` in command palette (or `view/title` with filter icon)

**Step E2: Wire in extension.ts** — extension.ts

- Import and register all three commands with `wrapCommand()` pattern
- Pass `store`, `configService`, `storydocsService`

_E1+E2 depend on C3+C4+D1._

---

### Verification

1. `npx tsc --noEmit` — type check
2. `npx vitest run` — all existing + new tests pass
3. `npm run lint` — clean
4. **Manual testing:**
   - Create project with completed sprints → run "Soft Archive Sprint..." → verify files move to `archive/`
   - Verify archived items show "(archived)" suffix, all features still work (status change, DnD, hover, links, burndown)
   - Run "Restore from Archive..." → files move back
   - Right-click archived item → "Restore from Archive" → single item restores
   - Verify with storydocs enabled: folders move correctly
   - Verify second TaskWatcher picks up archived task file changes

### Decisions

- **No frontmatter changes** — archive status is path-derived only
- **File move via `vscode.workspace.fs.rename()`** — first file-move operation in the codebase
- **Archive paths default to `"archive"`** — configurable but not required in config.json
- **All stories in cutoff sprints included** regardless of completion status
- **Epics/themes cascade** — only archived when ALL children are eligible
- **No watcher changes** — existing glob `**/.devstories/**/*.md` already covers archive subdirectories
- **Second TaskWatcher instance** for archive storydocs (simpler than modifying TaskWatcher class)
- **Context values** `"story-archived"` etc. enable context-menu `"Restore from Archive"`
