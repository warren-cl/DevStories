# CLAUDE.md

This file provides guidance to AI agents working with code in this repository.

## Project Overview

DevStories is a VS Code extension for lightweight story management using markdown files. Stories live in `.devstories/` as version-controlled markdown files, eliminating the need for external tools like JIRA.

## Architecture

### Core Design Principles

1. **Markdown-first**: Stories are markdown files with YAML frontmatter, not database records
2. **Git as sync**: Version control is the source of truth, no external databases
3. **VS Code native**: Uses VS Code Extension API, no external services
4. **TDD approach**: Write tests before implementation (Red → Green → Refactor)
5. **Pure/VS Code split**: Each module that touches VS Code API has a companion `*Utils.ts` file with pure functions that can be unit-tested without the extension host

### Directory Structure

```
DevStories/
├── src/
│   ├── extension.ts              # Entry point — registers all commands, providers, views
│   ├── core/
│   │   ├── parser.ts             # Frontmatter parsing (gray-matter) for stories, epics, themes, tasks
│   │   ├── store.ts              # In-memory cache (stories, epics, themes, tasks, brokenFiles, inbox, spikes)
│   │   ├── watcher.ts            # FileSystemWatcher for .devstories/ changes
│   │   ├── taskWatcher.ts        # FileSystemWatcher for storydocs tasks (stories/*/tasks/*.md)
│   │   ├── taskParserUtils.ts    # Pure: normalizeTaskFrontmatter(), field aliases, auto-healing
│   │   ├── configService.ts      # Reads/watches config.json, exposes ConfigData + events
│   │   ├── configServiceUtils.ts # Pure: parseConfig, mergeDefaults, getSizePoints, isCompletedStatus
│   │   ├── configServiceNotifications.ts # User-facing config error notifications
│   │   ├── sortService.ts        # Session-only sort state (key + direction) with event emitter
│   │   ├── sprintFilterService.ts# Sprint view-filter state + events
│   │   ├── textFilterService.ts  # Text search filter state + events (clears sprint filter when active)
│   │   ├── storydocsService.ts   # StoryDocs: folder lifecycle (ensure, reconcile, cleanup)
│   │   ├── storydocsUtils.ts     # Pure: path computation for flat storydocs layout
│   │   ├── autoFilterSprint.ts   # Auto-apply sprint filter from config
│   │   ├── autoTimestamp.ts      # Auto-update 'updated' field on save
│   │   ├── logger.ts             # Output channel logger
│   │   ├── welcomeContext.ts     # Welcome/empty-state detection (VS Code context keys)
│   │   └── welcomeContextUtils.ts# Pure: WelcomeState enum, determineWelcomeState()
│   ├── commands/
│   │   ├── init.ts               # Initialize .devstories/ directory
│   │   ├── createStory.ts        # Create story (supports preselected epic from context menu)
│   │   ├── createEpic.ts         # Create epic (supports preselected theme from context menu)
│   │   ├── createTheme.ts        # Create theme
│   │   ├── quickCapture.ts       # Cmd+Shift+S quick story capture
│   │   ├── changeStatus.ts       # Change status on story/epic/theme (manages completed_on)
│   │   ├── pickSprint.ts         # View-only sprint filter picker
│   │   ├── setCurrentSprint.ts   # Persist current sprint to config.json
│   │   ├── sortStories.ts        # QuickPick sort order selection
│   │   ├── textFilter.ts         # Text search InputBox (clears sprint filter on activation)
│   │   ├── saveAsTemplate.ts     # Save story as reusable template
│   │   ├── createStoryMenu.ts    # Multi-option story creation menu
│   │   ├── createTask.ts         # Create task under a story (requires storydocs)
│   │   ├── createTaskUtils.ts    # Pure: buildTaskFrontmatter, nextTaskId
│   │   ├── errorHandler.ts       # wrapCommand() error boundary
│   │   └── *Utils.ts             # Pure-function companions (testable without VS Code API)
│   ├── providers/
│   │   ├── storyHoverProvider.ts  # [[ID]] hover preview + field descriptions
│   │   ├── storyHoverProviderUtils.ts  # Pure: status indicators, type icons
│   │   ├── storyLinkProvider.ts   # [[ID]] clickable DocumentLinks
│   │   ├── storyLinkProviderUtils.ts   # Pure: findLinksInDocument(), LinkMatch interface
│   │   ├── frontmatterCompletionProvider.ts  # Autocomplete: status, type, size, sprint, epic, theme, [[ID]]
│   │   └── frontmatterCompletionProviderUtils.ts # Pure: CompletionData, field names, descriptions
│   ├── validation/
│   │   ├── frontmatterValidator.ts   # Ajv-based schema + cross-file validation
│   │   └── frontmatterDiagnostics.ts # VS Code DiagnosticCollection provider
│   ├── view/
│   │   ├── storiesProvider.ts     # TreeDataProvider — Breakdown & Backlog dual views
│   │   ├── storiesProviderUtils.ts# Sorting, status indicators, ViewMode type
│   │   ├── storiesDragAndDropController.ts  # Drag-and-drop: reassign + reorder + inbox conversion
│   │   ├── backlogDropHandler.ts  # Backlog-specific drop logic with priority bumping
│   │   ├── inboxDropHandler.ts    # Inbox/spike → story/epic conversion on drop
│   │   ├── inboxConversionUtils.ts# Pure: stripDatePrefix, titleFromKebabCase, fill frontmatter
│   │   ├── burndownViewProvider.ts# Sprint burndown WebviewView (SVG chart)
│   │   ├── burndownUtils.ts       # Pure burndown calculation functions
│   │   ├── burndownSvgRenderer.ts # SVG/HTML rendering for burndown chart
│   │   ├── statusBar.ts          # Status bar progress (story-point based)
│   │   └── statusBarUtils.ts     # Pure stats/formatting functions
│   ├── types/
│   │   ├── story.ts              # Story interface + StoryType, StorySize, StoryStatus
│   │   ├── epic.ts               # Epic interface (with theme + priority fields)
│   │   ├── theme.ts              # Theme interface (top-level grouping)
│   │   ├── task.ts               # Task interface + TaskType, isTask() type guard
│   │   ├── brokenFile.ts         # BrokenFile interface (parse failures shown in tree)
│   │   ├── sprintNode.ts         # SprintNode virtual tree node for Backlog view
│   │   └── inboxSpikeNode.ts     # InboxSpikeNode/File interfaces, sentinel IDs, type guards
│   ├── utils/
│   │   ├── linkResolver.ts       # Resolve [[ID]] to file path (story/epic/theme)
│   │   ├── inputValidation.ts    # Title/name validation for stories, epics, themes
│   │   ├── filenameUtils.ts      # toKebabCase() for filename slugs
│   │   └── dateUtils.ts          # formatDate(), localToday(), normalizeDatesInData()
│   └── test/
│       ├── suite/                # @vscode/test-electron integration tests
│       └── unit/                 # Vitest unit tests (~45 files, ~1041 tests)
├── schemas/                      # JSON Schema definitions
│   ├── devstories.schema.json    # config.json schema
│   ├── story.schema.json         # Story frontmatter schema
│   ├── epic.schema.json          # Epic frontmatter schema
│   ├── theme.schema.json         # Theme frontmatter schema
│   ├── task.schema.json          # Task frontmatter schema
│   └── defs/common.schema.json   # Shared definitions (ID patterns, enums)
├── webview/                      # Tutorial/webview assets
├── docs/PRD/                     # Product requirements
└── package.json                  # 24+ commands, views, menus, keybindings
```

