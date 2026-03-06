/**
 * Pure utility functions for sprint burndown chart calculations.
 * No VS Code dependencies — fully unit testable with Vitest.
 *
 * Terminology:
 *   - "planned points": total story points of stories in the sprint that are
 *     NOT excluded (e.g. not cancelled/deferred).
 *   - "done points": points of stories whose completed_on <= a given day.
 *   - "ideal": linear from planned points to 0 across sprint days.
 *   - "actual": planned points minus cumulative done points each day.
 */

import { Story } from '../types/story';
import { StatusDef, isExcludedStatus, isCompletedStatus, getSizePoints } from '../core/configServiceUtils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BurndownDataPoint {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Ideal remaining points (linear from total to 0) */
  ideal: number;
  /** Actual remaining points, or null for future dates */
  actual: number | null;
}

export interface SprintDateRange {
  /** First day of the sprint (inclusive) */
  start: Date;
  /** Last day of the sprint (inclusive) */
  end: Date;
}

export interface BurndownConfig {
  sprintLength: number;
  firstSprintStartDate: string;
  sprintSequence: string[];
  statuses: StatusDef[];
  sizes: string[];
  storypoints: number[];
}

// ─── Date helpers ───────────────────────────────────────────────────────────

/**
 * Parse an ISO date string (YYYY-MM-DD) into a Date at midnight UTC.
 */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Format a Date as YYYY-MM-DD (UTC).
 */
export function formatISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Add `days` days to a Date (returns new Date, UTC).
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Format a Date as a short label for display (e.g. "Mar 2" in en-US, "2 mars" in fr).
 * Uses Intl.DateTimeFormat for locale-aware formatting.
 *
 * @param date   UTC midnight Date to format.
 * @param locale BCP 47 locale tag (e.g. 'en', 'fr', 'de'). Defaults to host locale.
 */
export function formatShortDate(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale ?? undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Get today's date as YYYY-MM-DD using **local** time (not UTC).
 * The burndown chart should reflect the user's local calendar day.
 */
export function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Sprint date range ──────────────────────────────────────────────────────

/**
 * Derive the start/end dates for a sprint given its position in the sequence.
 *
 * sprintStart = firstSprintStartDate + (sprintIndex × sprintLength)
 * sprintEnd   = sprintStart + sprintLength - 1
 *
 * Returns undefined if the sprint is not found in the sequence or config
 * is not set.
 */
export function getSprintDateRange(
  sprintName: string,
  sprintSequence: string[],
  firstSprintStartDate: string,
  sprintLength: number,
): SprintDateRange | undefined {
  const index = sprintSequence.indexOf(sprintName);
  if (index === -1) {
    return undefined;
  }

  const epochStart = parseISODate(firstSprintStartDate);
  const start = addDays(epochStart, index * sprintLength);
  const end = addDays(start, sprintLength - 1);
  return { start, end };
}

// ─── Burndown configuration check ──────────────────────────────────────────

/**
 * Returns true when the burndown chart can be rendered (both sprint date
 * config fields are present).
 */
export function isBurndownConfigured(config: { sprintLength?: number; firstSprintStartDate?: string }): boolean {
  return typeof config.sprintLength === 'number' && config.sprintLength > 0
    && typeof config.firstSprintStartDate === 'string' && config.firstSprintStartDate.length > 0;
}

// ─── Burndown calculation ───────────────────────────────────────────────────

/**
 * Calculate the burndown data points for a sprint.
 *
 * @param stories   All stories assigned to the sprint.
 * @param sprintStart  First day of the sprint (UTC midnight).
 * @param sprintLength Number of days in the sprint.
 * @param statuses  Status definitions from config (for isCompletion / isExcluded).
 * @param sizes     Size labels (parallel array with storypoints).
 * @param storypoints  Point values (parallel array with sizes).
 * @param today     Override for "today" (ISO string, default = real today). Useful for tests.
 * @returns Array of data points, one per day of the sprint.
 */
export function calculateBurndown(
  stories: Story[],
  sprintStart: Date,
  sprintLength: number,
  statuses: StatusDef[],
  sizes: string[],
  storypoints: number[],
  today?: string,
): BurndownDataPoint[] {
  const todayDate = parseISODate(today ?? localToday());

  // Filter out excluded stories (cancelled, deferred, etc.)
  const relevantStories = stories.filter(s => !isExcludedStatus(s.status, statuses));

  // Total planned points = sum of all relevant (non-excluded) stories
  const totalPlannedPoints = relevantStories.reduce(
    (sum, s) => sum + getSizePoints(s.size, sizes, storypoints),
    0,
  );

  // Completed stories with completedOn set
  const completedStories = relevantStories.filter(s =>
    isCompletedStatus(s.status, statuses) && s.completedOn,
  );

  const dataPoints: BurndownDataPoint[] = [];

  for (let day = 0; day < sprintLength; day++) {
    const date = addDays(sprintStart, day);
    const dateStr = formatISODate(date);

    // Ideal line: linear from totalPlannedPoints on day 0 to 0 on last day
    // If sprintLength is 1, the ideal is 0 immediately
    const ideal = sprintLength > 1
      ? totalPlannedPoints * (1 - day / (sprintLength - 1))
      : 0;

    // Actual line: only for days <= today
    let actual: number | null = null;
    if (date.getTime() <= todayDate.getTime()) {
      // Cumulative done points: stories with completedOn <= this day
      const donePointsOnDay = completedStories
        .filter(s => {
          const doneDateStr = formatISODate(s.completedOn!);
          return doneDateStr <= dateStr; // lexicographic compare works for YYYY-MM-DD
        })
        .reduce((sum, s) => sum + getSizePoints(s.size, sizes, storypoints), 0);

      actual = totalPlannedPoints - donePointsOnDay;
    }

    dataPoints.push({
      date: dateStr,
      ideal: Math.round(ideal * 100) / 100, // round to 2 decimal places
      actual,
    });
  }

  return dataPoints;
}
