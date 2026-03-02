/**
 * Drag-and-drop controller for the DevStories tree view.
 *
 * Supported moves (Breakdown view):
 *   Story  → Epic   — reassigns story.epic
 *   Epic   → Theme  — reassigns epic.theme (or clears it when dropped on "No Theme")
 *
 * Supported moves (Backlog view):
 *   Story  → SprintNode — story becomes priority 1 in that sprint, bumps others
 *   Story  → Story      — story inserted above target, bumps stories with >= priority
 *
 * All other drag/drop combinations are silently refused.
 */

import * as vscode from 'vscode';
import { Store } from '../core/store';
import { SortService } from '../core/sortService';
import { ConfigService } from '../core/configService';
import { BrokenFile } from '../types/brokenFile';
import { Epic } from '../types/epic';
import { Story } from '../types/story';
import { Theme } from '../types/theme';
import { SprintNode, isSprintNode } from '../types/sprintNode';
import { ViewMode } from './storiesProviderUtils';
import { updateStoryEpic, updateEpicTheme, clearStoryEpic } from './storiesDragAndDropControllerUtils';
import { handleBacklogDrop } from './backlogDropHandler';
import { getLogger } from '../core/logger';

/** MIME type used to identify items dragged from this tree view. */
const MIME_TYPE = 'application/vnd.code.tree.devstories.views.explorer';

/** Sentinel id for the virtual "No Theme" root node (mirrors storiesProvider.ts). */
const NO_THEME_ID = '__NO_THEME__';

/** Sentinel id for the virtual "No Epic" node nested under "No Theme" (mirrors storiesProvider.ts). */
const NO_EPIC_ID = '__NO_EPIC__';

type NodeType = 'story' | 'epic' | 'theme' | 'broken' | 'sprintNode';

interface DragPayloadItem {
  id: string;
  nodeType: NodeType;
}

/** Discriminate among Theme | Epic | Story | BrokenFile | SprintNode based on structural shape. */
function getNodeType(node: Theme | Epic | Story | BrokenFile | SprintNode): NodeType {
  if (isSprintNode(node)) {
    return 'sprintNode';
  }
  if ('broken' in node) {
    return 'broken';
  }
  if ('type' in node) {
    return 'story';
  }
  if ('theme' in node) {
    return 'epic';
  }
  return 'theme';
}

