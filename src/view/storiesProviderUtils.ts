/**
 * Pure utility functions for StoriesProvider - no VS Code dependencies
 * These can be unit tested with Vitest
 */

import { Epic } from "../types/epic";
import { Story } from "../types/story";
import { Task } from "../types/task";
import { Theme } from "../types/theme";
import { BrokenFile } from "../types/brokenFile";
import { getSprintIndex, StatusDef } from "../core/configServiceUtils";
import { SortState } from "../core/sortService";
import { BACKLOG_SPRINT_ID } from "../types/sprintNode";

/** The two view modes supported by the Stories tree view. */
export type ViewMode = "breakdown" | "backlog";

/**
 * Get the tree view title based on current sprint config, active sprint filter, and view mode.
 *
 * Format:
 *   - "BACKLOG: Current sprint-4" or "BREAKDOWN: Current sprint-4"
 *   - With filter: "BACKLOG: Current sprint-4: Showing sprint-3"
 *
 * @param currentSprint - The configured current sprint (from config.json)
 * @param filterSprint  - The active view filter (null = all sprints)
 * @param viewMode      - Current view mode ('breakdown' or 'backlog')
 */
export function getTreeViewTitle(
  currentSprint: string | null | undefined,
  filterSprint: string | null,
  viewMode: ViewMode = "backlog",
  textFilter: string = "",
): string {
  const prefix = viewMode === "backlog" ? "BACKLOG" : "BREAKDOWN";
  const currentLabel = currentSprint ?? "(none)";

  let title: string;

  // No filter, or filter matches current sprint
  if (filterSprint === null || filterSprint === currentSprint) {
    title = `${prefix}: Current ${currentLabel}`;
  } else if (filterSprint === "backlog") {
    title = `${prefix}: Current ${currentLabel}: Showing Backlog`;
  } else {
    title = `${prefix}: Current ${currentLabel}: Showing ${filterSprint}`;
  }

  // Append text search indicator
  if (textFilter !== "") {
    title += `: Search "${textFilter}"`;
  }

  return title;
}

/**
 * Sort stories by a given SortState.
 *
 * - priority: numeric (lower = higher priority), ties broken by title
 * - date:     created date, oldest first for asc
 * - id:       trailing number extracted from ID string
 *
 * Direction 'desc' reverses the result.
 */
export function sortStoriesBy(stories: Story[], sortState: SortState, sprintSequence: string[]): Story[] {
  const { key, direction } = sortState;
  const multiplier = direction === "asc" ? 1 : -1;

  return [...stories].sort((a, b) => {
    let cmp = 0;
    if (key === "priority") {
      cmp = a.priority - b.priority;
      if (cmp === 0) {
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      }
    } else if (key === "date") {
      const dateA = a.created instanceof Date ? a.created.getTime() : 0;
      const dateB = b.created instanceof Date ? b.created.getTime() : 0;
      cmp = dateA - dateB;
      if (cmp === 0) {
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      }
    } else if (key === "id") {
      // Extract trailing number: 'STORY-00042' → 42
      const numA = parseInt(a.id.replace(/^.*-(\d+)$/, "$1"), 10) || 0;
      const numB = parseInt(b.id.replace(/^.*-(\d+)$/, "$1"), 10) || 0;
      cmp = numA - numB;
      if (cmp === 0) {
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      }
    } else {
      // Fallback: sprint sequence
      const sprintA = getSprintIndex(a.sprint, sprintSequence);
      const sprintB = getSprintIndex(b.sprint, sprintSequence);
      cmp = sprintA - sprintB;
    }
    return cmp * multiplier;
  });
}

/**
 * Sort stories for tree view display.
 * Order: sprint sequence → priority (lower first) → title (alphabetical, case-insensitive)
 */
