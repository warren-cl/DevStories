import * as vscode from 'vscode';
import { Store } from '../core/store';
import { ConfigService } from '../core/configService';
import { ConfigData, parseConfigJsonContent, mergeConfigWithDefaults } from '../core/configServiceUtils';
import { getLogger } from '../core/logger';
import { StorydocsService } from '../core/storydocsService';
import {
  findNextEpicId,
  generateEpicMarkdown,
} from './createEpicUtils';
import { appendEpicToTheme, generateEpicLink } from './createThemeUtils';
import { validateEpicName } from '../utils/inputValidation';
import { toKebabCase } from '../utils/filenameUtils';

// Re-export for convenience
export { findNextEpicId, generateEpicMarkdown } from './createEpicUtils';

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
 * Check for duplicate epic titles
 */
function findSimilarEpic(title: string, store: Store): string | undefined {
  const normalizedTitle = title.toLowerCase().trim();
  for (const epic of store.getEpics()) {
    if (epic.title.toLowerCase().trim() === normalizedTitle) {
      return epic.id;
    }
  }
  return undefined;
}

/**
 * Execute the createEpic command
 * @param preselectedThemeId When called from a tree item context menu, the theme
 *   is pre-selected and the theme QuickPick is skipped entirely. Pass '__NO_THEME__'
 *   to explicitly create the epic without a theme.
 */
export async function executeCreateEpic(store: Store, preselectedThemeId?: string, storydocsService?: StorydocsService, configService?: ConfigService): Promise<boolean> {
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
    prompt: 'Epic title (max 100 chars)',
    placeHolder: 'e.g., User Authentication System',
    validateInput: (value) => {
      const validation = validateEpicName(value);
      return validation.valid ? undefined : validation.error;
    },
  });

  if (!title) {
    return false; // User cancelled
  }

  // Check for duplicate
  const similarEpic = findSimilarEpic(title, store);
  if (similarEpic) {
    const proceed = await vscode.window.showWarningMessage(
      `Epic with similar title already exists: ${similarEpic}. Create anyway?`,
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
    placeHolder: 'e.g., Allow users to securely sign in and manage their accounts',
  });

  // Resolve theme: use pre-selected ID from context menu, or show picker
  let selectedThemeId: string | undefined;

  if (preselectedThemeId !== undefined) {
    // '__NO_THEME__' sentinel means the user right-clicked the virtual "No Theme" node
    if (preselectedThemeId !== '__NO_THEME__') {
      const theme = store.getTheme(preselectedThemeId);
      if (!theme) {
        void vscode.window.showErrorMessage(`DevStories: Theme '${preselectedThemeId}' not found.`);
        return false;
      }
      selectedThemeId = preselectedThemeId;
    }
  } else {
    const themes = store.getThemes();
    if (themes.length > 0) {
      const themeItems: vscode.QuickPickItem[] = [
        { label: '$(x) No Theme', description: 'Leave this epic unassigned to a theme' },
        ...themes.map(t => ({ label: t.id, description: t.title })),
      ];
      const themeChoice = await vscode.window.showQuickPick(themeItems, {
        placeHolder: 'Assign to a theme? (optional)',
        title: 'Select Theme',
      });
      if (themeChoice && !themeChoice.label.startsWith('$(x)')) {
        selectedThemeId = themeChoice.label;
      }
    }
  }

  // Generate ID
  const existingIds = store.getEpics().map(e => e.id);
  const nextNum = findNextEpicId(existingIds, config.epicPrefix);
  const epicId = `${config.epicPrefix}-${String(nextNum).padStart(4, '0')}`;

  // Generate markdown
  const markdown = generateEpicMarkdown({
    id: epicId,
    title,
    goal: goal || undefined,
    theme: selectedThemeId,
  });

  // Write file
  const epicUri = vscode.Uri.joinPath(
    workspaceUri,
    '.devstories',
    'epics',
    `${epicId}-${toKebabCase(title)}.md`
  );

  await vscode.workspace.fs.writeFile(epicUri, Buffer.from(markdown));
  await store.reloadFile(epicUri);

  // Create storydocs folder (best-effort, non-blocking)
  void storydocsService?.ensureFolder(epicId, 'epic');

  // If a theme was selected, append this epic to the theme's ## Epics section
  if (selectedThemeId) {
    const theme = store.getTheme(selectedThemeId);
    if (theme?.filePath) {
      try {
        const themeUri = vscode.Uri.file(theme.filePath);
        const themeBytes = await vscode.workspace.fs.readFile(themeUri);
        const themeContent = Buffer.from(themeBytes).toString('utf8');
        const epicLink = generateEpicLink(epicId, title);
        const updatedThemeContent = appendEpicToTheme(themeContent, epicLink);
        await vscode.workspace.fs.writeFile(themeUri, Buffer.from(updatedThemeContent));
      } catch (err) {
        getLogger().error(`Failed to append epic to theme ${selectedThemeId}:`, err);
      }
    }
  }

  // Open the file
  const doc = await vscode.workspace.openTextDocument(epicUri);
  await vscode.window.showTextDocument(doc);

  void vscode.window.showInformationMessage(`Created epic: ${epicId}`);

  return true;
}