export class StoriesDragAndDropController
  implements vscode.TreeDragAndDropController<Theme | Epic | Story | BrokenFile | SprintNode> {

  readonly dragMimeTypes = [MIME_TYPE];
  readonly dropMimeTypes = [MIME_TYPE];

  constructor(
    private readonly store: Store,
    private readonly getViewMode: () => ViewMode = () => 'backlog',
    private readonly sortService?: SortService,
    private readonly configService?: ConfigService,
  ) {}

  // ─── handleDrag ────────────────────────────────────────────────────────────

  handleDrag(
    source: readonly (Theme | Epic | Story | BrokenFile | SprintNode)[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    // Silently exclude broken files and sprint nodes — they cannot be moved
    const draggable = source.filter(n => !('broken' in n) && !isSprintNode(n)) as (Theme | Epic | Story)[];
    if (draggable.length === 0) {
      return;
    }
    const items: DragPayloadItem[] = draggable.map(n => ({
      id: n.id,
      nodeType: getNodeType(n),
    }));
    dataTransfer.set(MIME_TYPE, new vscode.DataTransferItem(JSON.stringify(items)));
  }

  // ─── handleDrop ────────────────────────────────────────────────────────────

  async handleDrop(
    target: Theme | Epic | Story | BrokenFile | SprintNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Refuse drops on the tree root (outside any node)
    if (!target) {
      return;
    }

    // Refuse drops onto broken file nodes
    if ('broken' in target) {
      return;
    }

    const raw = dataTransfer.get(MIME_TYPE);
    if (!raw) {
      return;
    }

    let items: DragPayloadItem[];
    try {
      items = JSON.parse(await raw.asString());
    } catch {
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    // Only support single-item drags; multi-select drops are silently refused
    if (items.length !== 1) {
      return;
    }

    const [dragged] = items;

    // ── Backlog view: priority-based reordering ─────────────────────────────
    if (this.getViewMode() === 'backlog') {
      // Only stories can be dropped in backlog mode
      if (dragged.nodeType !== 'story') {
        return;
      }
      // Target must be SprintNode or Story (not Theme/Epic/BrokenFile)
      if (!isSprintNode(target) && !('type' in target)) {
        return;
      }
      if (!this.sortService || !this.configService) {
        return;
      }
      await handleBacklogDrop({
        draggedStoryId: dragged.id,
        target: target as SprintNode | Story,
        store: this.store,
        sortService: this.sortService,
        configService: this.configService,
      });
      return;
    }

    // ── Breakdown view: structural moves ─────────────────────────────────────
    // Refuse drops onto sprint nodes in breakdown view
    if (isSprintNode(target)) {
      return;
    }

    const targetType = getNodeType(target);

    // ── Valid combo 0: Story → "No Epic" sentinel — clears epic field ────────
    if (dragged.nodeType === 'story' && (target as Epic).id === NO_EPIC_ID) {
      const story = this.store.getStory(dragged.id);
      if (!story || !story.epic) {
        return; // already orphaned, no-op
      }
      await moveStoryToNoEpic(story);
      return;
    }

    // ── Valid combo 1: Story → Epic ─────────────────────────────────────────
    if (dragged.nodeType === 'story' && targetType === 'epic') {
      const story = this.store.getStory(dragged.id);
      const targetEpic = target as Epic;

      if (!story) {
        return;
      }
      // No-op if already in this epic
      if (story.epic === targetEpic.id) {
        return;
      }

      await moveStoryToEpic(story, targetEpic);
      return;
    }

    // ── Valid combo 2: Epic → Theme (or "No Theme") ─────────────────────────
    if (dragged.nodeType === 'epic' && targetType === 'theme') {
      const epic = this.store.getEpic(dragged.id);
      if (!epic) {
        return;
      }

      // "No Theme" sentinel → clear the theme association
      const isNoTheme = (target as Theme).id === NO_THEME_ID;
      const newThemeId = isNoTheme ? undefined : (target as Theme).id;

      // No-op if theme is unchanged
      if (epic.theme === newThemeId) {
        return;
      }

      await moveEpicToTheme(epic, newThemeId);
      return;
    }

    // ── All other combinations: silently refuse ─────────────────────────────
    // (e.g. Story→Theme, Epic→Story, Theme→anything, drop on root)
  }
}

// ─── File mutation helpers ────────────────────────────────────────────────────

async function moveStoryToNoEpic(story: Story): Promise<void> {
  if (!story.filePath) {
    return;
  }
  try {
    const fileUri = vscode.Uri.file(story.filePath);
    const bytes = await vscode.workspace.fs.readFile(fileUri);
    const content = new TextDecoder().decode(bytes);
    const updated = clearStoryEpic(content);
    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(updated));
  } catch (err) {
    getLogger().error(`Failed to clear epic from story ${story.id}`, err);
  }
}

async function moveStoryToEpic(story: Story, targetEpic: Epic): Promise<void> {
  if (!story.filePath) {
    return;
  }
  try {
    const fileUri = vscode.Uri.file(story.filePath);
    const bytes = await vscode.workspace.fs.readFile(fileUri);
    const content = new TextDecoder().decode(bytes);
    const updated = updateStoryEpic(content, targetEpic.id);
    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(updated));
  } catch (err) {
    getLogger().error(`Failed to move story ${story.id} to epic ${targetEpic.id}`, err);
  }
}

async function moveEpicToTheme(
  epic: Epic,
  newThemeId: string | undefined
): Promise<void> {
  if (!epic.filePath) {
    return;
  }
  try {
    const fileUri = vscode.Uri.file(epic.filePath);
    const bytes = await vscode.workspace.fs.readFile(fileUri);
    const content = new TextDecoder().decode(bytes);
    const updated = updateEpicTheme(content, newThemeId);
    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(updated));
  } catch (err) {
    getLogger().error(`Failed to move epic ${epic.id} to theme ${newThemeId ?? '(none)'}`, err);
  }
}
