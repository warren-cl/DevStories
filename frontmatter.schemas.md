# Frontmatter Schemas

YAML frontmatter for DevStories markdown files. All files live in `.devstories/` and use [gray-matter](https://github.com/jonschlinkert/gray-matter) for parsing.

---

## Story

**File location:** `.devstories/stories/<ID>-<slug>.md`  
**Example filename:** `DS-00001-login-form.md`

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique story identifier. Pattern: `PREFIX-NNN` (e.g., `DS-001`). |
| `title` | `string` | Brief description of the work. Max 200 characters. |
| `type` | `string` | One of: `feature`, `bug`, `task`, `chore`. |
| `epic` | `string` | Parent epic ID (`PREFIX-NNN` or `EPIC-INBOX`). Use empty string if unassigned. |
| `status` | `string` | Current workflow status. Must match a status defined in `config.json`. |
| `size` | `string` | Complexity estimate (e.g., `XS`, `M`, `XL`). Valid values come from `config.json` `sizes` array. |
| `created` | `string` | Creation date in `YYYY-MM-DD` format. |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `sprint` | `string` | Sprint identifier. Must match a sprint in `config.json`. |
| `priority` | `integer` | Sort order — lower values appear first. |
| `assignee` | `string` | Person assigned to this story. |
| `dependencies` | `string[]` | Story IDs this story depends on. Accepts plain IDs (`DS-002`) or wiki-link format (`[[DS-002]]`). |
| `workflow` | `string` | Workflow this story belongs to (e.g., `infrastructure`, `full-stack`, `frontend`). |
| `author` | `string` | Author of this document. |
| `owner` | `string` | Owner of this document. |
| `updated` | `string` | Last-modified date (`YYYY-MM-DD`). Auto-updated by the extension on save. |
| `completed_on` | `string` | Date the story reached a completion status (`YYYY-MM-DD`). Auto-managed by the extension. |

### Example

```yaml
---
id: DS-00001
title: Login Form Implementation
type: feature
epic: EPIC-0001
status: in-progress
sprint: sprint-4
size: M
priority: 500
assignee: dhaval
dependencies:
  - DS-00005
  - "[[DS-00006]]"
workflow: frontend
author: dhaval
owner: dhaval
created: 2025-01-15
updated: 2025-01-20
completed_on: ""
---
```

---

## Epic

**File location:** `.devstories/epics/<ID>-<slug>.md`  
**Example filename:** `EPIC-0001-user-auth.md`

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique epic identifier. Pattern: `PREFIX-NNN` or `EPIC-INBOX`. |
| `title` | `string` | Thematic grouping of related stories. Max 100 characters. |
| `status` | `string` | Current workflow status. Must match a status defined in `config.json`. |
| `created` | `string` | Creation date in `YYYY-MM-DD` format. |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `theme` | `string` | Parent theme identifier (`PREFIX-NNN`). Omit if not grouped under a theme. |
| `priority` | `integer` | Sort order — lower values appear first. Minimum: `0`. Default: `500`. |
| `workflow` | `string` | Workflow this epic belongs to (e.g., `infrastructure`, `full-stack`, `frontend`). |
| `author` | `string` | Author of this document. |
| `owner` | `string` | Owner of this document. |
| `updated` | `string` | Last-modified date (`YYYY-MM-DD`). Auto-updated by the extension on save. |

> **Note:** Epics do not have a `sprint` field. Sprint timing is derived from their child stories.

### Example

```yaml
---
id: EPIC-0001
title: User Authentication
status: in-progress
theme: THEME-001
priority: 200
workflow: full-stack
author: dhaval
owner: dhaval
created: 2025-01-10
updated: 2025-01-20
---
```

---

## Theme

**File location:** `.devstories/themes/<ID>-<slug>.md`  
**Example filename:** `THEME-001-platform.md`

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique theme identifier. Pattern: `PREFIX-NNN` (e.g., `THEME-001`). |
| `title` | `string` | Top-level strategic grouping of related epics. Max 100 characters. |
| `status` | `string` | Current workflow status. Must match a status defined in `config.json`. |
| `created` | `string` | Creation date in `YYYY-MM-DD` format. |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `priority` | `integer` | Sort order — lower values appear first. Minimum: `0`. Default: `500`. |
| `workflow` | `string` | Workflow this theme belongs to (e.g., `infrastructure`, `full-stack`, `frontend`). |
| `author` | `string` | Author of this document. |
| `owner` | `string` | Owner of this document. |
| `updated` | `string` | Last-modified date (`YYYY-MM-DD`). Auto-updated by the extension on save. |

### Example

```yaml
---
id: THEME-001
title: Platform Foundations
status: in-progress
priority: 100
workflow: infrastructure
author: dhaval
owner: dhaval
created: 2025-01-05
updated: 2025-01-20
---
```

---

## ID formats

| Entity | Pattern | Example |
|--------|---------|---------|
| Story | `PREFIX-NNN` | `DS-00001` |
| Epic | `PREFIX-NNN` or `EPIC-INBOX` | `EPIC-0001`, `EPIC-INBOX` |
| Theme | `PREFIX-NNN` | `THEME-001` |

Prefixes are configured in `config.json` via `storyPrefix`, `epicPrefix`, and `themePrefix`.

## Wiki links

Cross-references between files use `[[ID]]` syntax (e.g., `[[DS-00001]]`, `[[EPIC-0001]]`). The extension resolves these to clickable document links and hover previews. In frontmatter `dependencies` arrays both plain IDs and `[[ID]]` syntax are accepted.
