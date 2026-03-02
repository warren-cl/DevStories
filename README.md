# DevStories

[![CI](https://github.com/dhavalsavalia/DevStories/actions/workflows/ci.yml/badge.svg)](https://github.com/dhavalsavalia/DevStories/actions/workflows/ci.yml)
[![Marketplace Version](https://vsmarketplacebadges.dev/version-short/DhavalSavalia.devstories.svg)](https://marketplace.visualstudio.com/items?itemName=DhavalSavalia.devstories)
[![Downloads](https://vsmarketplacebadges.dev/downloads-short/DhavalSavalia.devstories.svg)](https://marketplace.visualstudio.com/items?itemName=DhavalSavalia.devstories)
[![Installs](https://vsmarketplacebadges.dev/installs-short/DhavalSavalia.devstories.svg)](https://marketplace.visualstudio.com/items?itemName=DhavalSavalia.devstories)
[![Rating](https://vsmarketplacebadges.dev/rating-short/DhavalSavalia.devstories.svg)](https:/Work /marketplace.visualstudio.com/items?itemName=DhavalSavalia.devstories)

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

### 🎨 Themes, Epics & Stories
Organize work in a three-level hierarchy: **Themes** group related epics, **Epics** group related stories, and **Stories** are individual units of work. Right-click a theme to create an epic under it, or an epic to create a story under it.  Epics dno not have to have Themes, User Stories do not have to have Epics.  Orphans are collected.

### ⚡ Quick Capture
Press `Cmd+Shift+S` to capture ideas without leaving your code. Supports type prefixes (`bug:`, `feat:`) and inline notes.

![Quick Capture](assets/screenshots/quick-capture.png)

### 🔗 Inline Preview & Links
Hover over any `[[DS-00001]]`, `[[EPIC-0001]]`, or `[[THEME-001]]` link to see the full card—status, type, size, sprint, story points, and more. Click to open the file.

![Hover Preview](assets/screenshots/hover-preview.png)

### 📊 Story-Point Progress & Sprint Burndown
- **Status bar** shows real-time story-point progress for your filtered sprint
- **Sprint Burndown chart** (webview panel) visualizes remaining work over time using configurable sprint dates and story-point values

![Status Bar](assets/screenshots/status-bar.png)

### ↕️ Drag & Drop
Reorder stories and reassign them between epics or sprints by dragging and dropping in the tree view. Priority is automatically updated.

### ➕ Create Stories Your Way
Use quick capture for fast ideas or the full form for detailed stories with templates.

![Create Story Menu](assets/screenshots/create-story-menu.png)

### 🔍 Sort & Filter
- **Sort** stories by priority, creation date, or ID
- **Filter** by sprint to focus on current work — auto-filter on load is configurable
- **Set Current Sprint** from the view title bar

### ✅ Frontmatter Validation & Autocomplete
- **Diagnostics** — Real-time validation of story/epic/theme frontmatter against JSON Schema (missing fields, invalid values, broken references)
- **Autocomplete** — IntelliSense suggestions for `status`, `type`, `size`, `sprint`, `epic`, `theme`, and `[[ID]]` references

### More Features
- **Story Templates** — Different templates per type (feature/bug/task/chore)
- **Auto-timestamps** — `updated` field auto-updates on save
- **Completion Tracking** — `date_done` is auto-set when a story reaches a completion status, and cleared when moved back
- **Status Toggle** — Right-click stories, epics, or themes to change status
- **Clickable Links** — `[[ID]]` links open the corresponding story, epic, or theme file
- **Configurable Sizes & Story Points** — Map t-shirt sizes (XXS–XXL) to story-point values for progress tracking
- **Broken File Detection** — Parse failures are surfaced in the tree view for easy debugging

## Quick Start

1. **Install** from VS Code Marketplace (search "DevStories")

2. **Initialize** — Run `DevStories: Initialize Project` from Command Palette (`Cmd+Shift+P`)

3. **Create a theme** — Run `DevStories: Create Theme` to define a high-level work area

4. **Create an epic** — Right-click a theme → **Create Epic**, or run `DevStories: Create Epic`

5. **Start capturing stories** — Press `Cmd+Shift+S` or right-click an epic → **Create Story**

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Quick Capture | `Cmd+Shift+S` |
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
    "story": "STORY"
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
  "autoFilterCurrentSprint": true
}
```

### Configuration Reference

| Field | Description |
|-------|-------------|
| `version` | Schema version (always `1`) |
| `idMode` | `"auto"` for sequential IDs, `"manual"` for user-entered IDs |
| `idPrefix.theme` | Prefix for theme IDs (e.g., `THEME`) |
| `idPrefix.epic` | Prefix for epic IDs (e.g., `EPIC`) |
| `idPrefix.story` | Prefix for story IDs (e.g., `DS`, `STORY`) |
| `statuses[].isCompletion` | Marks a status as "done" for progress & burndown calculations |
| `statuses[].isExcluded` | Excludes stories with this status from burndown (e.g., cancelled) |
| `sprints.length` | Days per sprint — used for burndown chart date ranges |
| `sprints.firstSprintStartDate` | Start date of the first sprint (`YYYY-MM-DD`) — all sprint dates are derived from this |
| `sizes` | Available t-shirt sizes for stories |
| `storypoints` | Point values parallel to `sizes` (index-aligned) — used for status bar progress and burndown |
| `quickCapture.defaultToCurrentSprint` | When `true`, quick captures use current sprint; when `false`, they go to backlog |
| `autoFilterCurrentSprint` | When `true`, automatically filter the tree view to the current sprint on load |

## File Structure

```
your-project/
└── .devstories/
    ├── config.json
    ├── themes/
    │   └── THEME-001-platform.md
    ├── epics/
    │   └── EPIC-0001-user-auth.md
    ├── stories/
    │   ├── DS-00001-login-form.md
    │   └── DS-00002-signup-flow.md
    └── templates/
        └── feature.md
```

Filenames use kebab-case slugs derived from the title. IDs use zero-padded numbers (5 digits for stories, 4 for epics, 3 for themes).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup.

## License

[MIT](LICENSE)
