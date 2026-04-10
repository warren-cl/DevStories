/**
 * Open StoryDocs Folder command — reveals the node's storydocs folder
 * in VS Code's file explorer sidebar.
 */

import * as vscode from "vscode";
import * as path from "path";
import { Store } from "../core/store";
import { ConfigService } from "../core/configService";
import { StorydocsService } from "../core/storydocsService";
import { getLogger } from "../core/logger";
import { isStorydocsEnabled } from "../core/storydocsUtils";
import { resolveNode, computeStorydocsFolderPath } from "./storydocsCommandUtils";

export async function executeOpenStorydocsFolder(
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
  const isArchived = item.isArchived as boolean | undefined;
  const folderPath = computeStorydocsFolderPath(root, archiveSegment, node.id, node.nodeType, isArchived);
  const folderUri = vscode.Uri.file(folderPath);

  // Check if folder exists; create it on-demand for live nodes
  try {
    await vscode.workspace.fs.stat(folderUri);
  } catch {
    if (isArchived) {
      void vscode.window.showInformationMessage(`Archived StoryDocs folder for ${node.id} not found.`);
      return;
    }
    getLogger().debug(`StoryDocs: folder not found for ${node.id}, creating it`);
    if (storydocsService) {
      await storydocsService.ensureFolder(node.id, node.nodeType);
    }
  }

  await vscode.commands.executeCommand("revealInExplorer", folderUri);
}
