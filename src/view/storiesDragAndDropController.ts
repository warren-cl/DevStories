/**
 * Drag-and-drop controller for the DevStories tree view.
 *
 * Supported moves (Breakdown view):
 *   Story  → Epic   — reassigns story.epic
 *   Epic   → Theme  — reassigns epic.theme (or clears it when dropped on "No Theme")
 *   InboxSpikeFile → Theme/NoTheme — converts to epic
 *   InboxSpikeFile → Epic/NoEpic  — converts to story
 *   InboxSpikeFile → Story        — converts to story at target priority
 *
 * Supported moves (Backlog view):
 *   Story  → SprintNode — story becomes priority 1 in that sprint, bumps others
 *   Story  → Story      — story inserted above target, bumps stories with >= priority
 *   InboxSpikeFile → SprintNode — converts to story in that sprint
 *   InboxSpikeFile → Story      — converts to story at target priority
 *
 * Supported moves (both views):
 *   Task → Parent Story  — task becomes highest priority under that story
 *   Task → Sibling Task  — task inserted below target, bumps siblings with >= priority
 *
 * All other drag/drop combinations are silently refused.
 */

import * as vscode from "vscode";
import { Store } from "../core/store";
import { SortService } from "../core/sortService";
import { ConfigService } from "../core/configService";
import { BrokenFile } from "../types/brokenFile";
import { Epic } from "../types/epic";
import { Story } from "../types/story";
import { Task, isTask } from "../types/task";
import { Theme } from "../types/theme";
import { SprintNode, isSprintNode } from "../types/sprintNode";
import { InboxSpikeNode, InboxSpikeFile, isInboxSpikeNode, isInboxSpikeFile } from "../types/inboxSpikeNode";
import { ViewMode } from "./storiesProviderUtils";
import { updateStoryEpic, updateEpicTheme, clearStoryEpic } from "./storiesDragAndDropControllerUtils";
import { handleBacklogDrop } from "./backlogDropHandler";
import { handleTaskDropOnStory, handleTaskDropOnTask } from "./taskDropHandler";
import { handleInboxDropOnBacklog, handleInboxDropOnBreakdown, BreakdownTarget } from "./inboxDropHandler";
import { getLogger } from "../core/logger";
import { StorydocsService } from "../core/storydocsService";

/** MIME type used to identify items dragged from this tree view. */
const MIME_TYPE = "application/vnd.code.tree.devstories.views.explorer";

/** Sentinel id for the virtual "No Theme" root node (mirrors storiesProvider.ts). */
const NO_THEME_ID = "__NO_THEME__";

/** Sentinel id for the virtual "No Epic" node nested under "No Theme" (mirrors storiesProvider.ts). */
const NO_EPIC_ID = "__NO_EPIC__";

type NodeType = "story" | "epic" | "theme" | "task" | "broken" | "sprintNode" | "inboxSpikeFile" | "inboxSpikeNode";

interface DragPayloadItem {
  id: string;
  nodeType: NodeType;
}

/** Discriminate among all tree node types based on structural shape. */
function getNodeType(node: Theme | Epic | Story | Task | BrokenFile | SprintNode | InboxSpikeNode | InboxSpikeFile): NodeType {
  if (isInboxSpikeFile(node)) {
    return "inboxSpikeFile";
  }
  if (isInboxSpikeNode(node)) {
    return "inboxSpikeNode";
  }
  if (isSprintNode(node)) {
    return "sprintNode";
  }
  if ("broken" in node) {
    return "broken";
  }
  if (isTask(node)) {
    return "task";
  }
  if ("type" in node) {
    return "story";
  }
  if ("theme" in node) {
    return "epic";
  }
  return "theme";
}

// ─── Task sort guard ────────────────────────────────────────────────────────

function isSortedByPriorityAsc(sortService: SortService): boolean {
  return sortService.state.key === "priority" && sortService.state.direction === "asc";
}

async function showTaskSortGuardDialog(sortService: SortService): Promise<void> {
  const switchBtn = "Switch to Priority Sort";
  const choice = await vscode.window.showWarningMessage(
    "Drag-and-drop reordering only works when stories are sorted by priority (ascending). " + "Would you like to switch to priority sort?",
    { modal: true },
    switchBtn,
  );
  if (choice === switchBtn) {
    sortService.setState({ key: "priority", direction: "asc" });
  }
}

export class StoriesDragAndDropController implements vscode.TreeDragAndDropController<
  Theme | Epic | Story | BrokenFile | SprintNode | InboxSpikeNode | InboxSpikeFile