## Data Flow Patterns

### Store-Centric Architecture

- **Store** (`src/core/store.ts`) is the single source of truth in memory
- Maintains Maps: `stories`, `epics`, `themes`, `tasks`, `brokenFiles` + arrays for `inboxFiles`, `spikeFiles`
- **Task composite keys**: Tasks are stored as `"${storyId}::${taskId}"` (e.g. `STORY-001::TASK-001`) because task IDs are only unique within a story
- All UI components (tree view, burndown, status bar) read from Store
- Store emits two events:
  - `onDidUpdate` — fires after any data change (UI consumers refresh here)
  - `onWillDeleteNode` — fires **before** removing a node, with `{ id, nodeType }` (used by StorydocsService for folder cleanup; nodeType can be `"task"`)
- File changes flow in via two watchers:
  - **Watcher** (`watcher.ts`) — `.devstories/` changes (stories, epics, themes)
  - **TaskWatcher** (`taskWatcher.ts`) — `{storydocsRoot}/stories/*/tasks/*.md` changes
- `store.reloadFile(uri)` allows immediate refresh after programmatic writes (avoids Windows FileSystemWatcher race)
- **CRITICAL**: `reloadFile()` checks `/tasks/` **before** `/stories/` in its if/else-if chain because task paths contain both segments (e.g., `storydocs/stories/STORY-001/tasks/TASK-001.md`)

