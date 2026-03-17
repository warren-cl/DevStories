/**
 * Browse StoryDocs command — shows a QuickPick of files and subfolders
 * inside a tree node's storydocs folder.
 *
 * - File selected  → opens in VS Code's default editor
 * - Folder selected → reveals in the file explorer sidebar
 */

import * as vscode from "vscode";
import * as path from "path";
import { Store } from "../core/store";
import { ConfigService } from "../core/configService";
import { getLogger } from "../core/logger";
import { isStorydocsEnabled, computeNodeFolderPath, type NodeType } from "../core/storydocsUtils";
import { buildQuickPickItems, type StorydocEntry } from "./browseStorydocsUtils";

/**
 * Determine node type for an item clicked in the tree view.
 * Returns the ID and NodeType, or undefined if the item isn't a story/epic/theme.
 */
function resolveNode(store: Store, item: { id: string }): { id: string; nodeType: NodeType } | undefined {
  if (store.getStory(item.id)) {
    return { id: item.id, nodeType: "story" };
  }
  if (store.getEpic(item.id)) {
    return { id: item.id, nodeType: "epic" };
  }
  if (store.getTheme(item.id)) {
    return { id: item.id, nodeType: "theme" };
  }
  return undefined;
}

export async function executeBrowseStorydocs(store: Store, configService: ConfigService, item: { id: string } | undefined): Promise<void> {
  if (!item) {
    return;
  }

  const config = configService.config;
  if (!isStorydocsEnabled(config)) {
    void vscode.window.showInformationMessage("StoryDocs is not enabled in config.json.");
    return;
  }

  const node = resolveNode(store, item);
  if (!node) {
    return;
  }

  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) {
    return;
  }

  const root = path.join(ws.uri.fsPath, config.storydocsRoot!);
  const folderPath = computeNodeFolderPath(root, node.id, node.nodeType);
  const folderUri = vscode.Uri.file(folderPath);

  // Check if folder exists
  let dirEntries: [string, vscode.FileType][];
  try {
    dirEntries = await vscode.workspace.fs.readDirectory(folderUri);
  } catch (err) {
    getLogger().debug(`StoryDocs: folder not found for ${node.id}`, err);
    void vscode.window.showInformationMessage(`No StoryDocs folder found for ${node.id}.`);
    return;
  }

  if (dirEntries.length === 0) {
    void vscode.window.showInformationMessage(`StoryDocs folder for ${node.id} is empty.`);
    return;
  }

  // Convert to our pure-function format
  const entries: StorydocEntry[] = dirEntries.map(([name, fileType]) => ({
    name,
    isDirectory: (fileType & vscode.FileType.Directory) !== 0,
  }));

  const pickItems = buildQuickPickItems(entries);

  const selected = await vscode.window.showQuickPick(pickItems, {
    placeHolder: `StoryDocs: ${node.id}`,
    matchOnDescription: true,
  });

  if (!selected) {
    return;
  }

  const selectedUri = vscode.Uri.file(path.join(folderPath, selected.name));

  if (selected.isDirectory) {
    // Reveal subfolder in the file explorer
    await vscode.commands.executeCommand("revealInExplorer", selectedUri);
  } else {
    // Open file in default editor
    await vscode.commands.executeCommand("vscode.open", selectedUri);
  }
}
