# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DevStories is a VS Code extension for lightweight story management using markdown files. Stories live in `.devstories/` as version-controlled markdown files, eliminating the need for external tools like JIRA.

**Current Status:** v1.0.0 released. Version 2 proposal in progress on `feat/version-2-proposal` branch — adds themes, dual view modes, drag-and-drop, burndown charts, and story-point tracking.

## Architecture

### Core Design Principles

1. **Markdown-first**: Stories are markdown files with YAML frontmatter, not database records
2. **Git as sync**: Version control is the source of truth, no external databases
3. **VS Code native**: Uses VS Code Extension API, no external services
4. **TDD approach**: Write tests before implementation (Red → Green → Refactor)

### Directory Structure

```
DevStories/
├── src/
│   ├── extension.ts              # Entry point — registers all commands, providers, views
│   ├── core/
│   │   ├── parser.ts             # Frontmatter parsing (gray-matter) for stories, epics, themes
│   │   ├── store.ts              # In-memory cache (stories, epics, themes, brokenFiles Maps)
│   │   ├── watcher.ts            # FileSystemWatcher for .devstories/ changes
│   │   ├── configService.ts      # Reads/watches config.json, exposes ConfigData + events
│   │   ├── configServiceUtils.ts # Pure functions: parseConfig, mergeDefaults, getSizePoints, isCompletedStatus
│   │   ├── sortService.ts        # Session-only sort state (key + direction) with event emitter
│   │   ├── sprintFilterService.ts# Sprint view-filter state + events
│   │   ├── autoFilterSprint.ts   # Auto-apply sprint filter from config
│   │   ├── autoTimestamp.ts      # Auto-update 'updated' field on save
│   │   ├── logger.ts             # Output channel logger
│   │   └── welcomeContext.ts     # Welcome/empty-state detection
│   ├── commands/
│   │   ├── init.ts               # Initialize .devstories/ directory
│   │   ├── createStory.ts        # Create story (supports preselected epic from context menu)
│   │   ├── createEpic.ts         # Create epic (supports preselected theme from context menu)
│   │   ├── createTheme.ts        # Create theme
│   │   ├── quickCapture.ts       # Cmd+Shift+S quick story capture
│   │   ├── changeStatus.ts       # Change status on story/epic/theme (manages date_done)
│   │   ├── pickSprint.ts         # View-only sprint filter picker
│   │   ├── setCurrentSprint.ts   # Persist current sprint to config.json
│   │   ├── sortStories.ts        # QuickPick sort order selection
│   │   ├── saveAsTemplate.ts     # Save story as reusable template
│   │   ├── createStoryMenu.ts    # Multi-option story creation menu
│   │   ├── errorHandler.ts       # wrapCommand() error boundary
│   │   └── *Utils.ts             # Pure-function companions (testable without VS Code API)
│   ├── providers/
│   │   ├── storyHoverProvider.ts  # [[ID]] hover preview + field descriptions
│   │   ├── storyLinkProvider.ts   # [[ID]] clickable DocumentLinks
│   │   └── frontmatterCompletionProvider.ts  # Autocomplete for status, type, size, sprint, epic, theme, [[ID]]
│   ├── validation/
│   │   ├── frontmatterValidator.ts   # Ajv-based schema + cross-file validation
│   │   └── frontmatterDiagnostics.ts # VS Code DiagnosticCollection provider
│   ├── view/
│   │   ├── storiesProvider.ts     # TreeDataProvider — Breakdown (Theme→Epic→Story) & Backlog (Sprint→Story)
│   │   ├── storiesProviderUtils.ts# Sorting, status indicators, ViewMode type
│   │   ├── storiesDragAndDropController.ts  # Drag-and-drop: reassign epics/stories, reorder by priority
│   │   ├── backlogDropHandler.ts  # Backlog-specific drop logic with priority bumping
│   │   ├── burndownViewProvider.ts# Sprint burndown WebviewView (SVG chart)
│   │   ├── burndownUtils.ts       # Pure burndown calculation functions
│   │   ├── burndownSvgRenderer.ts # SVG/HTML rendering for burndown chart
│   │   ├── statusBar.ts          # Status bar progress (story-point based)
│   │   └── statusBarUtils.ts     # Pure stats/formatting functions
│   ├── types/
│   │   ├── story.ts              # Story interface + StoryType, StorySize, StoryStatus
│   │   ├── epic.ts               # Epic interface (with theme + priority fields)
│   │   ├── theme.ts              # Theme interface (top-level grouping)
│   │   ├── brokenFile.ts         # BrokenFile interface (parse failures shown in tree)
│   │   └── sprintNode.ts         # SprintNode virtual tree node for Backlog view
│   ├── utils/
│   │   ├── linkResolver.ts       # Resolve [[ID]] to file path (story/epic/theme)
│   │   ├── inputValidation.ts    # Title/name validation for stories, epics, themes
│   │   └── filenameUtils.ts      # toKebabCase() for filename slugs
│   └── test/
│       ├── suite/                # @vscode/test-electron integration tests
│       └── unit/                 # Vitest unit tests
├── schemas/                      # JSON Schema definitions
│   ├── devstories.schema.json    # config.json schema
│   ├── story.schema.json         # Story frontmatter schema
│   ├── epic.schema.json          # Epic frontmatter schema
│   ├── theme.schema.json         # Theme frontmatter schema
│   └── defs/common.schema.json   # Shared definitions (ID patterns, enums)
├── webview/                      # Tutorial/webview assets
├── docs/PRD/                     # Product requirements
└── package.json
```