### File → Store → UI Flow

```
.devstories/stories/DS-00001-login-form.md (filesystem)
  ↓ (FileWatcher detects change)
Parser.parseStory() / parseEpic() / parseTheme() (gray-matter)
  ↓
Store.stories.set(id, story) (Map update)
  — on parse failure → Store.brokenFiles.set(filePath, brokenFile)
  ↓
Store.onDidUpdate event fires
  ↓
StoriesProvider.refresh() + BurndownViewProvider.refresh() + StatusBar.update()
```

### Task File → Store → UI Flow

```
{storydocsRoot}/stories/STORY-001/tasks/TASK-001-my-task.md (filesystem)
  ↓ (TaskWatcher detects change, debounced 100ms)
Parser.parseTask() → normalizeTaskFrontmatter() (alias mapping, path-derived defaults)
  ↓
Store.tasks.set("STORY-001::TASK-001", task) (composite key)
  — if normalization changed data → auto-heal: write canonical frontmatter back to disk
  ↓
Store.onDidUpdate → StoriesProvider shows task as child of STORY-001
```

### UI → File Flow

```
User clicks status in tree view
  ↓
Command: changeStatus(storyId, newStatus)
  ↓
updateStoryStatus() / updateEpicStatus() / updateThemeStatus() (gray-matter stringify)
  — manages completed_on field on completion transitions
  ↓
File saved to disk
  ↓
FileWatcher detects change → Store reloads → UI refreshes
```

### Extension Activation Order (extension.ts)

```
1. Logger → Watcher → Store → ConfigService → SprintFilter → SortService → TextFilter
2. StoriesProvider → StatusBar → AutoTimestamp → StorydocsService
3. ConfigService.initialize() (loads config.json, starts watching)
4. Auto-apply sprint filter from config
5. Register tree view with drag-and-drop controller
6. Register burndown webview
7. Subscribe to filter/config/view-mode change events → title refresh
8. Register document providers (links, hover, completion, diagnostics)
9. Store.load() (parse all .devstories/ files)
10. StorydocsService.reconcileAll() (background, non-blocking)
11. Update welcome context keys
12. Register all 23 commands via wrapCommand() error boundary
```

## Markdown Format Specification

### Story File Structure

```markdown
---
id: DS-00001
title: Login Form Implementation
type: feature # feature | bug | task | chore | spike
epic: EPIC-0001 # Optional — missing/empty routes to "No Epic" sentinel
status: todo # Defined in config.json statuses
sprint: sprint-4
size: M # From config.json sizes array (default: XXS..XXL)
priority: 500 # Lower = higher priority (for drag-and-drop ordering)
assignee: ""
dependencies:
  - DS-00005
  - DS-00006
created: 2025-01-15
updated: 2025-01-20 # Auto-updated on save
completed_on: 2025-02-01 # Auto-set when status reaches isCompletion, cleared otherwise
---

# Login Form Implementation

[Markdown content follows...]
```

### Epic File Fields

- Same base fields as stories (id, title, status, created, updated, priority)
- `theme: THEME-001` — optional parent theme reference
- No sprint field — epic timing is derived from child stories

### Theme File Fields

- `id`, `title`, `status`, `priority`, `created`, `updated`
- Top-level grouping above epics; epics reference themes via `theme:` field

### Task File Structure

```markdown
---
id: TASK-001
title: Implement login validation
task_type: code  # Must match a key in config.taskTypes
story: STORY-001 # Auto-derived from folder path (authoritative)
status: todo
assigned_agent: code-agent  # Optional — populated from .github/agents/*.md
priority: 1      # Lower = higher priority (default: 1)
dependencies:
  - TASK-002
created: 2026-03-23
updated: 2026-03-23
completed_on:    # Auto-managed like stories
---

## Description
...
```

