/**
 * StorydocsService — manages flat, type-based document folders for stories,
 * epics, and themes.
 *
 * Folder layout mirrors .devstories/:
 *   storydocs/themes/THEME-ID/
 *   storydocs/epics/EPIC-ID/
 *   storydocs/stories/DS-ID/
 *
 * The feature is opt-in via config.json:
 *   "storydocs": { "enabled": true, "root": "docs/storydocs" }
 */

import * as vscode from "vscode";
import * as path from "path";
import { Store } from "./store";
import { ConfigService } from "./configService";
import { getLogger } from "./logger";
import {
  isStorydocsEnabled,
  computeNodeFolderPath,
  computeArchivedNodeFolderPath,
  computeTaskFolderPath,
  computeOrphanFolders,
  TYPE_FOLDERS,
  NodeType,
} from "./storydocsUtils";

export class StorydocsService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private store: Store,
    private configService: ConfigService,
  ) {}

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Resolve the absolute storydocs root folder path for the current workspace.
   * Returns undefined if storydocs is not enabled or no workspace is open.
   */
  private getRoot(): string | undefined {
    const config = this.configService.config;
    if (!isStorydocsEnabled(config)) {
      return undefined;
    }
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) {
      return undefined;
    }
    return path.join(ws.uri.fsPath, config.storydocsRoot!);
  }

  /**
   * Ensure a storydocs folder exists for a given tree node.
   * Called after create commands (createTheme, createEpic, createStory, quickCapture)
   * and inbox/spike conversion.
   */
  async ensureFolder(nodeId: string, nodeType: NodeType): Promise<void> {
    const root = this.getRoot();
    if (!root) {
      return;
    }

    const folderPath = computeNodeFolderPath(root, nodeId, nodeType);
    await this.createDirectoryIfMissing(folderPath);
  }

  /**
   * Walk all themes, epics, and stories in the Store.
   * Create any missing storydocs folders.
   */
  async reconcileAll(): Promise<void> {
    const root = this.getRoot();
    if (!root) {
      return;
    }

    const logger = getLogger();
    logger.info("StoryDocs: reconciling folders...");
    let created = 0;

    for (const theme of this.store.getThemes()) {
      if (theme.isArchived) {
        continue;
      }
      if (await this.createDirectoryIfMissing(computeNodeFolderPath(root, theme.id, "theme"))) {
        created++;
      }
    }

    for (const epic of this.store.getEpics()) {
      if (epic.isArchived) {
        continue;
      }
      if (await this.createDirectoryIfMissing(computeNodeFolderPath(root, epic.id, "epic"))) {
        created++;
      }
    }

    for (const story of this.store.getStories()) {
      if (story.isArchived) {
        continue;
      }
      if (await this.createDirectoryIfMissing(computeNodeFolderPath(root, story.id, "story"))) {
        created++;
      }
    }

    logger.info(`StoryDocs: reconciliation complete — ${created} folder(s) created`);

    // Prune orphan empty folders whose node no longer exists in the store
    const pruned = await this.pruneOrphanFolders(root);
    if (pruned > 0) {
      logger.info(`StoryDocs: pruned ${pruned} orphan empty folder(s)`);
    }
  }

  /**
   * Ensure the tasks subfolder exists within a story's storydocs folder.
   * Called by the createTask command before writing the task file.
   */
  async ensureTaskFolder(storyId: string): Promise<void> {
    const root = this.getRoot();
    if (!root) {
      return;
    }

    const folderPath = computeTaskFolderPath(root, storyId);
    await this.createDirectoryIfMissing(folderPath);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Create a directory (and parents) if it doesn't exist.
   * Returns true if the directory was created, false if it already existed.
   */
  private async createDirectoryIfMissing(folderPath: string): Promise<boolean> {
    const uri = vscode.Uri.file(folderPath);
    try {
      await vscode.workspace.fs.stat(uri);
      return false; // Already exists
    } catch {
      // Doesn't exist — create it
      try {
        await vscode.workspace.fs.createDirectory(uri);
        getLogger().debug(`StoryDocs: created folder ${folderPath}`);
        return true;
      } catch (err) {
        getLogger().error(`StoryDocs: failed to create folder ${folderPath}`, err);
        return false;
      }
    }
  }

  /**
   * Delete a directory only if it exists and is empty.
   * Returns true if the directory was deleted.
   */
  private async deleteIfEmpty(folderPath: string): Promise<boolean> {
    const uri = vscode.Uri.file(folderPath);
    try {
      const entries = await vscode.workspace.fs.readDirectory(uri);
      if (entries.length === 0) {
        await vscode.workspace.fs.delete(uri);
        getLogger().info(`StoryDocs: removed empty orphan folder ${folderPath}`);
        return true;
      }
    } catch {
      // Folder doesn't exist or not readable — nothing to clean up
    }
    return false;
  }

  /**
   * Scan live and archive storydocs directories for folders whose node ID
   * is not in the store, and delete them if empty.
   */
  private async pruneOrphanFolders(root: string): Promise<number> {
    const archiveSegment = this.configService.config.archiveSoftStorydocs ?? "archive";
    const nodeTypes: NodeType[] = ["theme", "epic", "story"];
    let pruned = 0;

    for (const nodeType of nodeTypes) {
      // Build sets of known IDs for live and archived nodes
      const liveIds = new Set<string>();
      const archivedIds = new Set<string>();
      for (const node of this.getNodesOfType(nodeType)) {
        if (node.isArchived) {
          archivedIds.add(node.id);
        } else {
          liveIds.add(node.id);
        }
      }

      // Prune live directory
      const liveDir = path.join(root, TYPE_FOLDERS[nodeType]);
      pruned += await this.pruneDirectory(liveDir, liveIds);

      // Prune archive directory
      const archiveDir = path.join(root, archiveSegment, TYPE_FOLDERS[nodeType]);
      pruned += await this.pruneDirectory(archiveDir, archivedIds);
    }

    return pruned;
  }

  private getNodesOfType(nodeType: NodeType): { id: string; isArchived?: boolean }[] {
    switch (nodeType) {
      case "theme":
        return this.store.getThemes();
      case "epic":
        return this.store.getEpics();
      case "story":
        return this.store.getStories();
    }
  }

  /**
   * Read a directory listing, find orphan folders, and delete empty ones.
   */
  private async pruneDirectory(dirPath: string, knownIds: Set<string>): Promise<number> {
    const uri = vscode.Uri.file(dirPath);
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(uri);
    } catch {
      return 0; // Directory doesn't exist
    }

    const folderNames = entries.filter(([, type]) => type === vscode.FileType.Directory).map(([name]) => name);

    const orphans = computeOrphanFolders(folderNames, knownIds);
    let pruned = 0;
    for (const orphan of orphans) {
      if (await this.deleteIfEmpty(path.join(dirPath, orphan))) {
        pruned++;
      }
    }
    return pruned;
  }
}
