import * as vscode from 'vscode';
import { getLogger } from '../core/logger';
import { Story } from '../types/story';
import { extractTemplateContent, generateTemplateFileName } from './saveAsTemplateUtils';
import { ConfigService } from '../core/configService';

// Re-export for convenience
export { extractTemplateContent, generateTemplateFileName } from './saveAsTemplateUtils';

/**
 * Execute the saveAsTemplate command
 * Can be called from tree view context menu or command palette
 */
export async function executeSaveAsTemplate(storyArg?: Story, configService?: ConfigService): Promise<boolean> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    void vscode.window.showErrorMessage('DevStories: No workspace folder open');
    return false;
  }

  const workspaceUri = workspaceFolders[0].uri;

  // Get story file path - either from argument or active editor
  let storyFilePath: string | undefined;

  if (storyArg?.filePath) {
    storyFilePath = storyArg.filePath;
  } else {
    // Check active editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.uri.path.includes('.devstories/stories/')) {
      storyFilePath = activeEditor.document.uri.fsPath;
    }
  }

  if (!storyFilePath) {
    void vscode.window.showErrorMessage('DevStories: No story file selected. Open a story file or use context menu.');
    return false;
  }

  // Read story content
  let fileContent: string;
  try {
    const storyUri = vscode.Uri.file(storyFilePath);
    const content = await vscode.workspace.fs.readFile(storyUri);
    fileContent = Buffer.from(content).toString('utf8');
  } catch (error) {
    getLogger().warn('Failed to read story file', error);
    void vscode.window.showErrorMessage('DevStories: Failed to read story file');
    return false;
  }

  // Extract template content
  const templateContent = extractTemplateContent(fileContent);

  if (!templateContent) {
    void vscode.window.showWarningMessage('DevStories: Story has no content to save as template');
    return false;
  }

  // Ask for template name
  const templateName = await vscode.window.showInputBox({
    prompt: 'Template name',
    placeHolder: 'e.g., api-endpoint, react-form, bug-triage',
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Template name is required';
      }
      if (!/^[a-zA-Z0-9\s-]+$/.test(value)) {
        return 'Template name can only contain letters, numbers, spaces, and hyphens';
      }
      return undefined;
    },
  });

  if (!templateName) {
    return false;
  }

  // Create templates directory if needed
  const storyTemplateRoot = configService?.config?.storyTemplateRoot;
  const templatesDir = storyTemplateRoot
    ? vscode.Uri.joinPath(workspaceUri, storyTemplateRoot)
    : vscode.Uri.joinPath(workspaceUri, '.devstories', 'templates');
  try {
    await vscode.workspace.fs.createDirectory(templatesDir);
  } catch {
    // Directory already exists - expected scenario
  }

  // Generate filename
  const fileName = generateTemplateFileName(templateName);
  const templateUri = vscode.Uri.joinPath(templatesDir, fileName);

  // Check if template already exists
  try {
    await vscode.workspace.fs.stat(templateUri);
    const overwrite = await vscode.window.showWarningMessage(
      `Template "${fileName}" already exists. Overwrite?`,
      'Yes',
      'No'
    );
    if (overwrite !== 'Yes') {
      return false;
    }
  } catch {
    // Template doesn't exist - expected scenario, proceed
  }

  // Write template file
  await vscode.workspace.fs.writeFile(templateUri, Buffer.from(templateContent));

  const action = await vscode.window.showInformationMessage(
    `Template saved: ${fileName}`,
    'Open Template'
  );

  if (action === 'Open Template') {
    const doc = await vscode.workspace.openTextDocument(templateUri);
    await vscode.window.showTextDocument(doc);
  }

  return true;
}
