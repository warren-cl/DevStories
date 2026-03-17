import * as vscode from 'vscode';
import { Store } from '../core/store';
import { ConfigService } from '../core/configService';
import { ConfigData, parseConfigJsonContent, mergeConfigWithDefaults } from '../core/configServiceUtils';
import { getLogger } from '../core/logger';
import { StorydocsService } from '../core/storydocsService';
import { findNextThemeId, generateThemeMarkdown } from './createThemeUtils';
import { validateThemeName } from '../utils/inputValidation';
import { toKebabCase } from '../utils/filenameUtils';

// Re-export for convenience
export { findNextThemeId, generateThemeMarkdown } from './createThemeUtils';

/**
 * Read config.json from workspace as fallback when ConfigService is not available
 */
async function readConfigFallback(workspaceUri: vscode.Uri): Promise<ConfigData | undefined> {
  const configUri = vscode.Uri.joinPath(workspaceUri, '.devstories', 'config.json');
  try {
    const content = await vscode.workspace.fs.readFile(configUri);
    const parsed = parseConfigJsonContent(Buffer.from(content).toString('utf8'));
    return mergeConfigWithDefaults(parsed);
  } catch (error) {
    getLogger().debug('Config not found or unreadable', error);
    return undefined;
  }
}

/**
 * Check for duplicate theme titles
 */
function findSimilarTheme(title: string, store: Store): string | undefined {
  const normalizedTitle = title.toLowerCase().trim();
  for (const theme of store.getThemes()) {
    if (theme.title.toLowerCase().trim() === normalizedTitle) {
      return theme.id;
    }
  }
  return undefined;
}

/**
 * Execute the createTheme command
 */
export async function executeCreateTheme(store: Store, storydocsService?: StorydocsService, configService?: ConfigService): Promise<boolean> {
  // Check for workspace
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    void vscode.window.showErrorMessage('DevStories: No workspace folder open');
    return false;
  }

  const workspaceUri = workspaceFolders[0].uri;

  // Use ConfigService if available, otherwise read from file
  const config = configService ? configService.config : await readConfigFallback(workspaceUri);
  if (!config) {
    const action = await vscode.window.showErrorMessage(
      'DevStories: No config.json found. Initialize DevStories first.',
      'Initialize'
    );
    if (action === 'Initialize') {
      void vscode.commands.executeCommand('devstories.init');
    }
    return false;
  }

  // Prompt for title
  const title = await vscode.window.showInputBox({
    prompt: 'Theme title (max 100 chars)',
    placeHolder: 'e.g., Platform Reliability',
    validateInput: (value) => {
      const validation = validateThemeName(value);
      return validation.valid ? undefined : validation.error;
    },
  });

  if (!title) {
    return false; // User cancelled
  }

  // Check for duplicate
  const similarTheme = findSimilarTheme(title, store);
  if (similarTheme) {
    const proceed = await vscode.window.showWarningMessage(
      `Theme with similar title already exists: ${similarTheme}. Create anyway?`,
      'Yes',
      'No'
    );
    if (proceed !== 'Yes') {
      return false;
    }
  }

  // Prompt for goal (optional)
  const goal = await vscode.window.showInputBox({
    prompt: 'What\'s the main goal? (optional)',
    placeHolder: 'e.g., Improve system observability and reduce incidents',
  });

  // Generate ID
  const existingIds = store.getThemes().map(t => t.id);
  const nextNum = findNextThemeId(existingIds, config.themePrefix);
  const themeId = `${config.themePrefix}-${String(nextNum).padStart(4, '0')}`;

  // Generate markdown
  const markdown = generateThemeMarkdown({
    id: themeId,
    title,
    goal: goal || undefined,
  });

  // Write file
  const themeUri = vscode.Uri.joinPath(
    workspaceUri,
    '.devstories',
    'themes',
    `${themeId}-${toKebabCase(title)}.md`
  );

  await vscode.workspace.fs.writeFile(themeUri, Buffer.from(markdown));
  await store.reloadFile(themeUri);

  // Create storydocs folder (best-effort, non-blocking)
  void storydocsService?.ensureFolder(themeId, 'theme');

  // Open the file
  const doc = await vscode.workspace.openTextDocument(themeUri);
  await vscode.window.showTextDocument(doc);

  void vscode.window.showInformationMessage(`Created theme: ${themeId}`);

  return true;
}
