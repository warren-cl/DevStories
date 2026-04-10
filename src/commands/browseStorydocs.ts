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
import { StorydocsService } from "../core/storydocsService";
import { getLogger } from "../core/logger";
import { isStorydocsEnabled } from "../core/storydocsUtils";
import { buildQuickPickItems, type StorydocEntry } from "./browseStorydocsUtils";
import { resolveNode, computeStorydocsFolderPath } from "./storydocsCommandUtils";

export async function executeBrowseStorydocs(
  store: Store,
  configService: ConfigService,
  item: Record<string, unknown> | undefined,
  storydocsService?: StorydocsService,
): Promise<void> {
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
  const archiveSegment = config.archiveSoftStorydocs ?? "archive";
  const isArchived = (item as Record<string, unknown>).isArchived as boolean | undefined;
  const folderPath = computeStorydocsFolderPath(root, archiveSegment, node.id, node.nodeType, isArchived);
  const folderUri = vscode.Uri.file(folderPath);

  // Check if folder exists; create it on-demand if missing
  let dirEntries: [string, vscode.FileType][];
  try {
    dirEntries = await vscode.workspace.fs.readDirectory(folderUri);
  } catch {
    getLogger().debug(`StoryDocs: folder not found for ${node.id}, creating it`);
    if (storydocsService) {
      await storydocsService.ensureFolder(node.id, node.nodeType);
    }
    // After creation the folder is empty — show empty message
    void vscode.window.showInformationMessage(`StoryDocs folder for ${node.id} is empty.`);
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
