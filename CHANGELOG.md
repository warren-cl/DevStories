# Changelog

All notable changes to DevStories will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note:** Starting with v1.0.0, detailed release notes are auto-generated on [GitHub Releases](https://github.com/dhavalsavalia/devstories/releases).

## [Unreleased - Proposed version 2 features]

### Added

- **Configurable Story Types**: Story types (previously hardcoded to `feature`, `bug`, `task`, `chore`, `spike`) are now fully configurable in `config.json` via the `storyTypes` object. Each type has a `template`, `description`, `icon` (VS Code ThemeIcon name), and `emoji`. Custom types appear throughout the UI: create-story wizard, quick capture, tree view icons, hover previews, and frontmatter autocomplete. The `type` frontmatter field now accepts any string matching a key in `storyTypes`.
- **Separate Template Roots**: The `templateRoot` config field has been split into `storyTemplateRoot` and `taskTemplateRoot`, allowing story and task templates to live in different folders. Existing `templateRoot` values are auto-migrated to both new fields on config upgrade.
- **Task Support**: Tasks are lightweight sub-items of stories, stored as markdown files inside StoryDocs folders (`stories/DS-00001/tasks/TASK-001-build-api.md`). Tasks appear as children of their parent story in the tree view, support status changes via the context menu, and are loaded/watched automatically when StoryDocs is enabled. Includes resilient parsing with field-name auto-heal (`task_id`→`id`, `story_id`→`story`, `completed`→`completed_on`) and composite keys (`story::taskId`) to avoid ID collisions across stories.
- **Theme Management**: Create and manage themes as a top-level grouping above epics
- **Dual Views**: Toggle between Work Breakdown (Theme → Epic → Story hierarchy) and Backlog (Sprint → Story flat list) via title bar buttons
- **Story Points**: Effort-based progress tracking via `storypoints` array in config (index-aligned with `sizes`); status bar and progress indicators now report points instead of story count
- **Current Sprint**: Added current sprint selector and title bar display; persists to `config.json`
- **Right-Click Context Menus**: Create Story on Epic, Create Epic on Theme / No Theme, Open Theme, Change Status on Theme
- **Sort Stories**: Sort tree view by priority, date, or ID via title bar button; successive clicks flip direction
- **Set Current Sprint**: Update the active sprint directly from the tree view title bar
- **Drag-and-Drop**: Reassign stories between epics, epics between themes (Breakdown view); reorder stories by sprint and priority (Backlog view); reorder tasks within a story by priority (both views). Tasks can be dropped on a sibling task (inserts below) or on their parent story (becomes highest priority). Same cascade-bump algorithm and sort-guard dialog as stories.
- **Orphan Collection**: Orphaned epics (no theme) and stories (no/invalid epic) collected under virtual sentinel nodes; broken files surfaced in tree
- **Sprint Burndown Chart**: Inline SVG burndown in the sidebar below the tree view — ideal vs actual lines, auto-refreshes on store/config/filter changes
- **Kebab-Case Filenames**: Stories and epics now created with title slugs (e.g. `DS-00001-login-form.md`)
- **`completed_on` Field**: Auto-set when a story reaches a completion status, auto-cleared when moved away to support sprint burndown chart.
- **`isCompletion` Status Flag**: Defines end of user story process.  Place "Cancelled", "Deferred" status after `isCompletion` flagged status to support correct user story progres pie chart icon selection.
- **Post-Completion Status Icons**: Statuses defined after `isCompletion` now display distinct icons in the tree view: blocked (⊘), deferred (⏸), superseded (⊖), cancelled (⊗). Unknown post-completion statuses fall back to an empty circle.
- **`isExcluded` Status Flag**: Fine-grained control over which statuses count as done or are excluded from burndown
- **Expanded Default Sizes**: `XXS` and `XXL` added to default size options, can be tailored to other values.  Remember to also update story points.
- **Theme Autocomplete**: `[[THEME-ID]]` links, `theme:` field completions, and theme hover previews in IntelliSense providers
- **Prioritisation**: Added prioritisation for themes and epics to enable sorting on priorities.
- **Inbox & Spikes**: New `.devstories/inbox/` and `.devstories/spikes/` staging folders for rough ideas and exploratory work. Files appear as collapsible sentinel nodes at the bottom of both Breakdown and Backlog views. Drag a file onto a sprint or story (Backlog) to convert it into a story with auto-generated ID and sprint assignment; drag onto an epic or theme (Breakdown) to convert into a story or epic. Existing frontmatter fields are preserved; missing fields are filled with sensible defaults.
- **Text Filter**: Search across the entire tree view via the magnifier icon in the title bar (or `devstories.textFilter` command). Filters stories, epics, themes, broken files, and inbox/spike files by ID and title substring (case-insensitive). Ancestor nodes remain visible when a descendant matches. Active filter is shown in the view title (e.g. `Stories: Search "login"`); a second icon clears it. Activating the filter also clears any active sprint filter.
- **`spike` Story Type**: New story type for time-boxed investigations and research. Appears alongside `feature`, `bug`, `task`, and `chore` in the create-story picker, frontmatter autocomplete, hover previews, and tree icons.
- **StoryDocs**: Opt-in flat document folders that mirror the `.devstories/` directory layout. Enable via `storydocs` in `config.json` to automatically create and maintain type-based folders (`themes/THEME-001/`, `epics/EPIC-0001/`, `stories/DS-00001/`) wherever you choose in your repo. Folders are created when nodes are created (including inbox/spike conversion) and cleaned up when empty. No folder moves on drag-and-drop — the flat layout means reparenting a node doesn't affect its storydocs folder. Includes a **Reconcile StoryDocs Folders** command to rebuild the full structure on demand.
- **Soft Archive & Restore**: Archive completed work by sprint without deleting it from the repo. `DevStories: Soft Archive Sprint...` moves completed stories up to a selected sprint into `.devstories/{archive.soft.devstories}` and, when StoryDocs is enabled, moves matching docs into `{storydocsRoot}/{archive.soft.storydocs}`. Eligible epics and themes cascade when all descendants are already archived or part of the same archive set and their current status has `canArchive: true`. Archived items remain visible in the tree with an `(archived)` marker and can be restored either in bulk via `DevStories: Restore from Archive...` or individually from the context menu. Bulk restore now restores the selected sprint and all newer archived sprints.

### Changed

- **Story Type is now config-driven**: The `type` field in story frontmatter is no longer validated against a hardcoded enum — it accepts any string matching a key in `config.json`'s `storyTypes` object. The JSON Schema (`common.schema.json`) changed from `enum` to `{ type: "string", minLength: 1 }`.
- **`templateRoot` → `storyTemplateRoot` + `taskTemplateRoot`**: The legacy `templateRoot` config field has been replaced with two separate fields. Config upgrade automatically migrates the old value to both new fields and removes `templateRoot`.
- **Bundled library templates removed**: The `@library/*` template reference system has been removed. All templates are now resolved from the configured `storyTemplateRoot` folder.
- **Quick capture type prefixes derived from config**: Quick capture type detection (e.g., `bug: fix login`) now matches exact config keys instead of hardcoded abbreviations. The `feat:` shorthand no longer maps to `feature` — use the full key `feature:` instead.
- **Tree view story icons from config**: Story type icons in the tree view now use the `icon` field from `storyTypes` config (rendered as VS Code ThemeIcons) instead of the static SVG story icon.
- **Progress Indicators**: Expanded from 5 to 6 stages (`○ ◎ ◔ ◐ ◕ ●`) for finer-grained visual feedback in the tree view
- **Command Palette Prefix**: Moved "DevStories:" from the command `title` to the `category` field across all commands — context menus now show clean names while the Command Palette retains the prefixed form
- **Config Schema v3**: Config upgrades now add archive defaults, sprint date defaults, task ID prefix/task type support, and `statuses[].canArchive` with `false` as the default when missing.
- **NB** Story IDs now zero-padded to 5 digits (was 3); Epic IDs to 4 digits (was 3) - requires existing user story filename migration.
- **`date_done` → `completed_on`**: The completion-date frontmatter field has been renamed from `date_done` to `completed_on`. Existing files using `date_done` should be updated — the field will not be recognised under the old name.
- **Archive Path Handling**: Archive/storydocs path computation now normalizes path separators so archive detection and move targets behave consistently on Windows, macOS, and Linux.
- `epic` field is now optional in stories — missing/empty values route to "No Epic" sentinel
- Link resolution uses store `filePath` instead of ID-based path guessing (supports kebab-case filenames)
- `pickSprint` simplified to use `sprintSequence` from config only
- `test:integration` script now runs `compile-tests` and `compile` before test execution

### Fixed

- Status indicators in the tree view now derive from position in the config workflow (works with any custom status setup, not just the default)
- Size suggestions when creating stories now use the order defined in `config.json` rather than a hardcoded list
- Completion checks (progress bar, status bar) now respect the configured workflow instead of hardcoded `done` status
- Custom sizes (e.g. `XXS`, `XXL`) no longer trigger a false validation error in `config.json`
- Store refresh on Windows: `store.reloadFile()` called after programmatic file creation to avoid FileSystemWatcher race conditions
- Burndown chart "today" now derived from local system clock instead of UTC, so the actual line plots correctly for users in timezones ahead of UTC
- Burndown x-axis date labels now use `Intl.DateTimeFormat` for locale-aware formatting (e.g. "3 Mar" in en-AU, "Mar 3" in en-US) instead of hardcoded English month names
- Inbox drag-to-convert now always assigns the drop target's epic/theme, overriding any pre-existing `epic` field in the source file's frontmatter
- Frontmatter date round-tripping: gray-matter auto-converts YAML date strings to JavaScript `Date` objects, causing `matter.stringify()` to emit full ISO timestamps (e.g. `2026-03-22T00:00:00.000Z`). All parse→modify→write paths now normalize dates back to `YYYY-MM-DD` before serialization.
- Change Status and Browse StoryDocs context menu commands now work correctly on task nodes
- File watcher routing: task file changes (paths containing both `/stories/` and `/tasks/`) are now correctly routed to the task parser instead of the story parser

### Security

- Added `overrides` for `diff` (^8.0.3) and `serialize-javascript` (^7.0.3) to resolve `npm audit` vulnerabilities

### Dependencies

- TypeScript 5.4 → 5.9, Vitest 1.6 → 4.0, ESLint 9.39 → 9.27, glob 10.3 → 13.0
- `@vscode/test-electron` 2.4 → 2.5, `ajv` 8.17 → 8.18, `typescript-eslint` 8.48 → 8.56
- Added `@eslint/js` ^9.27.0

## [1.0.0] - 2025-12-XX

### Added

- **Story & Epic Management**: Create and manage stories/epics as markdown files with YAML frontmatter
- **Tree View Sidebar**: Hierarchical view of epics and stories with status icons and sprint filtering
- **Quick Capture** (`Cmd+Shift+S`): Rapid story creation with inline type notation (`bug:`, `feat:`, etc.)
- **Wiki-Style Links**: `[[STORY-ID]]` syntax with clickable links and hover previews
- **Template System**: Save stories as templates, load from `.devstories/templates/`
- **Status Bar Progress**: Visual sprint progress indicator with click-to-filter
- **Auto-Timestamps**: `updated` field automatically set on file save
- **Configurable Workflow**: Custom statuses, sprints, sizes, and ID prefixes via `config.yaml`

### Notes

- Built and managed using itself
- No external dependencies - all data stored as local markdown files
- Git-native: version control is your project management sync
