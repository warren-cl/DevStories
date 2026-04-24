/**
 * Pure utility functions for changeStatus command - no VS Code dependencies
 * These can be unit tested with Vitest
 */

const matter = require("gray-matter");

import { StatusDef, isCompletedStatus } from "../core/configServiceUtils";
import { localToday, normalizeDatesInData } from "../utils/dateUtils";

const DEFAULT_STATUSES = ["todo", "in_progress", "review", "done"];

/**
 * Parse statuses from config.json content
 */
export function parseStatusesFromConfig(content: string): string[] {
  if (!content.trim()) {
    return DEFAULT_STATUSES;
  }

  try {
    const parsed = JSON.parse(content);
    const statuses = parsed?.statuses;

    if (!statuses || !Array.isArray(statuses)) {
      return DEFAULT_STATUSES;
    }

    return statuses.map((s: { id: string }) => s.id);
  } catch {
    // Invalid JSON config - use defaults
    return DEFAULT_STATUSES;
  }
}

/**
 * Get the next status in the workflow (for cycling/advancing)
 */
export function getNextWorkflowStatus(currentStatus: string, statuses: string[]): string {
  const currentIndex = statuses.indexOf(currentStatus);

  if (currentIndex === -1) {
    // Unknown status, return first
    return statuses[0];
  }

  // Cycle to next, wrap around to first
  const nextIndex = (currentIndex + 1) % statuses.length;
  return statuses[nextIndex];
}

/**
 * Update the status field in a story's frontmatter.
 * When statuses are provided, also manages the completed_on field:
 *   - Sets completed_on when transitioning to a completion status
 *   - Removes completed_on when transitioning away from a completion status
 * Returns the updated markdown content
 */
export function updateStoryStatus(content: string, newStatus: string, statuses?: StatusDef[]): string {
  const parsed = matter(content);
  const today = localToday();

  // Update status and timestamp
  parsed.data.status = newStatus;
  parsed.data.updated = today;

  // Manage completed_on field based on completion status
  if (statuses) {
    if (isCompletedStatus(newStatus, statuses)) {
      parsed.data.completed_on = today;
    } else {
      delete parsed.data.completed_on;
    }
  }

  // Normalize Date objects back to YYYY-MM-DD strings before stringify
  normalizeDatesInData(parsed.data);

  // Stringify back to markdown
  return matter.stringify(parsed.content, parsed.data);
}

/**
 * Update the status field in a theme's frontmatter
 * Returns the updated markdown content
 */
export function updateThemeStatus(content: string, newStatus: string): string {
  const parsed = matter(content);
  const today = localToday();

  // Update status and timestamp
  parsed.data.status = newStatus;
  parsed.data.updated = today;

  // Normalize Date objects back to YYYY-MM-DD strings before stringify
  normalizeDatesInData(parsed.data);

  // Stringify back to markdown
  return matter.stringify(parsed.content, parsed.data);
}

/**
 * Update the status field in an epic's frontmatter
 * Returns the updated markdown content
 */
export function updateEpicStatus(content: string, newStatus: string): string {
  const parsed = matter(content);
  const today = localToday();

  // Update status and timestamp
  parsed.data.status = newStatus;
  parsed.data.updated = today;

  // Normalize Date objects back to YYYY-MM-DD strings before stringify
  normalizeDatesInData(parsed.data);

  // Stringify back to markdown
  return matter.stringify(parsed.content, parsed.data);
}

/**
 * Update the status field in a task's frontmatter.
 * Manages completed_on field like stories:
 *   - Sets completed_on when transitioning to a completion status
 *   - Removes completed_on when transitioning away from a completion status
 * Returns the updated markdown content
 */
export function updateTaskStatus(content: string, newStatus: string, statuses?: StatusDef[]): string {
  const parsed = matter(content);
  const today = localToday();

  parsed.data.status = newStatus;
  parsed.data.updated = today;

  if (statuses) {
    if (isCompletedStatus(newStatus, statuses)) {
      parsed.data.completed_on = today;
    } else {
      delete parsed.data.completed_on;
    }
  }

  normalizeDatesInData(parsed.data);

  return matter.stringify(parsed.content, parsed.data);
}

/**
 * DS-083: Update the priority field in a story's frontmatter
 * Returns the updated markdown content
 */
export function updateStoryPriority(content: string, newPriority: number): string {
  const parsed = matter(content);
  const today = localToday();

  // Update priority and timestamp
  parsed.data.priority = newPriority;
  parsed.data.updated = today;

  // Normalize Date objects back to YYYY-MM-DD strings before stringify
  normalizeDatesInData(parsed.data);

  // Stringify back to markdown
  return matter.stringify(parsed.content, parsed.data);
}