## Data Flow Patterns

### Store-Centric Architecture
- **Store** (`src/core/store.ts`) is the single source of truth in memory
- Maintains four Maps: `stories`, `epics`, `themes`, `brokenFiles`
- All UI components (tree view, burndown, status bar) read from Store
- Store emits a single `onDidUpdate` event when data changes
- File changes trigger Store updates via Watcher; `store.reloadFile(uri)` allows immediate refresh after programmatic writes (avoids Windows FileSystemWatcher race)

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

### UI → File Flow
```
User clicks status in tree view
  ↓
Command: changeStatus(storyId, newStatus)
  ↓
updateStoryStatus() / updateEpicStatus() / updateThemeStatus() (gray-matter stringify)
  — manages date_done field on completion transitions
  ↓
File saved to disk
  ↓
FileWatcher detects change → Store reloads → UI refreshes
```

## Markdown Format Specification

### Story File Structure
```markdown
---
id: DS-00001
title: Login Form Implementation
type: feature              # feature | bug | task | chore
epic: EPIC-0001            # Optional — missing/empty routes to "No Epic" sentinel
status: todo               # Defined in config.json statuses
sprint: sprint-4
size: M                    # From config.json sizes array (default: XXS..XXL)
priority: 500              # Lower = higher priority (for drag-and-drop ordering)
assignee: ""
dependencies:
  - DS-00005
  - DS-00006
created: 2025-01-15
updated: 2025-01-20        # Auto-updated on save
date_done: 2025-02-01      # Auto-set when status reaches isCompletion, cleared otherwise
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

### Filename Convention
Files include a kebab-case slug: `DS-00001-login-form.md`, `EPIC-0001-user-auth.md`, `THEME-001-platform.md`

### Config File (`.devstories/config.json`)
Defines:
- ID prefixes: `storyPrefix`, `epicPrefix`, `themePrefix`
- Status workflow: `statuses[]` with `id`, `label`, optional `isCompletion` and `isExcluded` flags
- Sizes: `sizes[]` array (e.g., `["XXS","XS","S","M","L","XL","XXL"]`)
- Story points: `storypoints[]` parallel to sizes (e.g., `[1,2,4,8,16,32,64]`)
- Sprint config: `sprintSequence[]`, `current`, `length` (days), `firstSprintStartDate`
- Quick capture options, auto-filter setting, templates

See `schemas/devstories.schema.json` for the complete JSON Schema.

## Implementation Status

v1.0.0 shipped all original 23 stories across 5 phases (foundation, tree view, commands, links, board view). The project is now self-hosting via `.devstories/` in this repo.

**Version 2 (in progress):** Theme hierarchy, dual view modes, drag-and-drop, burndown charts, story-point tracking, IntelliSense & validation. See CHANGELOG.md [Unreleased] section.

## Testing Strategy

### Unit Tests (Vitest — `npm test`)
Test pure logic without VS Code API. Key test files:
- `parser.test.ts`: Story, epic, and theme frontmatter parsing
- `configService.test.ts`: Config parsing, storypoints, burndown config, isCompletion/isExcluded
- `statusBar.test.ts`: Effort-based progress (story points)
- `treeViewSorting.test.ts`: Sort by priority/date/ID, backlog view grouping
- `changeStatus.test.ts`: Status transitions, date_done management
- `burndownUtils.test.ts`: Sprint date ranges, burndown calculations
- `dragAndDrop.test.ts`, `backlogDropHandler.test.ts`: Drag-and-drop logic
- `createTheme.test.ts`, `setCurrentSprint.test.ts`, `sortService.test.ts`
- `frontmatterValidator.test.ts`, `schemas.test.ts`: Validation and JSON schemas

### Integration Tests (@vscode/test-electron — `npm run test:integration`)
Test VS Code API integration in a real extension host:
- `extension.test.ts`: Extension activation
- `storiesProvider.test.ts`: Tree rendering, view modes, tooltips
- `storyLinkProvider.test.ts`, `storyHoverProvider.test.ts`: Link/hover providers
- `configService.test.ts`, `statusBar.test.ts`: Live config + status bar
- `createStory.test.ts`, `createEpic.test.ts`: Command execution

### TDD Workflow
1. Write failing test (Red)
2. Implement minimal code to pass (Green)
3. Refactor (Refactor)
4. Commit when green

## Key Dependencies

### Runtime
- **gray-matter**: YAML frontmatter parsing (parser, changeStatus, autoTimestamp)
- **ajv** + **ajv-formats**: JSON Schema validation for frontmatter diagnostics

### Dev
- **Vitest**: Unit tests (`npm test`)
- **@vscode/test-electron**: Integration tests (`npm run test:integration`)
- **esbuild**: Extension bundling
- **TypeScript** 5.9, **ESLint** 9 (flat config)

## VS Code Extension Specifics

### Activation Events
Extension activates when:
- `.devstories/` directory exists in workspace
- User runs init command
- Workspace contains story files

### Package.json Contributions
- **Commands**: init, createStory, createEpic, createTheme, createStoryMenu, quickCapture, changeStatus, pickSprint, setCurrentSprint, sortStories, switchToBreakdown, switchToBacklog, clearSprintFilter, openEpic, openTheme, saveAsTemplate
- **Views**: Tree view (`devstories.views.explorer`) + Burndown webview (`devstories.views.burndown`)
- **Menus**: Title bar (view mode toggle, create theme, set sprint, filter, sort) + context menus (create story on epic, create epic on theme, change status, open file)
- **Keybindings**: `Cmd+Shift+S` for quick capture

### Performance Considerations
- **Lazy loading**: Parse stories only when Store.load() is called
- **Debouncing**: File watcher events debounced (100ms), tree refresh debounced (50ms)
- **Caching**: Parsed stories cached in Store, invalidated on file change
- **Limits**: Warn if >1000 stories in workspace

## Common Pitfalls to Avoid

1. **Don't bypass the Store**: UI should never read files directly—always go through Store
2. **Auto-timestamp behavior**: The `updated` field auto-updates on save via AutoTimestamp
3. **Link resolution**: `[[ID]]` links must resolve for stories, epics, AND themes; use store `filePath` not ID-based guessing (filenames are now kebab-cased)
4. **Frontmatter preservation**: Use gray-matter parse/stringify to preserve markdown content when updating YAML
5. **Event loops**: Avoid infinite loops where file save triggers watcher triggers save
6. **Epics don't have sprints**: Only stories have sprint associations. Epics and themes derive timing from descendant stories.
7. **Windows FileSystemWatcher race**: After creating files programmatically, call `store.reloadFile(uri)` — the watcher can be delayed on Windows
8. **date_done management**: `changeStatus` must set `date_done` when transitioning to a completion status and clear it when moving away
9. **isCompletion vs last status**: Progress calculations check `isCompletion` flag on statuses first; fall back to last status in array if no status has the flag
10. **Story points parallel array**: `storypoints[]` must stay index-aligned with `sizes[]` in config

## Development Workflow

When implementing a new story:
1. Read the story breakdown in `docs/PRD/features/02-story-breakdown.md`
2. Check dependencies—implement those first if missing
3. Write tests first (TDD approach)
4. Implement minimal code to pass tests
5. Update README.md checklist when story is complete

## Documentation References

- **Vision & Target Audience**: `docs/PRD/overview/01-vision.md`
- **Core Product Decisions**: `docs/PRD/overview/02-core-decisions.md`
- **Complete Markdown Spec**: `docs/PRD/specs/01-markdown-spec.md`
- **MVP Feature Breakdown**: `docs/PRD/features/01-mvp-features.md`
- **All 23 Stories**: `docs/PRD/features/02-story-breakdown.md`
- **Tech Stack Details**: `docs/PRD/architecture/01-tech-stack.md`

## Dogfooding

DevStories manages its own development. The `.devstories/` directory in this repo contains all stories and epics tracked by the extension itself.

## Claude Code Session Protocol

For long-running development across multiple sessions:

1. **Start**: Run `pwd` and `date`, then `./init.sh` to verify environment
2. **Context**: Read last ~100 lines of `claude-progress.txt` (use `tail -100`)
3. **Focus**: Pick ONE story from backlog, update progress file with "in_progress"
4. **Implement**: Write tests first, then code (TDD)
5. **Verify**: Run tests, manually verify in Extension Development Host
6. **End**: Update story file and progress log (see Documentation Strategy below)
7. **Commit**: Create feature branch, commit there, never directly on main

**Important**:
- Always run `pwd` at session start to confirm location
- Never commit directly to main branch - use feature branches
- Always use `--no-gpg-sign` flag when committing

**PR workflow** (branch protection enabled on main):
```bash
# 1. Push branch
git push -u origin <branch-name>

