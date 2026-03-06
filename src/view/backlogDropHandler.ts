/**
 * Backlog view drag-and-drop handler.
 *
 * Orchestrates priority-based reordering when stories are dropped in the
 * BACKLOG view.  The handler is intentionally decoupled from the controller
 * so the orchestration logic (sort-guard, priority bumping, file writes) can
 * be tested with mocks.
 *
 * Drop behaviour:
 *   Story → SprintNode — story becomes priority 1 in that sprint, all other
 *                         stories in the sprint are bumped by +1.
 *   Story → Story      — dropped story takes the target's sprint & priority,
 *                         all stories in the sprint with priority >= target
 *                         are bumped by +1 (the dragged story itself is
 *                         excluded from the bump).
 *
 * Sort guard:
 *   Drops are only valid when the tree is sorted by priority ascending.
 *   If not, a modal dialog offers to switch; the drop itself is always
 *   discarded regardless of the user's answer.
 */

import * as vscode from 'vscode';
import { SortState } from '../core/sortService';
import { Story } from '../types/story';
import { SprintNode, BACKLOG_SPRINT_ID, isSprintNode } from '../types/sprintNode';
import { isBacklogStory } from './storiesProviderUtils';
import { updateStorySprintAndPriority, updateStoryPriorityOnly } from './storiesDragAndDropControllerUtils';
import { getLogger } from '../core/logger';

// ─── Public parameter type ──────────────────────────────────────────────────

/** Minimal store surface needed by the backlog drop handler. */
export interface BacklogDropStore {
  getStory(id: string): Story | undefined;
  getStories(): Story[];
}

/** Minimal sort service surface needed by the backlog drop handler. */
export interface BacklogDropSortService {
  readonly state: SortState;
  setState(state: SortState): void;
}

/** Minimal config service surface needed by the backlog drop handler. */
export interface BacklogDropConfigService {
  readonly config: { sprintSequence: string[] };
}

export interface BacklogDropParams {
  draggedStoryId: string;
  target: SprintNode | Story;
  store: BacklogDropStore;
  sortService: BacklogDropSortService;
  configService: BacklogDropConfigService;
}

// ─── Sort-guard ─────────────────────────────────────────────────────────────

function isSortedByPriorityAsc(state: SortState): boolean {
  return state.key === 'priority' && state.direction === 'asc';
}

/**
 * Show a modal warning and optionally switch sort mode.
 * Returns `true` when the user chose to switch (the drop is still invalid).
 */
async function showSortGuardDialog(sortService: BacklogDropSortService): Promise<boolean> {
  const switchBtn = 'Switch to Priority Sort';
  const choice = await vscode.window.showWarningMessage(
    'Drag-and-drop reordering only works when stories are sorted by priority (ascending). '
    + 'Would you like to switch to priority sort?',
    { modal: true },
    switchBtn,
  );
  if (choice === switchBtn) {
    sortService.setState({ key: 'priority', direction: 'asc' });
    return true;
  }
  return false;
}

// ─── Sprint helpers ─────────────────────────────────────────────────────────

/**
 * Resolve the sprint string to write into the story file for a given target.
 * - Named sprint nodes → the sprint id (e.g. 'sprint-4').
 * - Backlog sentinel   → 'backlog'.
 * - Story target       → the target story's sprint (or 'backlog' if backlog story).
 */
function resolveTargetSprint(
  target: SprintNode | Story,
  sprintSequence: string[],
): string {
  if (isSprintNode(target)) {
    return target.isBacklog ? 'backlog' : target.sprintId;
  }
  // Story target — always return the canonical 'backlog' value when the story belongs to
  // the backlog bucket (covers unrecognised sprint values such as 'sprint-43' that are
  // not in sprintSequence, in addition to the obvious undefined/''/backlog cases).
  const story = target as Story;
  return isBacklogStory(story, sprintSequence) ? 'backlog' : (story.sprint ?? 'backlog');
}

/**
 * Collect every story that belongs to *targetSprint*, according to the same
 * grouping rules the tree view uses.
 */
function getStoriesInSprint(
  store: BacklogDropStore,
  targetSprint: string,
  sprintSequence: string[],
): Story[] {
  const all = store.getStories();
  if (targetSprint.toLowerCase() === 'backlog' || targetSprint === BACKLOG_SPRINT_ID) {
    return all.filter(s => isBacklogStory(s, sprintSequence));
  }
  return all.filter(s => s.sprint === targetSprint);
}