Task files live at `{storydocsRoot}/stories/{STORY-ID}/tasks/{TASK-ID}-slug.md`. Task IDs are 3-digit zero-padded: `TASK-001`.

### Filename Convention

Files include a kebab-case slug: `DS-00001-login-form.md`, `EPIC-0001-user-auth.md`, `THEME-001-platform.md`, `TASK-001-implement-validation.md`

### Config File (`.devstories/config.json`)

Key sections (see `schemas/devstories.schema.json` for full schema):

- `idPrefix`: `{ theme, epic, story, task }` — ID prefixes (task defaults to `"TASK"`)
- `statuses[]`: `{ id, label, isCompletion?, isExcluded? }` — workflow definition
- `sizes[]` / `storypoints[]` — parallel arrays (index-aligned)
- `sprints`: `{ current, sequence[], length, firstSprintStartDate }`
- `quickCapture`: `{ defaultToCurrentSprint }`
- `autoFilterCurrentSprint` — auto-apply sprint filter on load
- `storydocs`: `{ enabled, root }` — StoryDocs flat folder layout (required for tasks)
- `taskTypes`: `{ code: "code.template.md", ... }` — maps task type ID → template filename
- `templateRoot` — root folder for templates (defaults to `.devstories/templates`)
- Config schema version: `3` (auto-upgrades from v2, adding `taskTypes` and `idPrefix.task`)

## Key Features & How They Work

### Hierarchy: Theme → Epic → Story → Task

- Themes group epics; epics group stories; stories contain tasks. All relationships are optional.
- Orphans collected under virtual sentinel nodes (`__NO_THEME__`, `__NO_EPIC__`).
- `epic` field on stories, `theme` field on epics, `story` field on tasks.
- Tasks appear as leaf children under their parent story in both Breakdown and Backlog views.

### Dual View Modes

- **Breakdown**: Theme → Epic → Story tree (context key: `devstories:viewMode = 'breakdown'`)
- **Backlog**: Sprint → Story flat grouped list (`devstories:viewMode = 'backlog'`)
- Toggled via `switchToBreakdown` / `switchToBacklog` commands

### Drag-and-Drop (`storiesDragAndDropController.ts`)

- **Breakdown view**: Reassign stories between epics, epics between themes
- **Backlog view**: Reorder stories by priority within/across sprints (uses `backlogDropHandler.ts`)
- **Inbox/spike conversion**: Drag `.md` files from inbox/spikes onto tree nodes to convert into stories/epics (`inboxDropHandler.ts`) — also calls `storydocsService.ensureFolder()` for converted nodes
- Move functions: `moveStoryToEpic()`, `moveStoryToNoEpic()`, `moveEpicToTheme()` — update frontmatter via gray-matter, write to disk (no storydocs folder moves needed with flat layout)

### Inbox & Spikes

- `.devstories/inbox/` and `.devstories/spikes/` — staging folders for rough ideas
- Files appear as collapsible sentinel nodes at bottom of both views
- Drag onto a tree node to convert: auto-generates ID, assigns sprint/epic/theme from drop target
- Conversion logic in `inboxDropHandler.ts` + `inboxConversionUtils.ts`

### StoryDocs (opt-in flat folder layout)

- Config: `"storydocs": { "enabled": true, "root": "docs/storydocs" }`
- Creates flat, type-based folders mirroring `.devstories/`: `themes/THEME-001/`, `epics/EPIC-0001/`, `stories/DS-00001/`
- No sentinel folders — every node gets its own folder under the appropriate type subfolder
- **Lifecycle**: Folders auto-created on node create (including inbox/spike conversion), empty folders cleaned up on node delete
- No folder moves on drag-and-drop — the flat layout means reparenting doesn't affect storydocs paths
- **Reconcile command**: `devstories.reconcileStorydocs` rebuilds full structure from store state
- All storydocs operations are fire-and-forget (`void`) — never block the primary operation
- Files: `storydocsService.ts` (VS Code API), `storydocsUtils.ts` (pure path computation)

