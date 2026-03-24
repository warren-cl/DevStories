# DevStories

[![CI](https://github.com/dhavalsavalia/DevStories/actions/workflows/ci.yml/badge.svg)](https://github.com/dhavalsavalia/DevStories/actions/workflows/ci.yml)
[![Marketplace Version](https://vsmarketplacebadges.dev/version-short/DhavalSavalia.devstories.svg)](https://marketplace.visualstudio.com/items?itemName=DhavalSavalia.devstories)
[![Downloads](https://vsmarketplacebadges.dev/downloads-short/DhavalSavalia.devstories.svg)](https://marketplace.visualstudio.com/items?itemName=DhavalSavalia.devstories)
[![Installs](https://vsmarketplacebadges.dev/installs-short/DhavalSavalia.devstories.svg)](https://marketplace.visualstudio.com/items?itemName=DhavalSavalia.devstories)
[![Rating](https://vsmarketplacebadges.dev/rating-short/DhavalSavalia.devstories.svg)](https:/Work
/marketplace.visualstudio.com/items?itemName=DhavalSavalia.devstories)

**Lightweight story management in VS Code. Stories that travel with your code.**

Stories live as markdown files in your repo—version-controlled, AI-accessible, and completely free.

![DevStories Demo](assets/demo.gif)

![Tree View](assets/screenshots/tree-view.png)

## Features

### 📁 Dual Views

Two ways to see your work:

- **Work Breakdown View** — Theme → Epic → Story hierarchy for big-picture planning
- **Backlog View** — Sprint → Story grouping for day-to-day execution

Switch between them with the toggle button in the view title bar.

### 🎨 Themes, Epics, Stories & Tasks

Organize work in a four-level hierarchy: **Themes** group related epics, **Epics** group related stories, **Stories** are individual units
of work, and **Tasks** break stories into actionable sub-items. Right-click a theme to create an epic under it, an epic to create a story
under it, or a story to create a task. Epics do not have to have Themes, Stories do not have to have Epics. Orphans are collected.

### ✅ Tasks

Break stories down into granular, agent-assignable tasks:

- **Task types** are fully configurable — define types like `code`, `document`, `investigate`, `validate`, etc. in `config.json`, each with
  its own template
- **Agent assignment** — optionally assign tasks to agents (scans `.github/agents/*.md` for available agents)
- **Auto-healing** — task frontmatter is automatically normalized on load (field aliases resolved, defaults applied, IDs derived from
  filenames)
- **Dependencies** — tasks can declare dependencies on other tasks
- Tasks appear as **child nodes under their parent story** in both Breakdown and Backlog views
- Task files live in the StoryDocs folder structure: `{storydocsRoot}/stories/{STORY-ID}/tasks/{TASK-ID}-slug.md`

> **Note:** Tasks require [StoryDocs](#-storydocs) to be enabled — see [Configuring Tasks](#configuring-tasks) below.

### ⚡ Quick Capture

Press `Cmd+Shift+S` to capture ideas without leaving your code. Supports type prefixes (`bug:`, `feat:`) and inline notes.

![Quick Capture](assets/screenshots/quick-capture.png)

### 🔗 Inline Preview & Links

Hover over any `[[DS-00001]]`, `[[EPIC-0001]]`, or `[[THEME-001]]` link to see the full card—status, type, size, sprint, story points, and
more. Click to open the file.

![Hover Preview](assets/screenshots/hover-preview.png)

### 📊 Story-Point Progress & Sprint Burndown

- **Status bar** shows real-time story-point progress for your filtered sprint
- **Sprint Burndown chart** (webview panel) visualizes remaining work over time using configurable sprint dates and story-point values

![Status Bar](assets/screenshots/status-bar.png)

### ↕️ Drag & Drop

Reorder stories and reassign them between epics or sprints by dragging and dropping in the tree view. Priority is automatically updated.

Tasks can also be reordered within their parent story — drag a task onto a sibling to place it just below, or onto the parent story node to make it the highest priority task. Works in both Breakdown and Backlog views.

### 📥 Inbox & Spikes

Capture ideas and exploratory work without committing to a fully-formed story:

- **Inbox** (`.devstories/inbox/`) — raw ideas and captured thoughts waiting to be refined
- **Spikes** (`.devstories/spikes/`) — time-boxed research or investigation notes

Create any `.md` file in either folder (optionally prefix with a date: `2026-03-03-dark-mode.md`). The files appear as expandable sentinel
nodes at the bottom of both the Breakdown and Backlog views.

**Converting to a story or epic** — just drag and drop:

| Drop target (Backlog view) | Result                                               |
| -------------------------- | ---------------------------------------------------- |
| Sprint node                | New story assigned to that sprint, placed at the top |
| Story node                 | New story inserted at that story's priority position |

| Drop target (Breakdown view) | Result                                      |
| ---------------------------- | ------------------------------------------- |
| Epic node                    | New story added under that epic             |
| Theme node                   | New epic created under that theme           |
| Story node                   | New story inserted at that story's priority |
| No Epic / No Theme sentinel  | New story/epic with no parent assigned      |

Any existing frontmatter in the file (title, type, size, status, etc.) is preserved during conversion. The ID, sprint, epic/theme, and
priority are always set from the drop context. The date prefix is stripped from the filename automatically.

### ➕ Create Stories Your Way

Use quick capture for fast ideas or the full form for detailed stories with templates.

![Create Story Menu](assets/screenshots/create-story-menu.png)

### 🔍 Sort & Filter

- **Sort** stories by priority, creation date, or ID
- **Filter** by sprint to focus on current work — auto-filter on load is configurable
- **Search** — filter the entire tree by text using the magnifier icon in the title bar; matches stories, epics, themes, inbox/spike files
  by ID and title (case-insensitive); ancestor nodes stay visible when a descendant matches; activating search clears the sprint filter
  automatically
- **Set Current Sprint** from the view title bar

### ✅ Frontmatter Validation & Autocomplete

- **Diagnostics** — Real-time validation of story/epic/theme frontmatter against JSON Schema (missing fields, invalid values, broken
  references)
- **Autocomplete** — IntelliSense suggestions for `status`, `type`, `size`, `sprint`, `epic`, `theme`, and `[[ID]]` references

### 📂 StoryDocs

Maintain flat, type-based document folders that mirror your `.devstories/` directory layout — perfect for storing design docs, meeting
notes, screenshots, or any files related to a theme, epic, or story.

Enable StoryDocs in `.devstories/config.json`:

```json
{
  "storydocs": {
    "enabled": true,
    "root": "docs/storydocs"
  }
}
```

Once enabled:

- **Folders are created automatically** when you create a theme, epic, or story (e.g. `docs/storydocs/stories/DS-00001/`)
- **No folder moves on drag-and-drop** — the flat layout means reparenting a node doesn't affect its storydocs folder
- **Empty folders are cleaned up** when the corresponding node is deleted
- **Reconcile command** — run `DevStories: Reconcile StoryDocs Folders` from the Command Palette to rebuild the full folder structure on
  demand

Example folder structure:

```
docs/storydocs/
├── themes/
│   ├── THEME-001/
│   └── THEME-002/
├── epics/
│   ├── EPIC-0001/
│   └── EPIC-0002/
└── stories/
    ├── DS-00001/
    └── DS-00002/
```

### 🔄 Progress Indicators

The tree view shows a visual progress circle next to each item based on its position in your status workflow:

| Icon | Meaning                                          |
| ---- | ------------------------------------------------ |
| ○    | Not started (first status)                       |
| ◎    | Early progress                                   |
| ◔    | Approaching midpoint                             |
| ◐    | Midpoint                                         |
| ◕    | Nearing completion                               |
| ●    | Completed (any status with `isCompletion: true`) |

Statuses **after** the completion status get dedicated icons:

| Icon | Status     |
| ---- | ---------- |
| ⊘    | Blocked    |
| ⏸    | Deferred   |
| ⊖    | Superseded |
| ⊗    | Cancelled  |

The mapping is automatic — just define your statuses in `config.json` and the indicators scale to fit.

### More Features

- **Story Templates** — Different templates per type (feature/bug/task/chore/spike)
- **Task Templates** — Each task type can have its own template file
- **Auto-timestamps** — `updated` field auto-updates on save
- **Completion Tracking** — `completed_on` is auto-set when a story or task reaches a completion status, and cleared when moved back
- **Status Toggle** — Right-click stories, epics, themes, or tasks to change status
- **Clickable Links** — `[[ID]]` links open the corresponding story, epic, or theme file
- **Configurable Sizes & Story Points** — Map t-shirt sizes (XXS–XXL) to story-point values for progress tracking
- **Broken File Detection** — Parse failures are surfaced in the tree view for easy debugging

## Quick Start

1. **Install** from VS Code Marketplace (search "DevStories")

2. **Initialize** — Run `DevStories: Initialize Project` from Command Palette (`Cmd+Shift+P`)

3. **Create a theme** — Run `DevStories: Create Theme` to define a high-level work area

4. **Create an epic** — Right-click a theme → **Create Epic**, or run `DevStories: Create Epic`

5. **Start capturing stories** — Press `Cmd+Shift+S` or right-click an epic → **Create Story**

6. **Break stories into tasks** — Right-click a story → **Create Task** (requires StoryDocs enabled)

## Keyboard Shortcuts

| Action          | Shortcut      |
| --------------- | ------------- |
| Quick Capture   | `Cmd+Shift+S` |
| Command Palette | `Cmd+Shift+P` |

## Configuration

DevStories stores configuration in `.devstories/config.json`:

```json
{
  "version": 2,
  "project": "My Project",
  "idMode": "auto",
  "idPrefix": {
    "theme": "THEME",
    "epic": "EPIC",
    "story": "STORY",
    "task": "TASK"
  },
  "taskTypes": {
    "code": "code.template.md",
    "document": "document.template.md",
    "investigate": "investigate.template.md",
    "validate": "validate.template.md"
  },
  "statuses": [
    { "id": "todo", "label": "To Do" },
    { "id": "in_progress", "label": "In Progress" },
    { "id": "review", "label": "Review" },
    { "id": "done", "label": "Done", "isCompletion": true },
    { "id": "cancelled", "label": "Cancelled", "isExcluded": true }
  ],
  "sprints": {
    "current": "sprint-1",
    "sequence": ["sprint-1", "sprint-2", "backlog"],
    "length": 14,
    "firstSprintStartDate": "2025-01-06"
  },
  "sizes": ["XXS", "XS", "S", "M", "L", "XL", "XXL"],
  "storypoints": [1, 2, 4, 8, 16, 32, 64],
  "quickCapture": {
    "defaultToCurrentSprint": false
  },
  "autoFilterCurrentSprint": true,
  "storydocs": {
    "enabled": true,
    "root": "docs/storydocs"
  }
}
```

### Configuration Reference

| Field                                 | Description                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `version`                             | Schema version (always `1` or `2`)                                                           |
| `idMode`                              | `"auto"` for sequential IDs, `"manual"` for user-entered IDs                                 |
| `idPrefix.theme`                      | Prefix for theme IDs (e.g., `THEME`)                                                         |
| `idPrefix.epic`                       | Prefix for epic IDs (e.g., `EPIC`)                                                           |
| `idPrefix.story`                      | Prefix for story IDs (e.g., `DS`, `STORY`)                                                   |
| `idPrefix.task`                       | Prefix for task IDs (e.g., `TASK`)                                                           |
| `taskTypes`                           | Map of task type ID → template filename (e.g., `{ "code": "code.template.md" }`)             |
| `templateRoot`                        | Root folder for templates, relative to repo root (defaults to `.devstories/templates`)       |
| `statuses[].isCompletion`             | Marks a status as "done" for progress & burndown calculations                                |
| `statuses[].isExcluded`               | Excludes stories with this status from burndown (e.g., cancelled)                            |
| `sprints.length`                      | Days per sprint — used for burndown chart date ranges                                        |
| `sprints.firstSprintStartDate`        | Start date of the first sprint (`YYYY-MM-DD`) — all sprint dates are derived from this       |
| `sizes`                               | Available t-shirt sizes for stories                                                          |
| `storypoints`                         | Point values parallel to `sizes` (index-aligned) — used for status bar progress and burndown |
| `quickCapture.defaultToCurrentSprint` | When `true`, quick captures use current sprint; when `false`, they go to backlog             |
| `autoFilterCurrentSprint`             | When `true`, automatically filter the tree view to the current sprint on load                |
| `storydocs.enabled`                   | When `true`, maintains flat, type-based document folders mirroring the `.devstories/` layout |
| `storydocs.root`                      | Root folder for StoryDocs, relative to the repository root (e.g., `docs/storydocs`)          |

## File Structure

```
your-project/
├── .devstories/
│   ├── config.json
│   ├── themes/
│   │   └── THEME-001-platform.md
│   ├── epics/
│   │   └── EPIC-0001-user-auth.md
│   ├── stories/
│   │   ├── DS-00001-login-form.md
│   │   └── DS-00002-signup-flow.md
│   ├── inbox/
│   │   └── 2026-03-03-dark-mode-idea.md
│   ├── spikes/
│   │   └── 2026-03-01-auth-library-research.md
│   └── templates/
│       ├── feature.md
│       ├── code.template.md
│       └── validate.template.md
└── docs/storydocs/              # When StoryDocs is enabled
    ├── themes/
    │   └── THEME-001/
    ├── epics/
    │   └── EPIC-0001/
    └── stories/
        └── DS-00001/
            └── tasks/           # Task files live here
                └── TASK-001-implement-validation.md
```

Filenames use kebab-case slugs derived from the title. IDs use zero-padded numbers (5 digits for stories, 4 for epics, 3 for themes, 3 for
tasks).

## Configuring Tasks

Tasks require **StoryDocs to be enabled** because task files are stored inside the storydocs folder structure.

### Minimum config.json for tasks

```json
{
  "storydocs": {
    "enabled": true,
    "root": "docs/storydocs"
  },
  "idPrefix": {
    "task": "TASK"
  }
}
```

With just the above (plus your existing config), tasks will work with the default task type (`code`) and a built-in template.

### Full task configuration

For custom task types with dedicated templates:

```json
{
  "idPrefix": {
    "theme": "THEME",
    "epic": "EPIC",
    "story": "STORY",
    "task": "TASK"
  },
  "taskTypes": {
    "code": "code.template.md",
    "document": "document.template.md",
    "investigate": "investigate.template.md",
    "validate": "validate.template.md",
    "plan": "plan.template.md",
    "remediate": "remediate.template.md"
  },
  "templateRoot": ".devstories/templates",
  "storydocs": {
    "enabled": true,
    "root": "docs/storydocs"
  }
}
```

### Task template files

Each entry in `taskTypes` maps to a template file under `templateRoot`. Create the template files with any default markdown body you want:

```markdown
## Description

## Acceptance Criteria

- [ ]

## Notes
```

If a template file is missing, the built-in default template is used.

### Task frontmatter fields

| Field            | Required | Description                                       |
| ---------------- | -------- | ------------------------------------------------- |
| `id`             | Auto     | Generated from `idPrefix.task` (e.g., `TASK-001`) |
| `title`          | Yes      | Task title                                        |
| `task_type`      | Yes      | Must match a key in `taskTypes` (e.g., `code`)    |
| `story`          | Auto     | Parent story ID — derived from folder path        |
| `status`         | Yes      | Must match an `id` in `statuses`                  |
| `assigned_agent` | No       | Agent name (populated from `.github/agents/*.md`) |
| `dependencies`   | No       | Array of other task IDs                           |
| `priority`       | No       | Integer (lower = higher priority, default: 1)     |
| `created`        | Auto     | Creation date (`YYYY-MM-DD`)                      |
| `updated`        | Auto     | Last modified date                                |
| `completed_on`   | Auto     | Auto-set when status reaches completion           |

## Troubleshooting

### Tasks not appearing in the tree view

| Problem                                     | Cause                                    | Solution                                                                                                                                                                              |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No tasks visible at all                     | StoryDocs is not enabled                 | Set `"storydocs": { "enabled": true, "root": "docs/storydocs" }` in `config.json`                                                                                                     |
| Tasks not showing under a story             | Task files are in the wrong folder       | Tasks must be at `{storydocsRoot}/stories/{STORY-ID}/tasks/*.md` — the `story` field in frontmatter is derived from the folder path, not typed manually                               |
| Task appears but has wrong parent story     | Folder path doesn't match frontmatter    | The folder path is authoritative — move the task file to the correct `stories/{STORY-ID}/tasks/` folder                                                                               |
| "Broken file" entry instead of a task       | Frontmatter parse error                  | Open the file and check for YAML syntax errors, missing required fields (`id`, `title`, `task_type`, `status`), or invalid `task_type` values not matching `taskTypes` keys in config |
| Task status change doesn't refresh the tree | External tool modified the file          | DevStories watches for file changes, but the watcher may have a brief delay on Windows. Re-save the file or collapse/expand the parent story to force a refresh                       |
| `Create Task` command not available         | Story not selected or StoryDocs disabled | Right-click on a **story** node in the tree view (not an epic or theme). Ensure StoryDocs is enabled in config                                                                        |
| Task type picker shows no options           | `taskTypes` not configured               | Add a `taskTypes` object to config.json mapping type IDs to template filenames (see [Configuring Tasks](#configuring-tasks))                                                          |

### Progress indicators look wrong

| Problem                                                                            | Cause                                                       | Solution                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All items show ○ (empty circle)                                                    | Only one status defined, or statuses missing `isCompletion` | Define at least 2 statuses and mark one with `"isCompletion": true`                                                                                        |
| No ● (filled circle) on completed items                                            | No status has `isCompletion: true`                          | Add `"isCompletion": true` to your "done" status. Without it, only the very last status in the array is treated as completion                              |
| Post-completion statuses (blocked, deferred, etc.) show ○ instead of special icons | Status ID doesn't match expected names                      | The special icons map to exact status IDs: `blocked` → ⊘, `deferred` → ⏸, `superseded` → ⊖, `cancelled` → ⊗. Use these exact IDs in your `statuses` config |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup.

## License

[MIT](LICENSE)