# 2. Create PR with template
gh pr create --title "type: description (DS-XXX)" --body "$(cat <<'EOF'
## Summary
- Bullet points of changes

## Related Issue
Closes DS-XXX

## Test Plan
- [x] Unit tests pass
- [x] Integration tests pass
- [ ] Manual verification done

## Checklist
- [x] Tests pass
- [x] Types check
- [x] Lint passes
- [x] Documentation updated
EOF
)"

# 3. Check CI status
gh pr view <PR#> --json statusCheckRollup

# 4. Admin merge (bypasses approval requirement)
gh pr merge <PR#> --admin --squash --delete-branch
```

Note: Self-approval not allowed on GitHub. Use `--admin` flag to bypass when you're the sole maintainer.

**Key files**:
- `init.sh` - Environment setup and test runner
- `claude-progress.txt` - Session-by-session work log (read tail only)
- `scripts/ds-status.sh` - Story/epic status helper
- `scripts/archive-progress.sh` - Archive old sessions when file gets large

**Status commands**:
```bash
./scripts/ds-status.sh           # Summary of all epics and stories
./scripts/ds-status.sh stories   # Detailed story list with titles
./scripts/ds-status.sh todo      # List only todo stories
./scripts/ds-status.sh next      # Show next story to work on
```

**Progress file management**:
```bash
# Archive when file exceeds ~1000 lines or ~15 sessions
./scripts/archive-progress.sh --keep 5
```

**Testing workflow (TDD)**:
1. Write failing test first (RED)
2. Implement minimal code to pass (GREEN)
3. Refactor if needed
4. User will manually verify in Extension Development Host (do NOT launch it automatically)

**Manual test workspace**: `/Users/dhavalsavalia/projects/devstories_test`
- 4 epics, 12 stories with varied sprints/statuses for visual verification
- User keeps this open and reloads as needed - do NOT launch it via code command

**Webview testing**: When implementing webview features, add manual test checklist to story acceptance criteria (e.g., "type in search box", "drag card between columns"). DOM/focus bugs are hard to catch with unit tests.

**UI/Design work**: Use the `frontend-design` skill for creating sharp, modern, developer-friendly UI components

## Documentation Strategy

**Goal**: Minimize redundancy, save tokens.

**Story files** - Keep minimal:
- Frontmatter (status, dates)
- Description + acceptance criteria (checkboxes)
- `## Decisions` section ONLY if non-obvious choices were made
- NO implementation notes (commit messages cover that)
- **Use wiki-style links**: When referencing other stories or epics, use `[[DS-XXX]]` or `[[EPIC-XXX]]` syntax for clickable hover-preview links

**Progress file** (`claude-progress.txt`):
- Session log for continuity between sessions
- Read last ~100 lines at session start (not full file)
- Archive when it exceeds ~1000 lines: `./scripts/archive-progress.sh`

**Commit messages**: Source of truth for what changed and why

**What to record where**:
| Info | Location |
|------|----------|
| What was done | Commit message |
| Why (decisions) | Story file `## Decisions` |
| Session context | Progress file |
| File changes | Git diff |
