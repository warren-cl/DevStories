/**
 * Notification utilities for ConfigService
 * Provides user feedback when config.json has errors
 */

import * as vscode from 'vscode';

// Message constants
export const CONFIG_ERROR_MESSAGE = 'Config has errors, using previous valid config';
export const OPEN_CONFIG_ACTION = 'Open Config';

/**
 * Get the path to config.json for a workspace folder
 */
export function getConfigFilePath(workspaceFolder: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.joinPath(
    workspaceFolder.uri,
    '.devstories',
    'config.json'
  );
}

/**
 * Show warning notification for config parse errors
 * Includes "Open Config" action button
 */
export async function showConfigErrorNotification(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  const action = await vscode.window.showWarningMessage(
    CONFIG_ERROR_MESSAGE,
    OPEN_CONFIG_ACTION
  );

  if (action === OPEN_CONFIG_ACTION && workspaceFolder) {
    const configPath = getConfigFilePath(workspaceFolder);
    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc);
  }
}

/**
 * Show warning notification for sprint validation errors
 * Includes "Open Config" action button
 */
export async function showSprintValidationErrorNotification(error: string): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  const action = await vscode.window.showWarningMessage(
    `Sprint config error: ${error}`,
    OPEN_CONFIG_ACTION
  );

  if (action === OPEN_CONFIG_ACTION && workspaceFolder) {
    const configPath = getConfigFilePath(workspaceFolder);
    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc);
  }
}

export const CONFIG_UPGRADE_MESSAGE = 'DevStories config.json upgraded — new fields added:';
export const OPEN_BACKUP_ACTION = 'Open Backup';

/**
 * Show info notification when config.json has been auto-upgraded.
 * Offers "Open Config" and "Open Backup" actions.
 */
export async function showConfigUpgradeNotification(fieldsAdded: string[]): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const fieldList = fieldsAdded.join(', ');

  const action = await vscode.window.showInformationMessage(
    `${CONFIG_UPGRADE_MESSAGE} ${fieldList}`,
    OPEN_CONFIG_ACTION,
    OPEN_BACKUP_ACTION,
  );

  if (!workspaceFolder) {
    return;
  }

  if (action === OPEN_CONFIG_ACTION) {
    const configPath = getConfigFilePath(workspaceFolder);
    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc);
  } else if (action === OPEN_BACKUP_ACTION) {
    const backupPath = vscode.Uri.joinPath(
      workspaceFolder.uri,
      '.devstories',
      'config.json.bak'
    );
    const doc = await vscode.workspace.openTextDocument(backupPath);
    await vscode.window.showTextDocument(doc);
  }
}
