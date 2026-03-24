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

import * as vscode from 'vscode';
import * as path from 'path';
import { Store } from './store';
import { ConfigService } from './configService';
import { getLogger } from './logger';
import {
  isStorydocsEnabled,
  computeNodeFolderPath,
  computeTaskFolderPath,
  NodeType,
} from './storydocsUtils';

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
  async ensureFolder(
    nodeId: string,
    nodeType: NodeType,
  ): Promise<void> {
    const root = this.getRoot();
    if (!root) { return; }

    const folderPath = computeNodeFolderPath(root, nodeId, nodeType);
    await this.createDirectoryIfMissing(folderPath);
  }

  /**
   * Walk all themes, epics, and stories in the Store.
   * Create any missing storydocs folders.
   */
  async reconcileAll(): Promise<void> {
    const root = this.getRoot();
    if (!root) { return; }

    const logger = getLogger();
    logger.info('StoryDocs: reconciling folders...');
    let created = 0;

    for (const theme of this.store.getThemes()) {
      if (await this.createDirectoryIfMissing(computeNodeFolderPath(root, theme.id, 'theme'))) { created++; }
    }

    for (const epic of this.store.getEpics()) {
      if (await this.createDirectoryIfMissing(computeNodeFolderPath(root, epic.id, 'epic'))) { created++; }
    }

    for (const story of this.store.getStories()) {
      if (await this.createDirectoryIfMissing(computeNodeFolderPath(root, story.id, 'story'))) { created++; }
    }

    logger.info(`StoryDocs: reconciliation complete — ${created} folder(s) created`);
  }

  /**
   * Check if a node's storydocs folder is empty and delete it if so.
   * Called when a node's .devstories file is deleted.
   */
  async cleanupEmptyFolder(
    nodeId: string,
    nodeType: NodeType,
  ): Promise<void> {
    const root = this.getRoot();
    if (!root) { return; }

    const folderPath = computeNodeFolderPath(root, nodeId, nodeType);
    await this.deleteIfEmpty(folderPath);
  }

  /**
   * Ensure the tasks subfolder exists within a story's storydocs folder.
   * Called by the createTask command before writing the task file.
   */
  async ensureTaskFolder(storyId: string): Promise<void> {
    const root = this.getRoot();
    if (!root) { return; }

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
   */
  private async deleteIfEmpty(folderPath: string): Promise<void> {
    const uri = vscode.Uri.file(folderPath);
    try {
      const entries = await vscode.workspace.fs.readDirectory(uri);
      if (entries.length === 0) {
        await vscode.workspace.fs.delete(uri);
        getLogger().info(`StoryDocs: removed empty folder ${folderPath}`);
      }
    } catch {
      // Folder doesn't exist or not readable — nothing to clean up
    }
  }
}