### Text Filter

- Search tree by ID/title substring via magnifier icon or `devstories.textFilter` command
- Activating text filter clears any active sprint filter
- Ancestor nodes remain visible when a descendant matches
- Context key: `devstories:hasTextFilter`

### Sprint Burndown Chart

- WebviewView below tree view (SVG), auto-refreshes on store/config/filter changes
- Uses `burndownUtils.ts` for date/point calculations, `burndownSvgRenderer.ts` for rendering
- Sprint dates derived from `firstSprintStartDate` + `length` in config

### Frontmatter Validation & IntelliSense

- `frontmatterValidator.ts`: Ajv-based validation against JSON Schemas in `schemas/`
- `frontmatterDiagnostics.ts`: Reports errors in VS Code Problems panel
- `frontmatterCompletionProvider.ts`: Autocomplete for all frontmatter fields + `[[ID]]` references

### Progress Indicators (`storiesProviderUtils.ts`)

- 6-stage progress circles: `["○", "◎", "◔", "◐", "◕", "●"]`
- Formula: `PROGRESS_CIRCLES[Math.round((statusIndex / firstCompletionIndex) * 5)]`
- Completion statuses (any with `isCompletion: true`) → `●`
- Post-completion icons by exact status ID: `blocked → ⊘`, `deferred → ⏸`, `superseded → ⊖`, `cancelled → ⊗`
- Unknown post-completion statuses fall back to `○`
- If no `isCompletion` flag exists, falls back to position-based mapping over the full array

### Status Bar

- Shows story-point progress for filtered sprint
- Calculations in `statusBarUtils.ts`, uses `isCompletion` flag from statuses

### Tasks

- **Require StoryDocs enabled** — tasks live at `{storydocsRoot}/stories/{STORY-ID}/tasks/`
- **Composite key pattern** — Store uses `"${storyId}::${taskId}"` because task IDs are only unique per story
- **TaskWatcher** watches `stories/*/tasks/*.md` in the storydocs root. Recreated when `storydocsRoot` changes in config.
- **Auto-healing** — `normalizeTaskFrontmatter()` in `taskParserUtils.ts` resolves field aliases, derives `story`/`id` from path/filename, applies defaults. If normalization changes anything, the canonical frontmatter is written back to disk.
- **Field aliases**: `task_id→id`, `story_id/parent_story→story`, `agent/assignee→assigned_agent`, `type→task_type` (only if value looks like a task type, not a story type like "feature")
- **Path is authoritative**: `story` is always derived from the folder path, never from the frontmatter field
- **Tree view**: Tasks shown as children of stories. `contextValue = "task"`. Sorted by priority ASC, then task ID numeric suffix ASC.
- **Create Task wizard**: story selection → title → task type. Command: `devstories.createTask`
- **changeStatus for tasks**: In `extension.ts`, uses `isTask(item) ? store.getTask(\`${item.story}::${item.id}\`) : undefined` to construct the composite key from the VS Code tree item data

## Adding a New Feature — Checklist

1. **Define types** in `src/types/` if new data structures needed
2. **Update schemas** in `schemas/` if new frontmatter fields or config options
3. **Update ConfigData** in `configServiceUtils.ts` (interface + `parseConfigJsonContent()` + `mergeConfigWithDefaults()`) if config changes
4. **Add pure logic** in a `*Utils.ts` file — unit-testable without VS Code API
5. **Add VS Code integration** in the main module (commands, services, providers)
6. **Wire into extension.ts** — instantiate, subscribe to events, register commands, add to `context.subscriptions`
7. **Hook into existing flows** if the feature reacts to create/move/delete:
   - Create commands accept optional service params (last parameter, optional)
   - Drag-and-drop controller accepts services via constructor
   - Store events (`onDidUpdate`, `onWillDeleteNode`) for reactive behavior
8. **Register command** in `package.json` under `contributes.commands` (and menus if needed); use `"category": "DevStories"` instead of prefixing the title
9. **Write tests** — unit tests in `src/test/unit/`, integration in `src/test/suite/`
10. **Update docs** — CHANGELOG.md (unreleased section), README.md, this file

### Pattern: Passing Services to Commands

Create commands accept optional trailing parameters for cross-cutting services:

```typescript
// Example: createStory.ts
export async function executeCreateStory(
  store: Store,
  preselectedEpicId?: string,
  storydocsService?: StorydocsService, // optional — call service.ensureFolder() after file write
): Promise<boolean>;
```

### Pattern: Wiring Services into Drag-and-Drop

The `StoriesDragAndDropController` constructor accepts optional services. Move functions call service methods fire-and-forget after the file write succeeds.

## Testing

### Commands

- `npm test` — Vitest unit tests (~1041 tests, ~45 files)
- `npm run test:integration` — @vscode/test-electron (compiles first, runs in extension host)
- `npx tsc --noEmit` — Type check
- `npm run lint` — ESLint 9 (flat config)

### TDD Workflow

1. Write failing test (Red)
2. Implement minimal code to pass (Green)
3. Refactor
4. Verify: `npm test` + `npx tsc --noEmit` + `npm run lint`

### Test Organization

- Every `*Utils.ts` file has a matching `*.test.ts` in `src/test/unit/`
- Command tests mock VS Code API (showInputBox, showQuickPick, etc.) and verify file writes
- Schema tests (`schemas.test.ts`) validate all JSON schemas against sample data

## Key Dependencies

### Runtime

- **gray-matter**: YAML frontmatter parsing (parser, changeStatus, autoTimestamp, inbox conversion)
- **ajv** + **ajv-formats**: JSON Schema validation for frontmatter diagnostics

### Dev

- **Vitest**: Unit tests
- **@vscode/test-electron**: Integration tests
- **esbuild**: Extension bundling
- **TypeScript** 5.9, **ESLint** 9 (flat config)

## VS Code Extension Specifics

### Activation Events

Extension activates when:

- `.devstories/` directory exists in workspace
- User runs init command
- Workspace contains story files

### Registered Commands (24+)

`init`, `createStory`, `createEpic`, `createTheme`, `createTask`, `createStoryMenu`, `quickCapture`, `changeStatus`, `pickSprint`, `setCurrentSprint`, `sortStories`, `switchToBreakdown`, `switchToBacklog`, `clearSprintFilter`, `openEpic`, `openTheme`, `saveAsTemplate`, `textFilter`, `clearTextFilter`, `reconcileStorydocs`, `browseStorydocs`

### Context Keys

- `devstories:viewMode` — `'breakdown'` | `'backlog'`
- `devstories:hasSprintFilter` — boolean
- `devstories:hasTextFilter` — boolean
- Welcome state keys (NoFolder, NoEpics, HasContent)

### Views

- Tree view: `devstories.views.explorer`
- Burndown webview: `devstories.views.burndown`

### Performance

- Parse only on `Store.load()` (lazy)
- File watcher events debounced (100ms), tree refresh debounced (50ms)
- Parsed data cached in Store Maps, invalidated on file change

## Common Pitfalls

