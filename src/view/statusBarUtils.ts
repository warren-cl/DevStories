/**
 * Pure utility functions for StatusBarController - no VS Code dependencies
 * These can be unit tested with Vitest
 */

import { sortSprintsBySequence, isCompletedStatus, isExcludedStatus, StatusDef, getSizePoints } from "../core/configServiceUtils";
import { Story } from "../types/story";

export interface StatusBarStats {
  totalPoints: number;
  donePoints: number;
}

/**
 * Get stats from stories array, optionally filtered by sprint.
 * Returns totals in story points (not story count).
 * @param stories - All stories
 * @param sprint - Sprint to filter by (null = all sprints, 'backlog' = empty/undefined/backlog)
 * @param statuses - Status workflow from config (completion = last status)
 * @param sizes - Ordered size labels from config (index-aligned with storypoints)
 * @param storypoints - Point values parallel to sizes array
 */
export function getStatsFromStories(
  stories: Story[],
  sprint: string | null,
  statuses: StatusDef[] = [],
  sizes: string[] = [],
  storypoints: number[] = [],
): StatusBarStats {
  let filtered = stories;

  if (sprint !== null) {
    if (sprint === "backlog") {
      filtered = stories.filter((s) => !s.sprint || s.sprint === "" || s.sprint === "backlog");
    } else {
      filtered = stories.filter((s) => s.sprint === sprint);
    }
  }

  filtered = filtered.filter((s) => !isExcludedStatus(s.status, statuses));

  const totalPoints = filtered.reduce((sum, s) => sum + getSizePoints(s.size, sizes, storypoints), 0);
  const donePoints = filtered
    .filter((s) => isCompletedStatus(s.status, statuses))
    .reduce((sum, s) => sum + getSizePoints(s.size, sizes, storypoints), 0);

  return { totalPoints, donePoints };
}

/**
 * Build a progress bar string
 * @param done - Number done
 * @param total - Total number
 * @param barLength - Character length of bar
 */
export function buildProgressBar(done: number, total: number, barLength: number = 6): string {
  if (total === 0) {
    return "█".repeat(barLength);
  }

  const filled = Math.round((done / total) * barLength);
  const empty = barLength - filled;

  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Get formatted status bar text with sprint context
 * @param done - Number done
 * @param total - Total number
 * @param sprint - Current sprint filter (null = all, 'backlog' = backlog)
 */
export function getFormattedStatusBarText(done: number, total: number, sprint: string | null): string {
  let sprintLabel: string;
  if (sprint === null) {
    sprintLabel = "All Sprints";
  } else if (sprint === "backlog") {
    sprintLabel = "Backlog";
  } else {
    sprintLabel = sprint;
  }

  if (total === 0) {
    return `$(checklist) ${sprintLabel}: No stories`;
  }

  const progressBar = buildProgressBar(done, total);
  return `$(checklist) ${sprintLabel}: ${progressBar} ${done}/${total} pts`;
}

/**
 * Format tooltip content lines
 * @param done - Number of done stories
 * @param total - Total number of stories
 * @param sprint - Current sprint filter (null = all sprints)
 * @returns Array of lines for tooltip display
 */
export function formatTooltipLines(done: number, total: number, sprint: string | null): string[] {
  const remaining = total - done;

  const lines: string[] = ["**DevStories: Sprint Progress**", ""];

  if (sprint === null) {
    lines.push("📊 Showing: All Sprints");
  } else if (sprint === "backlog") {
    lines.push("📊 Showing: Backlog");
  } else {
    lines.push(`📊 Showing: ${sprint}`);
  }

  lines.push("");
  lines.push(`✅ Done: ${done} pts`);
  lines.push(`📝 Remaining: ${remaining} pts`);
  lines.push(`📦 Total: ${total} pts`);

  return lines;
}

/**
 * Collect available sprints from stories and config
 * @param stories - All stories
 * @param currentSprint - Current sprint from config (may be undefined)
 * @param sprintSequence - Sprint sequence from config for ordering
 * @returns Sorted array of unique sprint names (excludes backlog/empty)
 */
export function collectAvailableSprints(stories: Story[], currentSprint: string | undefined, sprintSequence: string[] = []): string[] {
  const sprints = new Set<string>();

  // Add sprints from stories
  for (const story of stories) {
    if (story.sprint && story.sprint !== "" && story.sprint !== "backlog") {
      sprints.add(story.sprint);
    }
  }

  // Add current sprint from config if defined
  if (currentSprint && currentSprint !== "" && currentSprint !== "backlog") {
    sprints.add(currentSprint);
  }

  // Return sorted by sequence (sprints in sequence first, then alphabetical)
  return sortSprintsBySequence(Array.from(sprints), sprintSequence);
}
