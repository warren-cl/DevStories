/**
 * Pure utility functions for StoriesDragAndDropController — no VS Code dependencies.
 * These can be unit tested with Vitest.
 */

const matter = require('gray-matter');

/**
 * Update the `epic` field in a story's YAML frontmatter.
 * Also bumps `updated` to today.
 */
export function updateStoryEpic(content: string, newEpicId: string): string {
  const parsed = matter(content);
  const today = new Date().toISOString().split('T')[0];

  parsed.data.epic = newEpicId;
  parsed.data.updated = today;

  return matter.stringify(parsed.content, parsed.data);
}

/**
 * Remove the `epic` field from a story's YAML frontmatter entirely,
 * sending it to the orphaned "No Epic" group.
 * Also bumps `updated` to today.
 */
export function clearStoryEpic(content: string): string {
  const parsed = matter(content);
  const today = new Date().toISOString().split('T')[0];

  delete parsed.data.epic;
  parsed.data.updated = today;

  return matter.stringify(parsed.content, parsed.data);
}

/**
 * Update (or remove) the `theme` field in an epic's YAML frontmatter.
 * - When `newThemeId` is provided, sets `theme: <id>`.
 * - When `newThemeId` is undefined, removes the `theme` key entirely
 *   (the epic will appear under "No Theme").
 * Also bumps `updated` to today.
 */
export function updateEpicTheme(content: string, newThemeId: string | undefined): string {
  const parsed = matter(content);
  const today = new Date().toISOString().split('T')[0];

  if (newThemeId === undefined) {
    delete parsed.data.theme;
  } else {
    parsed.data.theme = newThemeId;
  }

  parsed.data.updated = today;

  return matter.stringify(parsed.content, parsed.data);
}

/**
 * Update both `sprint` and `priority` fields in a story's YAML frontmatter.
 * Used when a story is dropped onto a sprint node or a story in a different sprint.
 * Also bumps `updated` to today.
 */
export function updateStorySprintAndPriority(content: string, newSprint: string, newPriority: number): string {
  const parsed = matter(content);
  const today = new Date().toISOString().split('T')[0];

  parsed.data.sprint = newSprint;
  parsed.data.priority = newPriority;
  parsed.data.updated = today;

  return matter.stringify(parsed.content, parsed.data);
}

/**
 * Update only the `priority` field in a story's YAML frontmatter.
 * Used when bumping priorities of existing stories in a sprint after a drop.
 * Also bumps `updated` to today.
 */
export function updateStoryPriorityOnly(content: string, newPriority: number): string {
  const parsed = matter(content);
  const today = new Date().toISOString().split('T')[0];

  parsed.data.priority = newPriority;
  parsed.data.updated = today;

  return matter.stringify(parsed.content, parsed.data);
}