1. **Don't bypass the Store** — UI should never read files directly
2. **Auto-timestamp** — `updated` field auto-updates on save via AutoTimestamp
3. **Link resolution** — `[[ID]]` links resolve for stories, epics, AND themes; use store `filePath` not ID-based guessing (filenames are kebab-cased)
4. **Frontmatter preservation** — Use gray-matter parse/stringify to preserve markdown content when updating YAML
5. **Event loops** — Avoid infinite loops where file save triggers watcher triggers save
6. **Epics don't have sprints** — Only stories have sprint fields. Epics and themes derive timing from descendant stories.
7. **Windows FileSystemWatcher race** — After creating files programmatically, call `store.reloadFile(uri)` — the watcher can be delayed on Windows
8. **completed_on management** — `changeStatus` must set `completed_on` when transitioning to a completion status and clear it when moving away
9. **isCompletion vs last status** — Progress calculations check `isCompletion` flag first; fall back to last status in array if no status has the flag
10. **Story points parallel array** — `storypoints[]` must stay index-aligned with `sizes[]` in config
11. **StoryDocs fire-and-forget** — StorydocsService calls must never block or fail the primary operation (create/delete). Always use `void service?.ensureFolder(...)` or `void service?.cleanupEmptyFolder(...)`. No moveFolder exists — the flat layout eliminates folder moves.
12. **Text filter clears sprint filter** — Activating `textFilter` programmatically clears `sprintFilterService` to search across all sprints
13. **Inbox conversion preserves existing frontmatter** — When converting inbox/spike files, existing fields are kept; only ID, sprint, epic/theme, and priority are overwritten from drop context
14. **Task composite keys** — Store uses `"${storyId}::${taskId}"` as the Map key. When looking up tasks from tree items, you must construct this composite key from `item.story` and `item.id` (the tree item's `.id` property is already composite, but command handlers receive the raw data element, not the TreeItem).
15. **reloadFile() routing order** — `/tasks/` must be checked **before** `/stories/` because task paths contain both segments. If reordered, task changes silently route to `parseAndAddStory()` and fail.
16. **Task path is authoritative** — `normalizeTaskFrontmatter()` always derives the `story` field from the folder path, never from what the user wrote in frontmatter. Same for `id` (derived from filename).
17. **Task auto-healing writes** — If normalization changes frontmatter, the store writes the canonical version back to disk. This creates a re-entrant file change event; the store has a loop guard to prevent infinite cycles.
18. **gray-matter date round-tripping** — gray-matter converts YAML date strings (`2026-03-23`) to JS `Date` objects on parse. `matter.stringify()` then outputs full ISO timestamps (`2026-03-23T00:00:00.000Z`). Call `normalizeDatesInData(parsed.data)` from `dateUtils.ts` after every `matter(content)` parse to convert `Date` objects back to `YYYY-MM-DD` strings before writing.
19. **Post-completion icon IDs are exact** — The `POST_COMPLETION_ICONS` map uses exact status IDs: `blocked`, `deferred`, `superseded`, `cancelled`. Using different IDs (e.g., `on_hold` instead of `deferred`) will fall back to `○`.
20. **Command titles use category, not prefix** — Commands use `"category": "DevStories"` in package.json, not `"title": "DevStories: ..."`. VS Code shows category in Command Palette but omits it from context menus, keeping menus clean.

## File Structure on Disk

```
your-project/
├── .devstories/
│   ├── config.json
│   ├── themes/
│   │   └── THEME-001-platform.md
│   ├── epics/
│   │   └── EPIC-0001-user-auth.md
│   ├── stories/
│   │   └── DS-00001-login-form.md
│   ├── inbox/                    # Staging: raw ideas
│   ├── spikes/                   # Staging: time-boxed research
│   └── templates/
│       ├── feature.md
│       └── code.template.md      # Task templates
└── docs/storydocs/               # When StoryDocs enabled
    ├── themes/THEME-001/
    ├── epics/EPIC-0001/
    └── stories/DS-00001/
        └── tasks/                # Task files live here
            └── TASK-001-implement-validation.md
```

## Dogfooding

DevStories manages its own development. The `.devstories/` directory in this repo contains all stories and epics tracked by the extension itself.

## Session Protocol

For long-running development across multiple sessions:

1. **Start**: Run `pwd` and `date`, then `./init.sh` to verify environment
2. **Context**: Read last ~100 lines of `claude-progress.txt` (use `tail -100`)
3. **Focus**: Pick ONE story from backlog, update progress file with "in_progress"
4. **Implement**: Write tests first, then code (TDD)
5. **Verify**: Run tests, manually verify in Extension Development Host
6. **End**: Update story file and progress log
7. **Commit**: Create feature branch, commit there, never directly on main

**Important**:

- Never commit directly to main branch — use feature branches
- Always use `--no-gpg-sign` flag when committing

**PR workflow** (branch protection enabled on main):

```bash
git push -u origin <branch-name>
gh pr create --title "type: description (DS-XXX)" --body "..."
gh pr view <PR#> --json statusCheckRollup
gh pr merge <PR#> --admin --squash --delete-branch
```

**Key scripts**:

- `init.sh` — Environment setup and test runner
- `scripts/ds-status.sh` — Story/epic status helper (`stories`, `todo`, `next`)
- `scripts/archive-progress.sh` — Archive progress file when >1000 lines

**Testing notes**:

- User manually verifies in Extension Development Host — do NOT launch it automatically
- Webview testing: add manual test checklist to story acceptance criteria