> {
  readonly dragMimeTypes = [MIME_TYPE];
  readonly dropMimeTypes = [MIME_TYPE];

  constructor(
    private readonly store: Store,
    private readonly getViewMode: () => ViewMode = () => "backlog",
    private readonly sortService?: SortService,
    private readonly configService?: ConfigService,
    private readonly storydocsService?: StorydocsService,
  ) {}

  // ─── handleDrag ────────────────────────────────────────────────────────────

  handleDrag(
    source: readonly (Theme | Epic | Story | BrokenFile | SprintNode | InboxSpikeNode | InboxSpikeFile)[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): void {
    // Silently exclude broken files, sprint nodes, and inbox/spike container sentinels — they cannot be moved.
    // Allow InboxSpikeFile nodes and tasks to be dragged.
    const draggable = source.filter((n) => {
      if ("broken" in n) {
        return false;
      }
      if (isSprintNode(n)) {
        return false;
      }
      if (isInboxSpikeNode(n)) {
        return false;
      }
      return true;
    }) as (Theme | Epic | Story | Task | InboxSpikeFile)[];
    if (draggable.length === 0) {
      return;
    }
    const items: DragPayloadItem[] = draggable.map((n) => {
      // InboxSpikeFile uses filePath as id (they don't have story IDs yet)
      if (isInboxSpikeFile(n)) {
        return { id: n.filePath, nodeType: "inboxSpikeFile" as NodeType };
      }
      // Tasks use composite key (story::taskId) to match store key scheme
      if (isTask(n)) {
        return { id: `${n.story}::${n.id}`, nodeType: "task" as NodeType };
      }
      return { id: n.id, nodeType: getNodeType(n) };
    });
    dataTransfer.set(MIME_TYPE, new vscode.DataTransferItem(JSON.stringify(items)));
  }

  // ─── handleDrop ────────────────────────────────────────────────────────────

  async handleDrop(
    target: Theme | Epic | Story | BrokenFile | SprintNode | InboxSpikeNode | InboxSpikeFile | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Refuse drops on the tree root (outside any node)
    if (!target) {
      return;
    }

    // Refuse drops onto broken file nodes, inbox/spike containers, and inbox/spike files
    if ("broken" in target || isInboxSpikeNode(target) || isInboxSpikeFile(target)) {
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

    // ── Task reordering (view-mode agnostic) ────────────────────────────────
    if (dragged.nodeType === "task") {
      if (this.sortService && !isSortedByPriorityAsc(this.sortService)) {
        await showTaskSortGuardDialog(this.sortService);
        return;
      }

      const draggedTask = this.store.getTask(dragged.id);
      if (!draggedTask) {
        return;
      }

      // Task → Parent Story: become highest priority
      if ("type" in target && !isTask(target)) {
        const targetStory = target as Story;
        if (targetStory.id !== draggedTask.story) {
          return;
        }
        await handleTaskDropOnStory({
          draggedTask,
          parentStory: targetStory,
          store: this.store,
        });
        return;
      }

      // Task → Sibling Task: insert below target
      if (isTask(target)) {
        if (target.story !== draggedTask.story) {
          return;
        }
        await handleTaskDropOnTask({
          draggedTask,
          targetTask: target,
          store: this.store,
        });
        return;
      }

      // All other targets: silently refuse
      return;
    }

    // ── Backlog view: priority-based reordering ─────────────────────────────
    if (this.getViewMode() === "backlog") {
      // ── InboxSpikeFile → Backlog drop ─────────────────────────────────────
      if (dragged.nodeType === "inboxSpikeFile") {
        if (!isSprintNode(target) && !("type" in target)) {
          return;
        }
        if (!this.sortService || !this.configService) {
          return;
        }
        const sourceFile = this.findInboxSpikeFile(dragged.id);
        if (!sourceFile) {
          return;
        }
        await handleInboxDropOnBacklog({
          sourceFile,
          target: target as SprintNode | Story,
          store: this.store,
          configService: this.configService,
          sortService: this.sortService,
          storydocsService: this.storydocsService,
        });
        return;
      }

      // Only stories can be dropped in backlog mode
      if (dragged.nodeType !== "story") {
        return;
      }
      // Target must be SprintNode or Story (not Theme/Epic/BrokenFile)
      if (!isSprintNode(target) && !("type" in target)) {
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

    // ── InboxSpikeFile → Breakdown drop ─────────────────────────────────────
    if (dragged.nodeType === "inboxSpikeFile") {
      if (!this.configService) {
        return;
      }
      const sourceFile = this.findInboxSpikeFile(dragged.id);
      if (!sourceFile) {
        return;
      }

      let breakdownTarget: BreakdownTarget | undefined;

      // Theme node (including No Theme sentinel)
      if (targetType === "theme") {
        const theme = target as Theme;
        breakdownTarget = theme.id === NO_THEME_ID ? { kind: "noTheme" } : { kind: "theme", theme };
      }
      // Epic node (including No Epic sentinel)
      else if (targetType === "epic") {
        const epic = target as Epic;
        breakdownTarget = epic.id === NO_EPIC_ID ? { kind: "noEpic" } : { kind: "epic", epic };
      }
      // Story node
      else if (targetType === "story") {
        breakdownTarget = { kind: "story", story: target as Story };
      }

      if (!breakdownTarget) {
        return;
      }

      await handleInboxDropOnBreakdown({
        sourceFile,
        target: breakdownTarget,
        store: this.store,
        configService: this.configService,
        storydocsService: this.storydocsService,
      });
      return;
    }

    // ── Valid combo 0: Story → "No Epic" sentinel — clears epic field ────────
    if (dragged.nodeType === "story" && (target as Epic).id === NO_EPIC_ID) {
      const story = this.store.getStory(dragged.id);
      if (!story || !story.epic) {
        return; // already orphaned, no-op
      }
      await moveStoryToNoEpic(story, this.store);
      return;
    }

    // ── Valid combo 1: Story → Epic ─────────────────────────────────────────
    if (dragged.nodeType === "story" && targetType === "epic") {
      const story = this.store.getStory(dragged.id);
      const targetEpic = target as Epic;

      if (!story) {
        return;
      }
      // No-op if already in this epic
      if (story.epic === targetEpic.id) {
        return;
      }

      await moveStoryToEpic(story, targetEpic, this.store);
      return;
    }

    // ── Valid combo 2: Epic → Theme (or "No Theme") ─────────────────────────
    if (dragged.nodeType === "epic" && targetType === "theme") {
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

      await moveEpicToTheme(epic, newThemeId, this.store);
      return;
    }

    // ── All other combinations: silently refuse ─────────────────────────────
    // (e.g. Story→Theme, Epic→Story, Theme→anything, drop on root)
  }

  // ─── Helper: lookup an InboxSpikeFile by filePath ─────────────────────────

  private findInboxSpikeFile(filePath: string): InboxSpikeFile | undefined {
    const inbox = this.store.getInboxFiles().find((f) => f.filePath === filePath);
    if (inbox) {
      return inbox;
    }
    return this.store.getSpikeFiles().find((f) => f.filePath === filePath);
  }
}

// ─── File mutation helpers ────────────────────────────────────────────────────

async function moveStoryToNoEpic(story: Story, store: Store): Promise<void> {
  if (!story.filePath) {
    return;
  }
  try {
    const fileUri = vscode.Uri.file(story.filePath);
    const bytes = await vscode.workspace.fs.readFile(fileUri);
    const content = new TextDecoder().decode(bytes);
    const updated = clearStoryEpic(content);
    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(updated));
    await store.reloadFile(fileUri);
  } catch (err) {
    getLogger().error(`Failed to clear epic from story ${story.id}`, err);
  }
}

async function moveStoryToEpic(story: Story, targetEpic: Epic, store: Store): Promise<void> {
  if (!story.filePath) {
    return;
  }
  try {
    const fileUri = vscode.Uri.file(story.filePath);
    const bytes = await vscode.workspace.fs.readFile(fileUri);
    const content = new TextDecoder().decode(bytes);
    const updated = updateStoryEpic(content, targetEpic.id);
    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(updated));
    await store.reloadFile(fileUri);
  } catch (err) {
    getLogger().error(`Failed to move story ${story.id} to epic ${targetEpic.id}`, err);
  }
}

async function moveEpicToTheme(epic: Epic, newThemeId: string | undefined, store: Store): Promise<void> {
  if (!epic.filePath) {
    return;
  }
  try {
    const fileUri = vscode.Uri.file(epic.filePath);
    const bytes = await vscode.workspace.fs.readFile(fileUri);
    const content = new TextDecoder().decode(bytes);
    const updated = updateEpicTheme(content, newThemeId);
    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(updated));
    await store.reloadFile(fileUri);
  } catch (err) {
    getLogger().error(`Failed to move epic ${epic.id} to theme ${newThemeId ?? "(none)"}`, err);
  }
}
