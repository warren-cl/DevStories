# Changelog

All notable changes to DevStories will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note:** Starting with v1.0.0, detailed release notes are auto-generated on [GitHub Releases](https://github.com/dhavalsavalia/devstories/releases).

## [Unreleased - Proposed version 2 features]

### Added

- **Theme Management**: Create and manage themes as a top-level grouping above epics
- **Dual Views**: Toggle between Work Breakdown (Theme → Epic → Story hierarchy) and Backlog (Sprint → Story flat list) via title bar buttons
- **Story Points**: Effort-based progress tracking via `storypoints` array in config (index-aligned with `sizes`); status bar and progress indicators now report points instead of story count
- **Current Sprint**: Added current sprint selector and title bar display; persists to `config.json`
- **Right-Click Context Menus**: Create Story on Epic, Create Epic on Theme / No Theme, Open Theme, Change Status on Theme
- **Sort Stories**: Sort tree view by priority, date, or ID via title bar button; successive clicks flip direction
- **Set Current Sprint**: Update the active sprint directly from the tree view title bar
- **Drag-and-Drop**: Reassign stories between epics, epics between themes (Breakdown view); reorder stories by sprint and priority (Backlog view)
- **Orphan Collection**: Orphaned epics (no theme) and stories (no/invalid epic) collected under virtual sentinel nodes; broken files surfaced in tree
- **Sprint Burndown Chart**: Inline SVG burndown in the sidebar below the tree view — ideal vs actual lines, auto-refreshes on store/config/filter changes
- **Kebab-Case Filenames**: Stories and epics now created with title slugs (e.g. `DS-00001-login-form.md`)
- **`date_done` Field**: Auto-set when a story reaches a completion status, auto-cleared when moved away to support sprint burndown chart.
- **`isCompletion` Status Flag**: Defines end of user story process.  Place "Cancelled", "Deferred" status after `isCompletion` flagged status to support correct user story progres pie chart icon selection.
- **`isExcluded` Status Flag**: Fine-grained control over which statuses count as done or are excluded from burndown
- **Expanded Default Sizes**: `XXS` and `XXL` added to default size options, can be tailored to other values.  Remember to also update story points.
- **Theme Autocomplete**: `[[THEME-ID]]` links, `theme:` field completions, and theme hover previews in IntelliSense providers
- **Prioritisation**: Added prioritisation for themes and epics to enable sorting on priorities.

### Changed

- **NB** Story IDs now zero-padded to 5 digits (was 3); Epic IDs to 4 digits (was 3) - requires existing user story filename migration.
- file path construction.  Enabled for use on Windows, not just Linux variants.
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
