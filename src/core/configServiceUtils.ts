/**
 * Pure utility functions for ConfigService - no VS Code dependencies
 * These can be unit tested with Vitest
 */

import { StoryType, StorySize } from '../types/story';

 
const matter = require('gray-matter');

/**
 * Status definition from config.json
 */
export interface StatusDef {
  id: string;
  label: string;
  /** When true, stories with this status count as completed in progress calculations.
   *  If no status has this flag, the last status in the array is used as the completion status. */
  isCompletion?: boolean;
  /** When true, stories with this status are excluded from burndown calculations
   *  (e.g., cancelled, deferred). They don't count in ideal or actual lines. */
  isExcluded?: boolean;
}

/**
 * Template data parsed from .devstories/templates/ files
 */
export interface TemplateData {
  name: string;           // Filename without .md (e.g., "api-endpoint")
  displayName: string;    // From frontmatter title or fallback to name
  description?: string;   // From frontmatter description
  types?: StoryType[];    // Filter by story type (if specified)
  content: string;        // Template body (without frontmatter)
}

/**
 * Config data parsed from config.json
 */
export interface ConfigData {
  epicPrefix: string;
  storyPrefix: string;
  currentSprint?: string;
  sprintSequence: string[];
  statuses: StatusDef[];
  sizes: StorySize[];
  storypoints: number[];
  quickCaptureDefaultToCurrentSprint: boolean;
  autoFilterCurrentSprint: boolean;
  /** Number of days in each sprint (for burndown charts) */
  sprintLength?: number;
  /** ISO date (YYYY-MM-DD) of the first day of the first sprint (for burndown charts) */
  firstSprintStartDate?: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ConfigData = {
  epicPrefix: 'EPIC',
  storyPrefix: 'STORY',
  sprintSequence: [],
  statuses: [
    { id: 'todo', label: 'To Do' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'review', label: 'Review' },
    { id: 'done', label: 'Done' },
  ],
  sizes: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'] as StorySize[],
  storypoints: [1, 2, 4, 8, 16, 32, 64],
  quickCaptureDefaultToCurrentSprint: false,
  autoFilterCurrentSprint: true,
};

/**
 * Validation result for sprint config
 */
export interface SprintValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate that currentSprint exists in sequence (if both are defined)
 */
export function validateSprintConfig(config: ConfigData): SprintValidationResult {
  // No currentSprint set - valid
  if (!config.currentSprint) {
    return { valid: true };
  }

  // Empty sequence - valid (no constraint)
  if (config.sprintSequence.length === 0) {
    return { valid: true };
  }

  // currentSprint must exist in sequence
  if (!config.sprintSequence.includes(config.currentSprint)) {
    return {
      valid: false,
      error: `Sprint "${config.currentSprint}" is not in the sequence`,
    };
  }

  return { valid: true };
}

/**
 * Parse config.json content into ConfigData
 * Returns partial data - use mergeConfigWithDefaults to fill in missing fields
 */
export function parseConfigJsonContent(content: string): Partial<ConfigData> {
  if (!content.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(content);
    if (!parsed) {
      return {};
    }

    const result: Partial<ConfigData> = {};

    // ID prefixes (camelCase in JSON)
    if (parsed.idPrefix?.epic) {
      result.epicPrefix = parsed.idPrefix.epic;
    }
    if (parsed.idPrefix?.story) {
      result.storyPrefix = parsed.idPrefix.story;
    }

    // Sprint
    if (parsed.sprints?.current) {
      result.currentSprint = parsed.sprints.current;
    }
    if (Array.isArray(parsed.sprints?.sequence)) {
      result.sprintSequence = parsed.sprints.sequence;
    }

    // Statuses
    if (Array.isArray(parsed.statuses)) {
      result.statuses = parsed.statuses.map((s: { id: string; label?: string; isCompletion?: boolean; isExcluded?: boolean }) => ({
        id: s.id,
        label: s.label ?? s.id,
        ...(s.isCompletion === true ? { isCompletion: true } : {}),
        ...(s.isExcluded === true ? { isExcluded: true } : {}),
      }));
    }

    // Sizes
    if (Array.isArray(parsed.sizes)) {
      result.sizes = parsed.sizes;
    }

    // Story points (parallel array to sizes, index-aligned)
    if (Array.isArray(parsed.storypoints)) {
      result.storypoints = parsed.storypoints;
    }

    // Quick capture options
    if (typeof parsed.quickCapture?.defaultToCurrentSprint === 'boolean') {
      result.quickCaptureDefaultToCurrentSprint = parsed.quickCapture.defaultToCurrentSprint;
    }

    // Auto-filter current sprint (DS-153)
    if (typeof parsed.autoFilterCurrentSprint === 'boolean') {
      result.autoFilterCurrentSprint = parsed.autoFilterCurrentSprint;
    }

    // Sprint date config for burndown charts
    if (typeof parsed.sprints?.length === 'number') {
      result.sprintLength = parsed.sprints.length;
    }
    if (typeof parsed.sprints?.firstSprintStartDate === 'string') {
      result.firstSprintStartDate = parsed.sprints.firstSprintStartDate;
    }

    return result;
  } catch {
    // Invalid JSON config - return empty to use defaults
    return {};
  }
}

/**
 * Parse a template file into TemplateData
 */
export function parseTemplateFile(filename: string, content: string): TemplateData {
  const name = filename.replace(/\.md$/, '');
  const parsed = matter(content);

  return {
    name,
    displayName: parsed.data?.title ?? name,
    description: parsed.data?.description,
    types: parsed.data?.types,
    content: parsed.content.trim(),
  };
}

/**
 * Merge parsed config with defaults
 */
export function mergeConfigWithDefaults(parsed: Partial<ConfigData>): ConfigData {
  return {
    epicPrefix: parsed.epicPrefix ?? DEFAULT_CONFIG.epicPrefix,
    storyPrefix: parsed.storyPrefix ?? DEFAULT_CONFIG.storyPrefix,
    currentSprint: parsed.currentSprint,
    sprintSequence: parsed.sprintSequence ?? DEFAULT_CONFIG.sprintSequence,
    statuses: parsed.statuses ?? DEFAULT_CONFIG.statuses,
    sizes: parsed.sizes ?? DEFAULT_CONFIG.sizes,
    storypoints: parsed.storypoints ?? DEFAULT_CONFIG.storypoints,
    quickCaptureDefaultToCurrentSprint: parsed.quickCaptureDefaultToCurrentSprint ?? DEFAULT_CONFIG.quickCaptureDefaultToCurrentSprint,
    autoFilterCurrentSprint: parsed.autoFilterCurrentSprint ?? DEFAULT_CONFIG.autoFilterCurrentSprint,
    sprintLength: parsed.sprintLength,
    firstSprintStartDate: parsed.firstSprintStartDate,
  };
}

/**
 * Get the story points value for a given size.
 * Looks up the size's index in the sizes array and returns the corresponding storypoints value.
 * Falls back to 1 if the size is not found (avoids silently zeroing out stories).
 */
export function getSizePoints(size: string, sizes: string[], storypoints: number[]): number {
  const index = sizes.indexOf(size);
  if (index === -1) {
    return 1;
  }
  return storypoints[index] ?? 1;
}

/**
 * Get the index of a sprint in the sequence.
 * Returns Infinity for sprints not in sequence (sorts to end).
 */
export function getSprintIndex(sprintName: string | undefined, sequence: string[]): number {
  if (!sprintName) {
    return Infinity;
  }
  const index = sequence.indexOf(sprintName);
  return index === -1 ? Infinity : index;
}

/**
 * Sort sprints by sequence order.
 * Sprints in sequence appear first (in sequence order).
 * Sprints NOT in sequence appear after, sorted alphabetically.
 */
export function sortSprintsBySequence(sprints: string[], sprintSequence: string[]): string[] {
  return [...sprints].sort((a, b) => {
    const indexA = getSprintIndex(a, sprintSequence);
    const indexB = getSprintIndex(b, sprintSequence);

    // Both in sequence: sort by sequence order
    if (indexA !== Infinity && indexB !== Infinity) {
      return indexA - indexB;
    }

    // One in sequence, one not: sequence first
    if (indexA !== Infinity) { return -1; }
    if (indexB !== Infinity) { return 1; }

    // Neither in sequence: sort alphabetically
    return a.localeCompare(b);
  });
}

/**
 * Check if a status is the completion status.
 * If any status has isCompletion: true, those statuses define completion.
 * Otherwise falls back to last status in workflow.
 * Falls back to literal 'done' check if statuses array is empty.
 */
export function isCompletedStatus(status: string, statuses: StatusDef[]): boolean {
  if (statuses.length === 0) {
    return status === 'done';
  }
  const hasExplicitCompletion = statuses.some(s => s.isCompletion === true);
  if (hasExplicitCompletion) {
    return statuses.some(s => s.id === status && s.isCompletion === true);
  }
  return status === statuses[statuses.length - 1].id;
}

/**
 * Check if a status is excluded from burndown calculations.
 * Stories with excluded statuses don't count in ideal or actual burndown lines.
 */
export function isExcludedStatus(status: string, statuses: StatusDef[]): boolean {
  return statuses.some(s => s.id === status && s.isExcluded === true);
}

/**
 * Generic debounce function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | undefined;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}
