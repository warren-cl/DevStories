/**
 * Pure utility functions for StoriesDragAndDropController — no VS Code dependencies.
 * These can be unit tested with Vitest.
 */

const matter = require("gray-matter");

import { localToday } from "../utils/dateUtils";

/**
 * Update the `epic` field in a story's YAML frontmatter.
 * Also bumps `updated` to today.
 */
export function updateStoryEpic(content: string, newEpicId: string): string {
  const parsed = matter(content);
  const today = localToday();

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
  const today = localToday();

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
  const today = localToday();

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
  const today = localToday();

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
  const today = localToday();

  parsed.data.priority = newPriority;
  parsed.data.updated = today;

  return matter.stringify(parsed.content, parsed.data);
}

// ─── Priority cascade helpers ───────────────────────────────────────────────

/** Lightweight representation of a story for cascade computation. */
export interface PrioritySibling {
  id: string;
  priority: number;
}

/** A priority bump that needs to be written to disk. */
export interface PriorityBump {
  id: string;
  newPriority: number;
}

/**
 * Compute the minimal set of priority bumps needed after a story is inserted
 * at `insertedPriority`.  Only siblings whose priority actually collides with
 * the inserted value (or with a previously-bumped sibling) are affected — the
 * cascade stops as soon as a natural gap is found.
 *
 * @param siblings       All stories in the target sprint **excluding** the
 *                       dragged story, in any order.
 * @param insertedPriority The priority the dragged story will receive.
 * @returns Array of bumps (may be empty if no collisions).
 */
export function cascadeBumpIfNeeded(siblings: PrioritySibling[], insertedPriority: number): PriorityBump[] {
  // Sort ascending by priority, then by id for deterministic order on ties
  const sorted = [...siblings]
    .filter((s) => s.priority >= insertedPriority)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  const bumps: PriorityBump[] = [];
  let nextRequired = insertedPriority + 1;

  for (const sibling of sorted) {
    if (sibling.priority < nextRequired) {
      // Collision — this sibling needs to move down
      bumps.push({ id: sibling.id, newPriority: nextRequired });
      nextRequired++;
    } else {
      // Gap found — no more collisions possible
      break;
    }
  }

  return bumps;
}

/** Result of computing the priority for a sprint-node drop. */
export interface SprintNodeDropResult {
  draggedPriority: number;
  bumps: PriorityBump[];
}

/**
 * Compute the priority for a story dropped onto a sprint node (i.e. the story
 * should become the highest-priority item in that sprint).
 *
 * Strategy:
 * - Empty sprint → priority 100 (conventional default spacing).
 * - Room before the current minimum (min ≥ 2) → `min - 1`, zero bumps.
 * - No room (min == 1) → priority 1, cascade-bump the consecutive block.
 *
 * @param siblings All stories in the target sprint **excluding** the dragged
 *                 story, in any order.
 */
export function computeSprintNodeDropPriority(siblings: PrioritySibling[]): SprintNodeDropResult {
  if (siblings.length === 0) {
    return { draggedPriority: 100, bumps: [] };
  }

  const sorted = [...siblings].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const minPriority = sorted[0].priority;

  if (minPriority >= 2) {
    // There's room before the current minimum — no bumps needed
    return { draggedPriority: minPriority - 1, bumps: [] };
  }

  // minPriority is 1 (or theoretically 0/negative) — must cascade
  return {
    draggedPriority: 1,
    bumps: cascadeBumpIfNeeded(siblings, 1),
  };
}
