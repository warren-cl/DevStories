/**
 * Task drag-and-drop handler.
 *
 * Orchestrates priority-based reordering when tasks are dropped within
 * the same parent story.  Mirrors the backlog drop handler pattern.
 *
 * Drop behaviour:
 *   Task → Parent Story — task becomes the highest-priority task under that
 *                          story; sibling tasks are cascade-bumped.
 *   Task → Sibling Task — dropped task is inserted just below the target;
 *                          sibling tasks with colliding priorities are bumped.
 *
 * Both Breakdown and Backlog views use the same logic — task reprioritization
 * is view-mode agnostic.
 */

import * as vscode from "vscode";
import { Task } from "../types/task";
import { Story } from "../types/story";
import {
  updateTaskPriorityOnly,
  cascadeBumpIfNeeded,
  computeSprintNodeDropPriority,
  type PrioritySibling,
} from "./storiesDragAndDropControllerUtils";
import { getLogger } from "../core/logger";

// ─── Public parameter types ─────────────────────────────────────────────────

/** Minimal store surface needed by the task drop handler. */
export interface TaskDropStore {
  getTasksByStory(storyId: string): Task[];
  reloadFile(uri: vscode.Uri): Promise<void>;
}

export interface TaskDropOnStoryParams {
  draggedTask: Task;
  parentStory: Story;
  store: TaskDropStore;
}

export interface TaskDropOnTaskParams {
  draggedTask: Task;
  targetTask: Task;
  store: TaskDropStore;
}

// ─── File write helper ──────────────────────────────────────────────────────

async function writeTaskPriority(task: Task, newPriority: number, store: TaskDropStore): Promise<void> {
  if (!task.filePath) {
    return;
  }
  try {
    const uri = vscode.Uri.file(task.filePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(bytes);
    const updated = updateTaskPriorityOnly(content, newPriority);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(updated));
    await store.reloadFile(uri);
  } catch (err) {
    getLogger().error(`Failed to set priority on task ${task.id} (story ${task.story})`, err);
  }
}

// ─── Task → Parent Story ────────────────────────────────────────────────────

export async function handleTaskDropOnStory(params: TaskDropOnStoryParams): Promise<void> {
  const { draggedTask, parentStory, store } = params;

  // Only accept drops on the actual parent story
  if (parentStory.id !== draggedTask.story) {
    return;
  }

  const siblings = store.getTasksByStory(draggedTask.story).filter((t) => t.id !== draggedTask.id);

  const siblingData: PrioritySibling[] = siblings.map((t) => ({ id: t.id, priority: t.priority }));
  const { draggedPriority, bumps } = computeSprintNodeDropPriority(siblingData);

  // No-op: already the highest-priority task
  const minSiblingPriority = siblings.length > 0 ? Math.min(...siblings.map((t) => t.priority)) : Infinity;
  if (draggedTask.priority < minSiblingPriority) {
    return;
  }

  await writeTaskPriority(draggedTask, draggedPriority, store);

  for (const bump of bumps) {
    const sibling = siblings.find((t) => t.id === bump.id);
    if (sibling) {
      await writeTaskPriority(sibling, bump.newPriority, store);
    }
  }
}

// ─── Task → Sibling Task ────────────────────────────────────────────────────

export async function handleTaskDropOnTask(params: TaskDropOnTaskParams): Promise<void> {
  const { draggedTask, targetTask, store } = params;

  // Only accept drops on tasks under the same story
  if (targetTask.story !== draggedTask.story) {
    return;
  }

  // No-op: self-drop
  if (targetTask.id === draggedTask.id) {
    return;
  }

  const insertPriority = targetTask.priority + 1;

  const siblings = store.getTasksByStory(draggedTask.story).filter((t) => t.id !== draggedTask.id);

  await writeTaskPriority(draggedTask, insertPriority, store);

  const siblingData: PrioritySibling[] = siblings.map((t) => ({ id: t.id, priority: t.priority }));
  const bumps = cascadeBumpIfNeeded(siblingData, insertPriority);
  for (const bump of bumps) {
    const sibling = siblings.find((t) => t.id === bump.id);
    if (sibling) {
      await writeTaskPriority(sibling, bump.newPriority, store);
    }
  }
}
