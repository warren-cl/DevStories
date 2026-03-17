import * as vscode from 'vscode';
import { Store } from '../core/store';
import { ConfigService } from '../core/configService';
import { ConfigData, parseConfigJsonContent, mergeConfigWithDefaults } from '../core/configServiceUtils';
import { getLogger } from '../core/logger';
import { StorydocsService } from '../core/storydocsService';
import { StoryType, StorySize } from '../types/story';
import { toKebabCase } from '../utils/filenameUtils';
import {
  findNextStoryId,
  getSuggestedSize,
  calculateTitleSimilarity,
  generateStoryMarkdown,
  generateStoryLink,
  appendStoryToEpic,
  DEFAULT_TEMPLATES,
  parseCustomTemplate,
  CustomTemplate,
} from './createStoryUtils';
import { validateStoryTitle, validateSprintName } from '../utils/inputValidation';

// Re-export for convenience
export {
  findNextStoryId,
  getSuggestedSize,
  calculateTitleSimilarity,
  generateStoryMarkdown,
  generateStoryLink,
  appendStoryToEpic,
} from './createStoryUtils';

/**
 * Collect existing story IDs by scanning the stories folder on disk.
 * Combines disk-based filenames with store IDs so the ID counter is always
 * accurate even if the FileSystemWatcher hasn't fired yet (Windows race).
 */
async function collectExistingStoryIds(
  workspaceUri: vscode.Uri,
  storyPrefix: string,
  store: Store
): Promise<string[]> {
  // Scan filenames on disk — this is the ground truth
  const pattern = new vscode.RelativePattern(
    workspaceUri,
    `.devstories/stories/${storyPrefix}-*.md`
  );
  const storyFiles = await vscode.workspace.findFiles(pattern);
  const diskIds = storyFiles
    .map(uri => {
      const filename = uri.path.split('/').pop() ?? '';
      const match = filename.match(new RegExp(`^(${storyPrefix}-\\d+)`));
      return match ? match[1] : null;
    })
    .filter((id): id is string => id !== null);

  // Also include store IDs — covers items added in the same session that
  // findFiles might not see yet if the filesystem index is briefly stale
  const storeIds = store.getStories().map(s => s.id);

  return [...new Set([...diskIds, ...storeIds])];
}

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
 * Load custom templates from .devstories/templates/ folder
 */
async function loadCustomTemplates(workspaceUri: vscode.Uri): Promise<CustomTemplate[]> {
  const templatesUri = vscode.Uri.joinPath(workspaceUri, '.devstories', 'templates');
  const templates: CustomTemplate[] = [];

  try {
    const entries = await vscode.workspace.fs.readDirectory(templatesUri);
    for (const [filename, fileType] of entries) {
      if (fileType === vscode.FileType.File && filename.endsWith('.md')) {
        const fileUri = vscode.Uri.joinPath(templatesUri, filename);
        const content = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
        templates.push(parseCustomTemplate(filename, content));
      }
    }
  } catch (error) {
    // Templates folder doesn't exist or not readable - expected scenario
    getLogger().debug('Templates folder not found', error);
  }

  return templates;
}

/**
 * Get existing sprints from config and store
 */
function getExistingSprints(config: ConfigData, store: Store): string[] {
  const sprints = new Set<string>();

  if (config.currentSprint) {
    sprints.add(config.currentSprint);
  }

  for (const story of store.getStories()) {
    if (story.sprint) {
      sprints.add(story.sprint);
    }
  }

  return Array.from(sprints).sort();
}

/**
 * Check for similar story titles
 */
function findSimilarStory(title: string, store: Store): { id: string; title: string } | undefined {
  const SIMILARITY_THRESHOLD = 0.8;

  for (const story of store.getStories()) {
    const similarity = calculateTitleSimilarity(title, story.title);
    if (similarity >= SIMILARITY_THRESHOLD) {
      return { id: story.id, title: story.title };
    }
  }
  return undefined;
}

interface TypeQuickPickItem extends vscode.QuickPickItem {
  value: StoryType;
}

interface SizeQuickPickItem extends vscode.QuickPickItem {
  value: StorySize;
}

interface TemplateQuickPickItem extends vscode.QuickPickItem {
  templateRef?: string; // @library/name or undefined for default
  customContent?: string; // Direct content for custom templates
}

/**
 * Execute the createStory command
 * @param preselectedEpicId When called from a tree item context menu, the epic
 *   is pre-selected and the QuickPick is skipped entirely.
 */
