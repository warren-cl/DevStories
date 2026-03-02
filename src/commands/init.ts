import * as vscode from 'vscode';
import { getLogger } from '../core/logger';
import {
  detectProjectName,
  generateConfigJson,
  generateSampleEpic,
  generateSampleStory,
  InitConfig,
} from './initUtils';

// Re-export for convenience
export { InitConfig, generateConfigJson, detectProjectName } from './initUtils';

/**
 * Read project files from workspace to detect project name
 */
async function readProjectFiles(workspaceUri: vscode.Uri): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const projectFiles = ['package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod'];

  for (const fileName of projectFiles) {
    try {
      const fileUri = vscode.Uri.joinPath(workspaceUri, fileName);
      const content = await vscode.workspace.fs.readFile(fileUri);
      files.set(fileName, Buffer.from(content).toString('utf8'));
    } catch {
      // Project file doesn't exist - expected scenario, continue checking others
    }
  }

  return files;
}

interface InitOptions {
  createSamples?: boolean;
}

/**
 * Execute the init command
 */
export async function executeInit(options: InitOptions = {}): Promise<boolean> {
  // Check for workspace
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    void vscode.window.showErrorMessage('DevStories: No workspace folder open');
    return false;
  }

  const workspaceUri = workspaceFolders[0].uri;
  const devstoriesUri = vscode.Uri.joinPath(workspaceUri, '.devstories');

  // Check if .devstories already exists
  try {
    await vscode.workspace.fs.stat(devstoriesUri);
    const overwrite = await vscode.window.showWarningMessage(
      'DevStories: .devstories directory already exists. Overwrite config?',
      'Yes',
      'No'
    );
    if (overwrite !== 'Yes') {
      return false;
    }
  } catch {
    // .devstories doesn't exist - expected scenario, proceed with init
  }

  // Detect project name
  const projectFiles = await readProjectFiles(workspaceUri);
  const detectedName = detectProjectName(projectFiles);

  // Prompt for project name
  const projectName = await vscode.window.showInputBox({
    prompt: 'Project name',
    value: detectedName || 'my-project',
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Project name is required';
      }
      return undefined;
    },
  });

  if (!projectName) {
    return false; // User cancelled
  }

  // Prompt for ID prefix
  const prefixChoice = await vscode.window.showQuickPick(
    [
      { label: 'DS', description: 'DevStories default (DS-001, DS-002...)' },
      { label: 'STORY', description: 'Standard story prefix (STORY-001...)' },
      { label: 'US', description: 'User Story (US-001...)' },
      { label: 'FEAT', description: 'Feature (FEAT-001...)' },
      { label: 'Custom...', description: 'Enter a custom prefix' },
    ],
    { placeHolder: 'Select story ID prefix' }
  );

  if (!prefixChoice) {
    return false; // User cancelled
  }

  let storyPrefix = prefixChoice.label;
  if (storyPrefix === 'Custom...') {
    const custom = await vscode.window.showInputBox({
      prompt: 'Enter custom story prefix (e.g., PROJ, TASK)',
      validateInput: (value) => {
        if (!value || !/^[A-Z]+$/.test(value)) {
          return 'Prefix must be uppercase letters only';
        }
        return undefined;
      },
    });
    if (!custom) {
      return false;
    }
    storyPrefix = custom;
  }

  // Prompt for initial sprint
  const sprint = await vscode.window.showInputBox({
    prompt: 'Initial sprint name',
    value: 'sprint-1',
  });

  if (!sprint) {
    return false;
  }

  // Ask about sample content
  let createSamples = options.createSamples;
  if (createSamples === undefined) {
    const sampleChoice = await vscode.window.showQuickPick(
      [
        { label: 'Yes', description: 'Create example epic and story to help me get started' },
        { label: 'No', description: 'Start with empty directories' },
      ],
      { placeHolder: 'Create sample epic and story?' }
    );
    createSamples = sampleChoice?.label === 'Yes';
  }

  // Generate config
  const config: InitConfig = {
    projectName,
    epicPrefix: 'EPIC',
    storyPrefix,
    themePrefix: 'THEME',
    sprint,
  };

  // Create directories
  const storiesUri = vscode.Uri.joinPath(devstoriesUri, 'stories');
  const epicsUri = vscode.Uri.joinPath(devstoriesUri, 'epics');
  const themesUri = vscode.Uri.joinPath(devstoriesUri, 'themes');

  await vscode.workspace.fs.createDirectory(devstoriesUri);
  await vscode.workspace.fs.createDirectory(storiesUri);
  await vscode.workspace.fs.createDirectory(epicsUri);
  await vscode.workspace.fs.createDirectory(themesUri);

  // Write config.json
  const configUri = vscode.Uri.joinPath(devstoriesUri, 'config.json');
  const configContent = generateConfigJson(config);
  await vscode.workspace.fs.writeFile(configUri, Buffer.from(configContent));

  // Create sample content if requested
  if (createSamples) {
    const sampleEpic = generateSampleEpic(storyPrefix);
    const sampleStory = generateSampleStory(sprint, storyPrefix);

    const epicUri = vscode.Uri.joinPath(epicsUri, 'EPIC-001-sample-epic-delete-me.md');
    const storyUri = vscode.Uri.joinPath(storiesUri, `${storyPrefix}-001-sample-story-delete-me.md`);

    await vscode.workspace.fs.writeFile(epicUri, Buffer.from(sampleEpic));
    await vscode.workspace.fs.writeFile(storyUri, Buffer.from(sampleStory));
  }

  // Check if git is available and offer to stage
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (gitExtension) {
    const git = gitExtension.exports.getAPI(1);
    const repo = git.repositories[0];
    if (repo) {
      const stageChoice = await vscode.window.showQuickPick(
        [
          { label: 'Yes', description: 'Stage .devstories/ for commit' },
          { label: 'No', description: 'Skip git staging' },
        ],
        { placeHolder: 'Stage .devstories/ for git commit?' }
      );

      if (stageChoice?.label === 'Yes') {
        try {
          await repo.add(['.devstories']);
          void vscode.window.showInformationMessage('DevStories: Staged .devstories/ for commit');
        } catch (error) {
          // Git staging failed - non-critical, just log
          getLogger().debug('Git staging failed', error);
        }
      }
    }
  }

  // Show success message with next steps
  const action = await vscode.window.showInformationMessage(
    '✅ DevStories initialized! Created .devstories/ directory.',
    'Open Config',
    'Create Epic'
  );

  if (action === 'Open Config') {
    const doc = await vscode.workspace.openTextDocument(configUri);
    await vscode.window.showTextDocument(doc);
  } else if (action === 'Create Epic') {
    // This will be implemented in DS-011
    void vscode.commands.executeCommand('devstories.createEpic');
  }

  return true;
}
