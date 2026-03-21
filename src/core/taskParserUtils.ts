import { localToday } from "../utils/dateUtils";

/**
 * Derives the parent story ID from the task file's path.
 * Expects a path segment like: stories/STORY-00157/tasks/TASK-001-foo.md
 * Returns the story ID (e.g. "STORY-00157") or undefined if the path doesn't match.
 */
export function deriveStoryIdFromPath(filePath: string): string | undefined {
  // Normalise separators so both Windows and Unix paths work
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/\/stories\/([^/]+)\/tasks\//);
  return match ? match[1] : undefined;
}

/**
 * Derives the task ID from the filename.
 * e.g. "TASK-001-pre-slice-scanning.md" → "TASK-001"
 * Accepts any prefix followed by a numeric segment (TASK-001, TASK-0001, etc.)
 */
export function deriveTaskIdFromFilename(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const basename = normalized.split("/").pop() ?? "";
  const match = basename.match(/^(TASK-\d+)/i);
  return match ? match[1].toUpperCase() : undefined;
}

/**
 * Derives a human-readable title from the filename slug.
 * e.g. "TASK-001-pre-slice-scanning.md" → "Pre Slice Scanning"
 * Strips the task-id prefix and .md extension, converts kebab-case to Title Case.
 */
export function deriveTitleFromFilename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const basename = normalized.split("/").pop() ?? "";
  // Remove .md extension
  const withoutExt = basename.replace(/\.md$/i, "");
  // Strip the TASK-NNN- prefix
  const slug = withoutExt.replace(/^TASK-\d+-?/i, "");
  if (!slug) {
    return withoutExt; // Fallback to full filename without extension
  }
  // Kebab-case to Title Case
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Field alias mapping: alternative names → canonical name */
const FIELD_ALIASES: Record<string, string> = {
  task_id: "id",
  story_id: "story",
  parent_story: "story",
  completed: "completed_on",
  completed_at: "completed_on",
  agent: "assigned_agent",
  assignee: "assigned_agent",
  depends_on: "dependencies",
  blocked_by: "dependencies",
  type: "task_type", // only when it looks like a task-type value (handled below)
};

/** Values that look like task_type rather than story type */
const TASK_TYPE_VALUES = new Set(["code", "test", "document", "remediate", "investigate", "plan", "validate"]);

export interface NormalizationResult {
  normalized: Record<string, unknown>;
  changed: boolean;
}

/**
 * Normalizes raw frontmatter data for a task file.
 *
 * - Maps alternative field names to canonical ones
 * - Derives missing values from file path and filename
 * - Fills sane defaults for any still-missing required fields
 * - Preserves unknown fields (never strips extra data)
 *
 * Returns `changed: true` when ANY field was added, renamed, or defaulted.
 */
export function normalizeTaskFrontmatter(data: Record<string, unknown>, filePath: string): NormalizationResult {
  const result: Record<string, unknown> = { ...data };
  let changed = false;

  // --- 1. Rename aliased fields ---
  for (const [alias, canonical] of Object.entries(FIELD_ALIASES)) {
    if (alias in result && !(canonical in result)) {
      // Special case: `type` is only aliased to `task_type` when the value
      // looks like a task type, not a story type (feature, bug, etc.)
      if (alias === "type") {
        const val = String(result[alias]).toLowerCase();
        if (!TASK_TYPE_VALUES.has(val)) {
          continue; // Leave `type` alone — it's likely a story-style type
        }
      }
      result[canonical] = result[alias];
      delete result[alias];
      changed = true;
    }
  }

  // --- 2. Derive / default required fields ---

  // id — derive from filename
  if (!result.id) {
    const derived = deriveTaskIdFromFilename(filePath);
    if (derived) {
      result.id = derived;
      changed = true;
    }
  }

  // story — ALWAYS derive from path (authoritative)
  const derivedStory = deriveStoryIdFromPath(filePath);
  if (derivedStory) {
    if (result.story !== derivedStory) {
      result.story = derivedStory;
      changed = true;
    }
  }

  // title — derive from filename slug
  if (!result.title) {
    result.title = deriveTitleFromFilename(filePath);
    changed = true;
  }

  // task_type — default to "code"
  if (!result.task_type) {
    result.task_type = "code";
    changed = true;
  }

  // status — default to "todo"
  if (!result.status) {
    result.status = "todo";
    changed = true;
  }

  // priority — default to 1
  if (result.priority === undefined || result.priority === null) {
    result.priority = 1;
    changed = true;
  }

  // created — default to today
  if (!result.created) {
    result.created = localToday();
    changed = true;
  }

  // updated — default to today
  if (!result.updated) {
    result.updated = localToday();
    changed = true;
  }

  return { normalized: result, changed };
}
