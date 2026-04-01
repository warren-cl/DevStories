/**
 * Shared pure-function utilities for StoryDocs commands
 * (Browse StoryDocs, Open StoryDocs Folder).
 *
 * No VS Code dependencies — testable with Vitest.
 */

import { Store } from "../core/store";
import { computeNodeFolderPath, computeArchivedNodeFolderPath, type NodeType } from "../core/storydocsUtils";
import { isTask } from "../types/task";

/** Result of resolving a tree-view item to a storydocs-addressable node. */
export interface ResolvedNode {
  readonly id: string;
  readonly nodeType: NodeType;
}

/**
 * Determine the storydocs-addressable node for a tree-view item.
 *
 * - Stories, epics, themes map directly.
 * - Tasks resolve to their parent story (tasks live inside the story folder).
 * - Unrecognised items return `undefined`.
 */
export function resolveNode(store: Store, item: Record<string, unknown>): ResolvedNode | undefined {
  if (isTask(item)) {
    return { id: item.story, nodeType: "story" };
  }
  const id = item.id as string;
  if (store.getStory(id)) {
    return { id, nodeType: "story" };
  }
  if (store.getEpic(id)) {
    return { id, nodeType: "epic" };
  }
  if (store.getTheme(id)) {
    return { id, nodeType: "theme" };
  }
  return undefined;
}

/**
 * Compute the absolute storydocs folder path for a node, choosing the live
 * or archived directory based on `isArchived`.
 */
export function computeStorydocsFolderPath(
  root: string,
  archiveSegment: string,
  nodeId: string,
  nodeType: NodeType,
  isArchived: boolean | undefined,
): string {
  return isArchived ? computeArchivedNodeFolderPath(root, archiveSegment, nodeId, nodeType) : computeNodeFolderPath(root, nodeId, nodeType);
}
