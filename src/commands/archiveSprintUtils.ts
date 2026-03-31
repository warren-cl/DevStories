/**
 * Pure utility functions for sprint-based soft archive.
 * C1: Eligibility logic — determines which items can be archived.
 * C2: Path computation — computes archive/restore destination paths.
 *
 * All path functions normalize to forward slashes internally so they
 * produce identical results on Windows, macOS, and Linux.
 * vscode.Uri.file() accepts forward slashes on every platform.
 */

import { Story } from "../types/story";
import { Epic } from "../types/epic";
import { Theme } from "../types/theme";
import { StatusDef, isCanArchiveStatus } from "../core/configServiceUtils";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ArchivePlan {
  stories: Story[];
  epics: Epic[];
  themes: Theme[];
  storyCount: number;
  epicCount: number;
  themeCount: number;
}

export interface SprintDateInfo {
  firstSprintStartDate: string;
  sprintLength: number;
}

// ─── C1: Eligibility Logic ──────────────────────────────────────────────────

/**
 * Returns the index of `sprint` in `sprintSequence`, or -1 if not found.
 */
export function computeArchiveCutoffIndex(sprint: string, sprintSequence: string[]): number {
  return sprintSequence.indexOf(sprint);
}

/**
 * Returns stories eligible for archiving.
 *
 * Two rules:
 * 1. Stories WITH a sprint at or before the cutoff are eligible regardless
 *    of status.
 * 2. Stories WITHOUT a sprint are eligible when their status has
 *    `canArchive: true` AND their effective date (completedOn ?? updated)
 *    falls before the cutoff sprint's end date.
 *
 * Already-archived stories are always excluded.
 */
export function getEligibleStories(
  stories: Story[],
  sprintSequence: string[],
  cutoffIndex: number,
  statuses: StatusDef[],
  sprintDateInfo?: SprintDateInfo,
): Story[] {
  let cutoffEndDate: Date | undefined;
  if (sprintDateInfo) {
    const { firstSprintStartDate, sprintLength } = sprintDateInfo;
    const start = new Date(firstSprintStartDate);
    // End of the cutoff sprint = start + (cutoffIndex + 1) * length
    const endMs = start.getTime() + (cutoffIndex + 1) * sprintLength * 86400000;
    cutoffEndDate = new Date(endMs);
  }

  return stories.filter((story) => {
    if (story.isArchived) return false;

    if (story.sprint) {
      const sprintIdx = sprintSequence.indexOf(story.sprint);
      return sprintIdx !== -1 && sprintIdx <= cutoffIndex;
    }

    // No sprint — require canArchive status + effective date before cutoff
    if (!isCanArchiveStatus(story.status, statuses)) return false;
    const effectiveDate = story.completedOn ?? story.updated;
    if (effectiveDate && cutoffEndDate) {
      return effectiveDate <= cutoffEndDate;
    }

    return false;
  });
}

/**
 * Returns epics eligible for archiving: not already archived, have a status
 * with canArchive: true, and ALL their child stories are either in the
 * eligible set or already archived.
 */
export function getEligibleEpics(epics: Epic[], eligibleStoryIds: Set<string>, allStories: Story[], statuses: StatusDef[]): Epic[] {
  return epics.filter((epic) => {
    if (epic.isArchived) return false;
    if (!isCanArchiveStatus(epic.status, statuses)) return false;
    const children = allStories.filter((s) => s.epic === epic.id);
    return children.every((s) => eligibleStoryIds.has(s.id) || s.isArchived);
  });
}

/**
 * Returns themes eligible for archiving: not already archived, have a status
 * with canArchive: true, and ALL their child epics are either in the
 * eligible set or already archived.
 */
export function getEligibleThemes(themes: Theme[], eligibleEpicIds: Set<string>, allEpics: Epic[], statuses: StatusDef[]): Theme[] {
  return themes.filter((theme) => {
    if (theme.isArchived) return false;
    if (!isCanArchiveStatus(theme.status, statuses)) return false;
    const children = allEpics.filter((e) => e.theme === theme.id);
    return children.every((e) => eligibleEpicIds.has(e.id) || e.isArchived);
  });
}

// ─── C1b: Restore Eligibility Logic ────────────────────────────────────────

/**
 * Returns archived stories eligible for restore: in sprints at or after
 * the cutoff index. Also includes no-sprint archived stories whose
 * effective date (completedOn ?? updated) falls on or after the cutoff
 * sprint's start date.
 * No status check — already-archived items passed eligibility when archived.
 */