export function sortStoriesForTreeView(stories: Story[], sprintSequence: string[]): Story[] {
  return [...stories].sort((a, b) => {
    // 1. Sort by sprint sequence
    const sprintA = getSprintIndex(a.sprint, sprintSequence);
    const sprintB = getSprintIndex(b.sprint, sprintSequence);
    if (sprintA !== sprintB) {
      return sprintA - sprintB;
    }

    // 2. Sort by priority (lower = higher priority)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    // 3. Sort alphabetically by title (case-insensitive)
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

/**
 * Get the earliest sprint index from a list of stories.
 * Returns Infinity if no stories or all sprints are unknown.
 */
export function getEarliestStorySprintIndex(stories: Story[], sprintSequence: string[]): number {
  if (stories.length === 0) {
    return Infinity;
  }

  let earliest = Infinity;
  for (const story of stories) {
    const index = getSprintIndex(story.sprint, sprintSequence);
    if (index < earliest) {
      earliest = index;
    }
  }
  return earliest;
}

/**
 * Sort epics by the sprint of their earliest story (derived ordering).
 * When sortState is provided, sort epics directly by priority, date, or ID instead.
 * Epics without stories or with unknown sprints sort to the end.
 * Falls back to epic created date for equal indices.
 */
export function sortEpicsBySprintOrder(
  epics: Epic[],
  sprintSequence: string[],
  getStoriesByEpic: (epicId: string) => Story[],
  sortState?: SortState,
): Epic[] {
  if (sortState) {
    const { key, direction } = sortState;
    const multiplier = direction === "asc" ? 1 : -1;
    return [...epics].sort((a, b) => {
      let cmp = 0;
      if (key === "priority") {
        cmp = a.priority - b.priority;
        if (cmp === 0) {
          cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        }
      } else if (key === "date") {
        cmp = a.created.getTime() - b.created.getTime();
        if (cmp === 0) {
          cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        }
      } else if (key === "id") {
        const numA = parseInt(a.id.replace(/^.*-(\d+)$/, "$1"), 10) || 0;
        const numB = parseInt(b.id.replace(/^.*-(\d+)$/, "$1"), 10) || 0;
        cmp = numA - numB;
        if (cmp === 0) {
          cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        }
      }
      return cmp * multiplier;
    });
  }

  return [...epics].sort((a, b) => {
    // Get earliest sprint index for each epic
    const storiesA = getStoriesByEpic(a.id);
    const storiesB = getStoriesByEpic(b.id);

    const indexA = getEarliestStorySprintIndex(storiesA, sprintSequence);
    const indexB = getEarliestStorySprintIndex(storiesB, sprintSequence);

    if (indexA !== indexB) {
      return indexA - indexB;
    }

    // Fall back to epic created date
    return a.created.getTime() - b.created.getTime();
  });
}

/**
 * Sort themes by the sprint of their earliest child epic's earliest story.
 * When sortState is provided, sort themes directly by priority, date, or ID instead.
 * Themes without epics/stories sort to the end.
 * Falls back to theme created date for equal sprint indices.
 */
export function sortThemesByEpicSprintOrder(
  themes: Theme[],
  sprintSequence: string[],
  getEpicsByTheme: (themeId: string) => Epic[],
  getStoriesByEpic: (epicId: string) => Story[],
  sortState?: SortState,
): Theme[] {
  if (sortState) {
    const { key, direction } = sortState;
    const multiplier = direction === "asc" ? 1 : -1;
    return [...themes].sort((a, b) => {
      let cmp = 0;
      if (key === "priority") {
        cmp = a.priority - b.priority;
        if (cmp === 0) {
          cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        }
      } else if (key === "date") {
        cmp = a.created.getTime() - b.created.getTime();
        if (cmp === 0) {
          cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        }
      } else if (key === "id") {
        const numA = parseInt(a.id.replace(/^.*-(\d+)$/, "$1"), 10) || 0;
        const numB = parseInt(b.id.replace(/^.*-(\d+)$/, "$1"), 10) || 0;
        cmp = numA - numB;
        if (cmp === 0) {
          cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        }
      }
      return cmp * multiplier;
    });
  }

  return [...themes].sort((a, b) => {
    const getEarliestThemeSprint = (theme: Theme): number => {
      const epics = getEpicsByTheme(theme.id);
      if (epics.length === 0) {
        return Infinity;
      }
      let earliest = Infinity;
      for (const epic of epics) {
        const stories = getStoriesByEpic(epic.id);
        const idx = getEarliestStorySprintIndex(stories, sprintSequence);
        if (idx < earliest) {
          earliest = idx;
        }
      }
      return earliest;
    };

    const indexA = getEarliestThemeSprint(a);
    const indexB = getEarliestThemeSprint(b);

    if (indexA !== indexB) {
      return indexA - indexB;
    }

    // Fall back to theme created date
    return a.created.getTime() - b.created.getTime();
  });
}

/**
 * Progress indicator circles from empty to full (6 stages).
 * Used to visually represent workflow progress based on status position.
 */
const PROGRESS_CIRCLES = ["○", "◎", "◔", "◐", "◕", "●"];

/**
 * Icons for post-completion (out-of-flow) statuses.
 * Looked up by status ID; unknown post-completion statuses fall back to '○'.
 */
const POST_COMPLETION_ICONS: Record<string, string> = {
  blocked: "⊘",
  deferred: "⏸",
  superseded: "⊖",
  cancelled: "⊗",
};

/**
 * Get a visual indicator for a status based on its position in the workflow.
 * Position 0 (first) = empty circle, last active position = filled circle.
 * Middle positions show gradual fill based on progress.
 *
 * If any status has isCompletion: true, that is the endpoint for the fill:
 * - isCompletion statuses → ● (full)
 * - pre-completion statuses → position-based fill from ○ to ◕
 * - post-completion statuses (blocked/cancelled/deferred) → ○ (out-of-flow)
 * If no isCompletion flag is set, falls back to position-based logic.
 *
 * @param status - The status ID to get indicator for
 * @param statuses - The ordered array of configured statuses
 * @returns Unicode circle character representing progress
 */
/**
 * Group stories by sprint for the Backlog view.
 *
 * Returns a Map where each key is a sprint from `sprintSequence` (in order)
 * plus a catch-all BACKLOG_SPRINT_ID key for stories that are unassigned,
 * have an empty sprint, sprint === 'backlog', or a sprint value not in sprintSequence.
 *
 * Broken stories are always placed in the Backlog bucket.
 */
export function groupStoriesBySprint(
  stories: Story[],
  brokenStories: BrokenFile[],
  sprintSequence: string[],
): Map<string, Story[]> & { brokenStories: BrokenFile[] } {
  // Exclude 'backlog' from named sprint groups — those stories go to the catch-all
  const namedSprints = sprintSequence.filter((s) => s.toLowerCase() !== "backlog");
  const sprintSet = new Set(namedSprints);
  const groups = new Map<string, Story[]>();

  // Initialize each named sprint with an empty array
  for (const sprint of namedSprints) {
    groups.set(sprint, []);
  }
  // Always create the backlog bucket
  groups.set(BACKLOG_SPRINT_ID, []);

  for (const story of stories) {
    if (!story.sprint || story.sprint === "" || story.sprint === "backlog" || !sprintSet.has(story.sprint)) {
      groups.get(BACKLOG_SPRINT_ID)!.push(story);
    } else {
      groups.get(story.sprint)!.push(story);
    }
  }

  // Attach broken stories as a side property
  const result = groups as Map<string, Story[]> & { brokenStories: BrokenFile[] };
  result.brokenStories = brokenStories;
  return result;
}

/**
 * Determine whether a story belongs to the backlog catch-all bucket.
 * True if: no sprint, empty sprint, sprint === 'backlog', or sprint not in
 * the named (non-backlog) entries of sprintSequence.
 */
export function isBacklogStory(story: Story, sprintSequence: string[]): boolean {
  const namedSprints = new Set(sprintSequence.filter((s) => s.toLowerCase() !== "backlog"));
  return !story.sprint || story.sprint === "" || story.sprint.toLowerCase() === "backlog" || !namedSprints.has(story.sprint);
}

export function getStatusIndicator(status: string, statuses: StatusDef[]): string {
  if (statuses.length === 0) {
    return "○";
  }

  const index = statuses.findIndex((s) => s.id === status);
  if (index === -1) {
    return "○"; // Unknown status defaults to not started
  }

  if (statuses.length === 1) {
    return "●"; // Single status = complete
  }

  // If any status has explicit isCompletion flag, use that as the endpoint
  const firstCompletionIndex = statuses.findIndex((s) => s.isCompletion === true);

  if (firstCompletionIndex !== -1) {
    // Current status is a completion state → full
    if (statuses[index].isCompletion === true) {
      return "●";
    }
    // Post-completion statuses (blocked/deferred/cancelled) → distinct icons
    if (index > firstCompletionIndex) {
      return POST_COMPLETION_ICONS[status] ?? "○";
    }
    // Edge case: completion is the first status
    if (firstCompletionIndex === 0) {
      return "●";
    }
    // Calculate position within the active workflow [0..firstCompletionIndex]
    const progressIndex = Math.round((index / firstCompletionIndex) * 5);
    return PROGRESS_CIRCLES[progressIndex];
  }

  // No isCompletion flags — original position-based logic
  const progressIndex = Math.round((index / (statuses.length - 1)) * 5);
  return PROGRESS_CIRCLES[progressIndex];
}

/**
 * Sort tasks by priority ASC (lower = higher priority), then by task ID ASC.
 */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // Sort by trailing number in ID
    const numA = parseInt(a.id.replace(/^.*-(\d+)$/, "$1"), 10) || 0;
    const numB = parseInt(b.id.replace(/^.*-(\d+)$/, "$1"), 10) || 0;
    return numA - numB;
  });
}
