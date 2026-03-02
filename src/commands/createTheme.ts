import * as vscode from 'vscode';
import { Store } from '../core/store';
import { getLogger } from '../core/logger';
import { parseConfigJson, DevStoriesConfig } from './createEpicUtils';
import { findNextThemeId, generateThemeMarkdown } from './createThemeUtils';
import { validateThemeName } from '../utils/inputValidation';
import { toKebabCase } from '../utils/filenameUtils';

// Re-export for convenience
export { findNextThemeId, generateThemeMarkdown } from './createThemeUtils';

/**
 * Read and parse config.json from workspace
 */
async function readConfig(workspaceUri: vscode.Uri): Promise<DevStoriesConfig | undefined> {
  const configUri = vscode.Uri.joinPath(workspaceUri, '.devstories', 'config.json');
  try {
    const content = await vscode.workspace.fs.readFile(configUri);
    return parseConfigJson(Buffer.from(content).toString('utf8'));
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
export async function executeCreateTheme(store: Store): Promise<boolean> {
  // Check for workspace
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    void vscode.window.showErrorMessage('DevStories: No workspace folder open');
    return false;
  }

  const workspaceUri = workspaceFolders[0].uri;

  // Read config
  const config = await readConfig(workspaceUri);
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
  const themePrefix = config.themePrefix ?? 'THEME';
  const existingIds = store.getThemes().map(t => t.id);
  const nextNum = findNextThemeId(existingIds, themePrefix);
  const themeId = `${themePrefix}-${String(nextNum).padStart(4, '0')}`;

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

  // Open the file
  const doc = await vscode.workspace.openTextDocument(themeUri);
  await vscode.window.showTextDocument(doc);

  void vscode.window.showInformationMessage(`Created theme: ${themeId}`);

  return true;
}