export function getRestorableStories(
  stories: Story[],
  sprintSequence: string[],
  cutoffIndex: number,
  sprintDateInfo?: SprintDateInfo,
): Story[] {
  let cutoffStartDate: Date | undefined;
  if (sprintDateInfo) {
    const { firstSprintStartDate, sprintLength } = sprintDateInfo;
    const start = new Date(firstSprintStartDate);
    const startMs = start.getTime() + cutoffIndex * sprintLength * 86400000;
    cutoffStartDate = new Date(startMs);
  }

  return stories.filter((story) => {
    if (!story.isArchived) return false;

    if (story.sprint) {
      const sprintIdx = sprintSequence.indexOf(story.sprint);
      return sprintIdx !== -1 && sprintIdx >= cutoffIndex;
    }

    // No sprint — use effective date (completedOn ?? updated)
    const effectiveDate = story.completedOn ?? story.updated;
    if (effectiveDate && cutoffStartDate) {
      return effectiveDate >= cutoffStartDate;
    }

    return false;
  });
}

/**
 * Returns archived epics eligible for restore: ALL their child stories
 * are either being restored now or already live (not archived).
 * No status check — restoring, not archiving.
 */
export function getRestorableEpics(epics: Epic[], restoreStoryIds: Set<string>, allStories: Story[]): Epic[] {
  return epics.filter((epic) => {
    if (!epic.isArchived) return false;
    const children = allStories.filter((s) => s.epic === epic.id);
    return children.every((s) => restoreStoryIds.has(s.id) || !s.isArchived);
  });
}

/**
 * Returns archived themes eligible for restore: ALL their child epics
 * are either being restored now or already live (not archived).
 * No status check — restoring, not archiving.
 */
export function getRestorableThemes(themes: Theme[], restoreEpicIds: Set<string>, allEpics: Epic[]): Theme[] {
  return themes.filter((theme) => {
    if (!theme.isArchived) return false;
    const children = allEpics.filter((e) => e.theme === theme.id);
    return children.every((e) => restoreEpicIds.has(e.id) || !e.isArchived);
  });
}

/**
 * Builds a summary plan object from the eligible items.
 */
export function buildArchivePlan(stories: Story[], epics: Epic[], themes: Theme[]): ArchivePlan {
  return {
    stories,
    epics,
    themes,
    storyCount: stories.length,
    epicCount: epics.length,
    themeCount: themes.length,
  };
}

// ─── C2: Path Computation ───────────────────────────────────────────────────

/** Normalize to forward slashes for cross-platform string matching. */
function toFwd(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Computes the archive destination path for a .devstories file.
 * Inserts the archive segment between `.devstories/` and the type folder.
 *
 * Example: .devstories/stories/S1.md → .devstories/archive/stories/S1.md
 */
export function computeArchiveDestination(sourcePath: string, archiveSegment: string): string {
  const fwd = toFwd(sourcePath);
  const marker = ".devstories/";
  const idx = fwd.indexOf(marker);
  if (idx === -1) return sourcePath;

  const afterMarker = idx + marker.length;
  return fwd.slice(0, afterMarker) + archiveSegment + "/" + fwd.slice(afterMarker);
}

/**
 * Computes the archive destination path for a storydocs folder.
 * Inserts the archive segment after the storydocs root.
 *
 * Example: docs/storydocs/stories/S1 → docs/storydocs/archive/stories/S1
 */
export function computeStorydocsArchiveDestination(sourcePath: string, storydocsRoot: string, archiveSegment: string): string {
  const fwdSource = toFwd(sourcePath);
  const fwdRoot = toFwd(storydocsRoot);
  if (!fwdSource.startsWith(fwdRoot)) return sourcePath;

  const relativePart = fwdSource.slice(fwdRoot.length); // starts with "/" e.g. "/stories/S1"
  return fwdRoot + "/" + archiveSegment + relativePart;
}

/**
 * Strips the archive segment from a path to compute the live destination.
 * Inverse of computeArchiveDestination / computeStorydocsArchiveDestination.
 *
 * Example: .devstories/archive/stories/S1.md → .devstories/stories/S1.md
 */
export function computeLiveDestination(archivedPath: string, archiveSegment: string): string {
  const fwd = toFwd(archivedPath);
  const token = `/${archiveSegment}/`;
  const idx = fwd.indexOf(token);
  if (idx !== -1) {
    return fwd.slice(0, idx) + fwd.slice(idx + token.length - 1);
  }
  return archivedPath;
}
