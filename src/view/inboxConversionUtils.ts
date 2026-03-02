/**
 * Pure utility functions for converting inbox/spike files to stories or epics.
 * No VS Code dependencies — these can be unit tested with Vitest.
 */

const matter = require('gray-matter');

/**
 * Strip a leading YYYY-MM-DD- date prefix from a filename (without extension).
 *
 * Examples:
 *   "2026-02-15-kebab-case-name" → "kebab-case-name"
 *   "no-date-prefix"             → "no-date-prefix"
 *   "2026-02-15"                 → "2026-02-15" (no trailing slug)
 */
export function stripDatePrefix(fileName: string): string {
  const match = fileName.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return match ? match[1] : fileName;
}

/**
 * Convert a kebab-case slug to a human-readable title (Title Case).
 *
 * Examples:
 *   "kebab-case-file-name" → "Kebab Case File Name"
 *   "api"                  → "Api"
 *   ""                     → ""
 */
export function titleFromKebabCase(slug: string): string {
  if (!slug) { return ''; }
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ─── Default value helpers ──────────────────────────────────────────────────

export interface StoryDefaults {
  id: string;
  title: string;
  type: string;
  epic: string;
  status: string;
  sprint: string;
  size: string;
  priority: number;
  created: string;   // ISO date string YYYY-MM-DD
  updated: string;
}

export interface EpicDefaults {
  id: string;
  title: string;
  status: string;
  priority: number;
  theme: string;
  created: string;
  updated?: string;
}

/**
 * Merge existing frontmatter data with story defaults.
 * Existing fields are preserved; only missing fields are filled from defaults.
 *
 * The caller is responsible for providing the correct id, epic, sprint,
 * and priority values based on the drop target.
 */
export function fillMissingStoryFrontmatter(
  existingData: Record<string, unknown>,
  defaults: StoryDefaults,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existingData };

  // Always overwrite id / sprint / priority / epic — these are determined by the conversion context
  merged.id = defaults.id;
  merged.sprint = defaults.sprint;
  merged.priority = defaults.priority;
  merged.epic = defaults.epic;

  // Fill remaining fields only when missing
  if (!merged.title) { merged.title = defaults.title; }
  if (!merged.type) { merged.type = defaults.type; }
  if (!merged.status) { merged.status = defaults.status; }
  if (!merged.size) { merged.size = defaults.size; }
  if (merged.assignee === undefined) { merged.assignee = ''; }
  if (!merged.dependencies) { merged.dependencies = []; }
  if (!merged.created) { merged.created = defaults.created; }
  merged.updated = defaults.updated;

  return merged;
}

/**
 * Merge existing frontmatter data with epic defaults.
 * Existing fields are preserved; only missing fields are filled from defaults.
 */
export function fillMissingEpicFrontmatter(
  existingData: Record<string, unknown>,
  defaults: EpicDefaults,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existingData };

  // Always overwrite id / priority / theme — determined by conversion context
  merged.id = defaults.id;
  merged.priority = defaults.priority;
  if (defaults.theme) {
    merged.theme = defaults.theme;
  } else {
    delete merged.theme;   // No Theme sentinel → clear theme
  }

  // Fill remaining fields only when missing
  if (!merged.title) { merged.title = defaults.title; }
  if (!merged.status) { merged.status = defaults.status; }
  if (!merged.created) { merged.created = defaults.created; }

  return merged;
}

/**
 * Build the full converted file content by merging new frontmatter data
 * with the preserved markdown body from the original file.
 *
 * Uses gray-matter to parse and re-serialize so existing body content is kept.
 */
export function buildConvertedFileContent(
  originalContent: string,
  mergedData: Record<string, unknown>,
): string {
  const parsed = matter(originalContent);
  return matter.stringify(parsed.content, mergedData);
}

/**
 * Get the suggested default size for converted stories.
 * Uses the middle size from the config sizes array (same logic as createStoryUtils.getSuggestedSize for features).
 */
export function getDefaultSize(sizes: string[]): string {
  if (sizes.length === 0) { return 'M'; }
  return sizes[Math.floor(sizes.length / 2)];
}

/**
 * Get the first (default) status from config statuses.
 */
export function getDefaultStatus(statuses: { id: string }[]): string {
  if (statuses.length === 0) { return 'todo'; }
  return statuses[0].id;
}

/**
 * Get today's date as YYYY-MM-DD string.
 */
export function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Find the maximum priority among a set of items.
 * Returns 0 if the array is empty (so max + 1 = 1 for the first item).
 */
export function maxPriority(items: { priority: number }[]): number {
  if (items.length === 0) { return 0; }
  return Math.max(...items.map(i => i.priority));
}
