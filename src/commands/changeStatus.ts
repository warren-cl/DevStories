/**
 * Change Status command - allows changing status via context menu
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ConfigService } from '../core/configService';
import { Store } from '../core/store';
import { getLogger } from '../core/logger';
import { Story } from '../types/story';
import { Epic } from '../types/epic';
import { Theme } from '../types/theme';
import {
  parseStatusesFromConfig,
  updateStoryStatus,
  updateEpicStatus,
  updateThemeStatus,
} from './changeStatusUtils';

/**
 * Read config.json from workspace
 */
async function readConfigJson(): Promise<string | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }

  const configPath = path.join(
    workspaceFolders[0].uri.fsPath,
    '.devstories',
    'config.json'
  );

  try {
    const configUri = vscode.Uri.file(configPath);
    const bytes = await vscode.workspace.fs.readFile(configUri);
    return new TextDecoder().decode(bytes);
  } catch (error) {
    getLogger().debug('Config not found or unreadable', error);
    return undefined;
  }
}

/**
 * Execute the changeStatus command
 * Shows a QuickPick with available statuses
 * @param configService - Optional ConfigService for live-reloaded config
 */
export async function executeChangeStatus(
  store: Store,
  item: Story | Epic | Theme,
  configService?: ConfigService
): Promise<boolean> {
  // DS-035: Use ConfigService if available, otherwise read from file
  let statuses: string[];
  if (configService) {
    statuses = configService.config.statuses.map(s => s.id);
  } else {
    const configContent = await readConfigJson();
    statuses = parseStatusesFromConfig(configContent ?? '');
  }

  // Determine current status
  const currentStatus = item.status;

  // Build QuickPick items with checkmark for current
  const items: vscode.QuickPickItem[] = statuses.map((status) => ({
    label: status === currentStatus ? `$(check) ${status}` : status,
    description: status === currentStatus ? '(current)' : undefined,
    picked: status === currentStatus,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `Change status from "${currentStatus}" to...`,
    title: `Change Status: ${item.id}`,
  });

  if (!selected) {
    return false; // User cancelled
  }

  // Extract status (remove checkmark prefix if present)
  const newStatus = selected.label.replace(/^\$\(check\) /, '');

  if (newStatus === currentStatus) {
    return false; // No change
  }

  // Update the file
  if (!item.filePath) {
    void vscode.window.showErrorMessage('Cannot update: file path unknown');
    return false;
  }

  try {
    const fileUri = vscode.Uri.file(item.filePath);
    const bytes = await vscode.workspace.fs.readFile(fileUri);
    const content = new TextDecoder().decode(bytes);

    // Determine if story, epic, or theme.
    // Use the store's theme map for a structural check — avoids relying on the configurable ID prefix.
    const isStory = 'type' in item;
    const isTheme = !isStory && store.getTheme(item.id) !== undefined;
    let updatedContent: string;
    if (isStory) {
      updatedContent = updateStoryStatus(content, newStatus, configService?.config.statuses);
    } else if (isTheme) {
      updatedContent = updateThemeStatus(content, newStatus);
    } else {
      updatedContent = updateEpicStatus(content, newStatus);
    }

    // Write back
    await vscode.workspace.fs.writeFile(
      fileUri,
      new TextEncoder().encode(updatedContent)
    );

    void vscode.window.showInformationMessage(
      `Updated ${item.id} status to "${newStatus}"`
    );

    return true;
  } catch (err) {
    void vscode.window.showErrorMessage(`Failed to update status: ${err}`);
    return false;
  }
}