export async function executeCreateStory(store: Store, preselectedEpicId?: string, storydocsService?: StorydocsService, configService?: ConfigService): Promise<boolean> {
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

  // Get epics for picker
  const epics = store.getEpics();
  if (epics.length === 0) {
    const action = await vscode.window.showWarningMessage(
      'DevStories: No epics found. Create an epic first.',
      'Create Epic'
    );
    if (action === 'Create Epic') {
      void vscode.commands.executeCommand('devstories.createEpic');
    }
    return false;
  }

  // Resolve epic: use pre-selected ID from context menu, or show picker
  let selectedEpic: { label: string; description: string; id: string } | undefined;

  if (preselectedEpicId) {
    const epic = store.getEpic(preselectedEpicId);
    if (!epic) {
      void vscode.window.showErrorMessage(`DevStories: Epic '${preselectedEpicId}' not found.`);
      return false;
    }
    selectedEpic = { label: `[${epic.id}] ${epic.title}`, description: epic.status, id: epic.id };
  } else {
    const epicOptions = epics.map(e => ({
      label: `[${e.id}] ${e.title}`,
      description: e.status,
      id: e.id,
    }));
    selectedEpic = await vscode.window.showQuickPick(epicOptions, {
      placeHolder: 'Select parent epic',
    });
    if (!selectedEpic) {
      return false;
    }
  }

  // Story title
  const title = await vscode.window.showInputBox({
    prompt: 'Story title (max 200 chars)',
    placeHolder: 'e.g., Add dark mode toggle',
    validateInput: (value) => {
      const validation = validateStoryTitle(value);
      return validation.valid ? undefined : validation.error;
    },
  });

  if (!title) {
    return false;
  }

  // Check for duplicate
  const similarStory = findSimilarStory(title, store);
  if (similarStory) {
    const proceed = await vscode.window.showWarningMessage(
      `Similar story exists: ${similarStory.id} - "${similarStory.title}". Create anyway?`,
      'Yes',
      'No'
    );
    if (proceed !== 'Yes') {
      return false;
    }
  }

  // Type picker
  const typeOptions: TypeQuickPickItem[] = [
    { label: '$(lightbulb) Feature', description: 'New functionality', value: 'feature' },
    { label: '$(bug) Bug', description: 'Something is broken', value: 'bug' },
    { label: '$(tasklist) Task', description: 'Work to be done', value: 'task' },
    { label: '$(tools) Chore', description: 'Maintenance work', value: 'chore' },
    { label: '$(beaker) Spike', description: 'Time-boxed investigation', value: 'spike' },
  ];

  const selectedType = await vscode.window.showQuickPick(typeOptions, {
    placeHolder: 'Select story type',
  });

  if (!selectedType) {
    return false;
  }

  // Template picker - offer to use library template, custom template, or default
  const templateOptions: TemplateQuickPickItem[] = [
    { label: '$(file-text) Default', description: `Use default ${selectedType.value} template` },
  ];

  // Add relevant bundled library templates based on type
  if (selectedType.value === 'feature') {
    templateOptions.push(
      { label: '$(cloud) API Endpoint', description: 'REST API implementation checklist', templateRef: '@library/api-endpoint' },
      { label: '$(symbol-class) React Component', description: 'Component with props, tests, storybook', templateRef: '@library/react-component' },
      { label: '$(database) DB Migration', description: 'Migration steps, rollback plan', templateRef: '@library/db-migration' },
    );
  } else if (selectedType.value === 'bug') {
    templateOptions.push(
      { label: '$(search) Bug Investigation', description: 'Deep investigation template', templateRef: '@library/bug-investigation' },
    );
  }

  // Load and add custom templates from .devstories/templates/
  const customTemplates = await loadCustomTemplates(workspaceUri);
  const relevantCustom = customTemplates.filter(t => {
    // Show template if no types specified (universal) or if types include selected type
    return !t.types || t.types.includes(selectedType.value);
  });

  if (relevantCustom.length > 0) {
    // Add separator for custom templates
    templateOptions.push({
      label: '$(folder) Custom Templates',
      kind: vscode.QuickPickItemKind.Separator,
    } as TemplateQuickPickItem);

    for (const t of relevantCustom) {
      templateOptions.push({
        label: `$(file) ${t.displayName}`,
        description: t.description,
        customContent: t.content,
      });
    }
  }

  let selectedTemplateRef: string | undefined;
  let selectedCustomContent: string | undefined;
  if (templateOptions.length > 1) {
    const selectedTemplate = await vscode.window.showQuickPick(templateOptions, {
      placeHolder: 'Select template (or use default)',
    });

    if (!selectedTemplate) {
      return false;
    }
    selectedTemplateRef = selectedTemplate.templateRef;
    selectedCustomContent = selectedTemplate.customContent;
  }

  // Size picker with suggestion
  const suggestedSize = getSuggestedSize(selectedType.value, config.sizes);
  const sizeOptions: SizeQuickPickItem[] = config.sizes.map(s => ({
    label: s,
    description: s === suggestedSize ? '(suggested)' : undefined,
    value: s,
  }));

  // Move suggested size to top
  const suggestedIndex = sizeOptions.findIndex(s => s.value === suggestedSize);
  if (suggestedIndex > 0) {
    const [suggested] = sizeOptions.splice(suggestedIndex, 1);
    sizeOptions.unshift(suggested);
  }

  const selectedSize = await vscode.window.showQuickPick(sizeOptions, {
    placeHolder: 'Select size',
  });

  if (!selectedSize) {
    return false;
  }

  // Sprint picker - optional, with current sprint pre-selected
  const existingSprints = getExistingSprints(config, store);
  const defaultSprint = config.currentSprint || 'backlog';

  // Build sprint options with current sprint first
  const sprintOptions: { label: string; description?: string }[] = [
    { label: defaultSprint, description: config.currentSprint ? 'Current Sprint' : undefined },
  ];

  // Add other sprints (excluding default to avoid duplication)
  for (const s of existingSprints) {
    if (s !== defaultSprint) {
      sprintOptions.push({ label: s });
    }
  }

  // Add backlog if not already included
  if (defaultSprint !== 'backlog' && !existingSprints.includes('backlog')) {
    sprintOptions.push({ label: 'backlog' });
  }

  const selectedSprintItem = await vscode.window.showQuickPick(sprintOptions, {
    placeHolder: 'Select sprint (Enter to accept default)',
  });

  if (!selectedSprintItem) {
    return false;
  }

  const sprint = selectedSprintItem.label;

  // Optional: Dependency picker
  const stories = store.getStories();
  let dependencies: string[] = [];

  if (stories.length > 0) {
    const addDeps = await vscode.window.showQuickPick(['No', 'Yes'], {
      placeHolder: 'Add dependencies?',
    });

    if (addDeps === 'Yes') {
      const depOptions = stories
        .filter(s => s.status !== 'done')
        .map(s => ({
          label: `[${s.id}] ${s.title}`,
          description: s.status,
          id: s.id,
          picked: false,
        }));

      if (depOptions.length > 0) {
        const selectedDeps = await vscode.window.showQuickPick(depOptions, {
          placeHolder: 'Select dependencies (Esc to skip)',
          canPickMany: true,
        });

        if (selectedDeps) {
          dependencies = selectedDeps.map(d => d.id);
        }
      }
    }
  }

  // Generate ID — scan disk + store to guard against watcher race conditions
  const existingIds = await collectExistingStoryIds(workspaceUri, config.storyPrefix, store);
  const nextNum = findNextStoryId(existingIds, config.storyPrefix);
  const storyId = `${config.storyPrefix}-${String(nextNum).padStart(5, '0')}`;

  // Get template - custom content > library reference > default
  const template = selectedCustomContent
    ?? selectedTemplateRef
    ?? DEFAULT_TEMPLATES[selectedType.value];

  // Generate markdown
  const markdown = generateStoryMarkdown(
    {
      id: storyId,
      title,
      type: selectedType.value,
      epic: selectedEpic.id,
      sprint,
      size: selectedSize.value,
      dependencies: dependencies.length > 0 ? dependencies : undefined,
    },
    template
  );

  // Write story file
  const storyUri = vscode.Uri.joinPath(
    workspaceUri,
    '.devstories',
    'stories',
    `${storyId}-${toKebabCase(title)}.md`
  );

  await vscode.workspace.fs.writeFile(storyUri, Buffer.from(markdown));
  await store.reloadFile(storyUri);

  // Create storydocs folder (best-effort, non-blocking)
  void storydocsService?.ensureFolder(storyId, 'story');

  // Auto-link to epic (Enhanced feature)
  const epic = epics.find(e => e.id === selectedEpic.id);
  if (epic?.filePath) {
    try {
      const epicUri = vscode.Uri.file(epic.filePath);
      const epicContent = Buffer.from(await vscode.workspace.fs.readFile(epicUri)).toString('utf8');
      const storyLink = generateStoryLink(storyId, title);
      const updatedEpic = appendStoryToEpic(epicContent, storyLink);
      await vscode.workspace.fs.writeFile(epicUri, Buffer.from(updatedEpic));
    } catch {
      // Non-critical: epic auto-link failed
      getLogger().warn('Failed to auto-link story to epic');
    }
  }

  // Open the file
  const doc = await vscode.workspace.openTextDocument(storyUri);
  await vscode.window.showTextDocument(doc);

  void vscode.window.showInformationMessage(`Created story: ${storyId}`);

  return true;
}