// ─── File write helpers ─────────────────────────────────────────────────────

async function writeStorySprintAndPriority(
  story: Story,
  newSprint: string,
  newPriority: number,
): Promise<void> {
  if (!story.filePath) { return; }
  try {
    const uri = vscode.Uri.file(story.filePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(bytes);
    const updated = updateStorySprintAndPriority(content, newSprint, newPriority);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(updated));
  } catch (err) {
    getLogger().error(`Failed to set sprint/priority on story ${story.id}`, err);
  }
}

async function writeStoryPriority(
  story: Story,
  newPriority: number,
): Promise<void> {
  if (!story.filePath) { return; }
  try {
    const uri = vscode.Uri.file(story.filePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(bytes);
    const updated = updateStoryPriorityOnly(content, newPriority);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(updated));
  } catch (err) {
    getLogger().error(`Failed to bump priority on story ${story.id}`, err);
  }
}

// ─── Main handler ───────────────────────────────────────────────────────────

export async function handleBacklogDrop(params: BacklogDropParams): Promise<void> {
  const { draggedStoryId, target, store, sortService, configService } = params;
  const sprintSequence = configService.config.sprintSequence ?? [];

  // ── Sort guard ──────────────────────────────────────────────────────────
  if (!isSortedByPriorityAsc(sortService.state)) {
    await showSortGuardDialog(sortService);
    return; // drop is always invalid when sort is wrong
  }

  const draggedStory = store.getStory(draggedStoryId);
  if (!draggedStory) { return; }

  if (isSprintNode(target)) {
    // ── Story → SprintNode ────────────────────────────────────────────────
    await handleDropOnSprintNode(draggedStory, target, store, sprintSequence);
  } else {
    // ── Story → Story ─────────────────────────────────────────────────────
    const targetStory = target as Story;
    if (targetStory.id === draggedStory.id) { return; } // no-op: self-drop
    await handleDropOnStory(draggedStory, targetStory, store, sprintSequence);
  }
}

// ─── Story → SprintNode ─────────────────────────────────────────────────────

async function handleDropOnSprintNode(
  draggedStory: Story,
  targetNode: SprintNode,
  store: BacklogDropStore,
  sprintSequence: string[],
): Promise<void> {
  const targetSprint = targetNode.isBacklog ? 'backlog' : targetNode.sprintId;

  // No-op: already in this sprint at priority 1
  if (draggedStory.priority === 1) {
    const alreadyInSprint = targetNode.isBacklog
      ? isBacklogStory(draggedStory, sprintSequence)
      : draggedStory.sprint === targetSprint;
    if (alreadyInSprint) { return; }
  }

  // Collect stories currently in the target sprint (excluding the dragged story)
  const siblings = getStoriesInSprint(store, targetSprint, sprintSequence)
    .filter(s => s.id !== draggedStory.id);

  // 1. Set dragged story to sprint + priority 1
  await writeStorySprintAndPriority(draggedStory, targetSprint, 1);

  // 2. Bump every sibling by +1
  for (const sibling of siblings) {
    await writeStoryPriority(sibling, sibling.priority + 1);
  }
}

// ─── Story → Story ──────────────────────────────────────────────────────────

async function handleDropOnStory(
  draggedStory: Story,
  targetStory: Story,
  store: BacklogDropStore,
  sprintSequence: string[],
): Promise<void> {
  const targetSprint = resolveTargetSprint(targetStory, sprintSequence);
  const targetPriority = targetStory.priority;

  // Collect stories currently in the target sprint (excluding the dragged story)
  const siblings = getStoriesInSprint(store, targetSprint, sprintSequence)
    .filter(s => s.id !== draggedStory.id);

  // 1. Set dragged story to target's sprint + priority
  await writeStorySprintAndPriority(draggedStory, targetSprint, targetPriority);

  // 2. Bump every sibling whose priority >= targetPriority by +1
  for (const sibling of siblings) {
    if (sibling.priority >= targetPriority) {
      await writeStoryPriority(sibling, sibling.priority + 1);
    }
  }
}
