/**
 * Inbox / Spikes drag-and-drop conversion handler.
 *
 * Orchestrates converting an inbox or spike .md file into a fully-formed
 * story or epic when dropped onto a valid target in either the Backlog or
 * Breakdown view.
 *
 * The handler:
 *   1. Reads the source file and parses any existing frontmatter.
 *   2. Generates the next sequential ID (story or epic).
 *   3. Fills missing frontmatter fields with sensible defaults.
 *   4. Sets sprint / priority / epic / theme based on the drop target.
 *   5. Renames the file (strips date prefix, prepends ID) and moves it
 *      to the appropriate .devstories/ subfolder.
 *   6. Deletes the original inbox/spike file.
 *   7. Calls store.reloadFile() to avoid Windows watcher race.
 */

import * as vscode from 'vscode';
import { Story } from '../types/story';
import { Epic } from '../types/epic';
import { Theme } from '../types/theme';
import { SprintNode, BACKLOG_SPRINT_ID, isSprintNode } from '../types/sprintNode';
import { InboxSpikeFile } from '../types/inboxSpikeNode';
import { isBacklogStory } from './storiesProviderUtils';
import { updateStoryPriorityOnly } from './storiesDragAndDropControllerUtils';
import {
  stripDatePrefix,
  titleFromKebabCase,
  fillMissingStoryFrontmatter,
  fillMissingEpicFrontmatter,
  buildConvertedFileContent,
  getDefaultSize,
  getDefaultStatus,
  todayString,
  maxPriority,
} from './inboxConversionUtils';
import { findNextStoryId } from '../commands/createStoryUtils';
import { findNextEpicId } from '../commands/createEpicUtils';
import { getLogger } from '../core/logger';
import { StorydocsService } from '../core/storydocsService';

const NO_THEME_ID = '__NO_THEME__';
const NO_EPIC_ID = '__NO_EPIC__';

// ─── Public parameter types ─────────────────────────────────────────────────

/** Minimal store surface needed by the inbox drop handler. */
export interface InboxDropStore {
  getStories(): Story[];
  getStory(id: string): Story | undefined;
  getEpics(): Epic[];
  getEpic(id: string): Epic | undefined;
  getStoriesByEpic(epicId: string): Story[];
  getStoriesWithoutEpic(): Story[];
  getEpicsByTheme(themeId: string): Epic[];
  getEpicsWithoutTheme(): Epic[];
  reloadFile(uri: vscode.Uri): Promise<void>;
}

/** Minimal config surface. */
export interface InboxDropConfigService {
  readonly config: {
    storyPrefix: string;
    epicPrefix: string;
    sprintSequence: string[];
    sizes: string[];
    statuses: { id: string }[];
  };
}

/** Minimal sort service surface. */
export interface InboxDropSortService {
  readonly state: { key: string; direction: string };
  setState(state: { key: string; direction: string }): void;
}

export interface InboxBacklogDropParams {
  sourceFile: InboxSpikeFile;
  target: SprintNode | Story;
  store: InboxDropStore;
  configService: InboxDropConfigService;
  sortService: InboxDropSortService;
  storydocsService?: StorydocsService;
}

export type BreakdownTarget =
  | { kind: 'theme'; theme: Theme }
  | { kind: 'epic'; epic: Epic }
  | { kind: 'story'; story: Story }
  | { kind: 'noTheme' }
  | { kind: 'noEpic' };

export interface InboxBreakdownDropParams {
  sourceFile: InboxSpikeFile;
  target: BreakdownTarget;
  store: InboxDropStore;
  configService: InboxDropConfigService;
  storydocsService?: StorydocsService;
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

async function readFileContent(filePath: string): Promise<string> {
  const uri = vscode.Uri.file(filePath);
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder().decode(bytes);
}

async function writeFile(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
}

async function deleteFile(filePath: string): Promise<void> {
  await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
}

function getWorkspaceUri(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

/** Collect existing story IDs from both disk and store (guards against watcher race). */
async function collectStoryIds(
  workspaceUri: vscode.Uri,
  storyPrefix: string,
  store: InboxDropStore,
): Promise<string[]> {
  const pattern = new vscode.RelativePattern(
    workspaceUri,
    `.devstories/stories/${storyPrefix}-*.md`,
  );
  const files = await vscode.workspace.findFiles(pattern);
  const diskIds = files
    .map(uri => {
      const filename = uri.path.split('/').pop() ?? '';
      const match = filename.match(new RegExp(`^(${storyPrefix}-\\d+)`));
      return match ? match[1] : null;
    })
    .filter((id): id is string => id !== null);

  const storeIds = store.getStories().map(s => s.id);
  return [...new Set([...diskIds, ...storeIds])];
}

/** Collect existing epic IDs from store. */
function collectEpicIds(store: InboxDropStore): string[] {
  return store.getEpics().map(e => e.id);
}

/** Write updated priority to a story's file on disk. */
async function writeStoryPriority(story: Story, newPriority: number): Promise<void> {
  if (!story.filePath) { return; }
  try {
    const content = await readFileContent(story.filePath);
    const updated = updateStoryPriorityOnly(content, newPriority);
    await writeFile(vscode.Uri.file(story.filePath), updated);
  } catch (err) {
    getLogger().error(`Failed to bump priority on story ${story.id}`, err);
  }
}

/**
 * Get stories belonging to a specific sprint (mirrors backlogDropHandler logic).
 */
function getStoriesInSprint(
  store: InboxDropStore,
  targetSprint: string,
  sprintSequence: string[],
): Story[] {
  const all = store.getStories();
  if (targetSprint.toLowerCase() === 'backlog' || targetSprint === BACKLOG_SPRINT_ID) {
    return all.filter(s => isBacklogStory(s, sprintSequence));
  }
  return all.filter(s => s.sprint === targetSprint);
}

// ─── Backlog view drop handler ──────────────────────────────────────────────

export async function handleInboxDropOnBacklog(params: InboxBacklogDropParams): Promise<void> {
  const { sourceFile, target, store, configService, sortService, storydocsService } = params;
  const config = configService.config;
  const workspaceUri = getWorkspaceUri();
  if (!workspaceUri) { return; }

  // Sort guard (same as backlogDropHandler)
  if (sortService.state.key !== 'priority' || sortService.state.direction !== 'asc') {
    const switchBtn = 'Switch to Priority Sort';
    const choice = await vscode.window.showWarningMessage(
      'Drag-and-drop reordering only works when stories are sorted by priority (ascending). '
      + 'Would you like to switch to priority sort?',
      { modal: true },
      switchBtn,
    );
    if (choice === switchBtn) {
      sortService.setState({ key: 'priority', direction: 'asc' });
    }
    return; // drop is always invalid when sort is wrong
  }

  try {
    // 1. Read source file
    const originalContent = await readFileContent(sourceFile.filePath);
    const matter = require('gray-matter');
    const parsed = matter(originalContent);
    const existingData = parsed.data as Record<string, unknown> ?? {};

    // 2. Generate next story ID
    const existingIds = await collectStoryIds(workspaceUri, config.storyPrefix, store);
    const nextNum = findNextStoryId(existingIds, config.storyPrefix);
    const storyId = `${config.storyPrefix}-${String(nextNum).padStart(5, '0')}`;

    // 3. Determine sprint and priority based on target
    let sprint: string;
    let priority: number;
    let bumpSiblings = false;
    let bumpTargetPriority = 0;
    let bumpSprint = '';

    if (isSprintNode(target)) {
      // Drop on sprint node or backlog sentinel
      sprint = target.isBacklog ? 'backlog' : target.sprintId;
      // Priority 1 = top of sprint; bump all existing siblings by +1
      priority = 1;
      bumpSiblings = true;
      bumpSprint = sprint;
    } else {
      // Drop on a story node
      const targetStory = target as Story;
      const sprintSequence = config.sprintSequence;
      sprint = targetStory.sprint && targetStory.sprint !== ''
        ? (isBacklogStory(targetStory, sprintSequence) && targetStory.sprint.toLowerCase() !== 'backlog'
          ? targetStory.sprint
          : targetStory.sprint)
        : 'backlog';
      if (!sprint || sprint === '') { sprint = 'backlog'; }
      priority = targetStory.priority;
      bumpSiblings = true;
      bumpTargetPriority = targetStory.priority;
      bumpSprint = sprint;
    }

    // 4. Build new filename
    const strippedName = stripDatePrefix(sourceFile.fileName);
    const newFileName = `${storyId}-${strippedName}.md`;

    // 5. Fill missing frontmatter
    const today = todayString();
    const defaultTitle = titleFromKebabCase(strippedName);
    const mergedData = fillMissingStoryFrontmatter(existingData, {
      id: storyId,
      title: defaultTitle,
      type: 'feature',
      epic: (existingData.epic as string) ?? '',
      status: getDefaultStatus(config.statuses),
      sprint,
      size: getDefaultSize(config.sizes),
      priority,
      created: today,
      updated: today,
    });

    // 6. Build converted content (preserves body)
    const convertedContent = buildConvertedFileContent(originalContent, mergedData);

    // 7. Write new file to stories/
    const newUri = vscode.Uri.joinPath(workspaceUri, '.devstories', 'stories', newFileName);
    await writeFile(newUri, convertedContent);

    // 8. Delete original file
    await deleteFile(sourceFile.filePath);

    // 9. Reload store
    await store.reloadFile(newUri);

    // 10. Create storydocs folder (best-effort, non-blocking)
    void storydocsService?.ensureFolder(storyId, 'story');

    // 11. Bump sibling priorities
    if (bumpSiblings) {
      const siblings = getStoriesInSprint(store, bumpSprint, config.sprintSequence)
        .filter(s => s.id !== storyId);

      if (isSprintNode(target)) {
        // Dropped on sprint node → all siblings bumped by +1
        for (const sibling of siblings) {
          await writeStoryPriority(sibling, sibling.priority + 1);
        }
      } else {
        // Dropped on story → bump siblings with priority >= target priority
        for (const sibling of siblings) {
          if (sibling.priority >= bumpTargetPriority) {
            await writeStoryPriority(sibling, sibling.priority + 1);
          }
        }
      }
    }

    void vscode.window.showInformationMessage(`Converted to story: ${storyId}`);
  } catch (err) {
    getLogger().error('Failed to convert inbox/spike file to story (backlog)', err);
    void vscode.window.showErrorMessage('DevStories: Failed to convert file to story.');
  }
}

// ─── Breakdown view drop handler ────────────────────────────────────────────

export async function handleInboxDropOnBreakdown(params: InboxBreakdownDropParams): Promise<void> {
  const { sourceFile, target, store, configService, storydocsService } = params;
  const config = configService.config;
  const workspaceUri = getWorkspaceUri();
  if (!workspaceUri) { return; }

  try {
    // 1. Read source file
    const originalContent = await readFileContent(sourceFile.filePath);
    const matter = require('gray-matter');
    const parsed = matter(originalContent);
    const existingData = parsed.data as Record<string, unknown> ?? {};
    const strippedName = stripDatePrefix(sourceFile.fileName);
    const defaultTitle = titleFromKebabCase(strippedName);
    const today = todayString();

    switch (target.kind) {
      // ── Theme / No Theme → create Epic ────────────────────────────────
      case 'theme':
      case 'noTheme': {
        const themeId = target.kind === 'theme' ? target.theme.id : '';
        await convertToEpic({
          originalContent,
          existingData,
          strippedName,
          defaultTitle,
          today,
          themeId,
          store,
          config,
          workspaceUri,
          sourceFilePath: sourceFile.filePath,
          storydocsService,
        });
        break;
      }

      // ── Epic / No Epic → create Story (lowest priority in epic) ───────
      case 'epic':
      case 'noEpic': {
        const epicId = target.kind === 'epic' ? target.epic.id : '';
        const siblings = epicId
          ? store.getStoriesByEpic(epicId)
          : store.getStoriesWithoutEpic();
        const priority = maxPriority(siblings) + 1 || 1;

        await convertToStory({
          originalContent,
          existingData,
          strippedName,
          defaultTitle,
          today,
          epicId,
          sprint: '',
          priority,
          store,
          config,
          workspaceUri,
          sourceFilePath: sourceFile.filePath,
          storydocsService,
        });
        break;
      }

      // ── Story → create Story (insert at target priority, bump siblings)
      case 'story': {
        const targetStory = target.story;
        const epicId = targetStory.epic ?? '';
        const targetPriority = targetStory.priority;

        await convertToStory({
          originalContent,
          existingData,
          strippedName,
          defaultTitle,
          today,
          epicId,
          sprint: targetStory.sprint ?? '',
          priority: targetPriority,
          store,
          config,
          workspaceUri,
          sourceFilePath: sourceFile.filePath,
          bumpAtPriority: targetPriority,
          bumpEpicId: epicId,
          storydocsService,
        });
        break;
      }
    }
  } catch (err) {
    getLogger().error('Failed to convert inbox/spike file (breakdown)', err);
    void vscode.window.showErrorMessage('DevStories: Failed to convert file.');
  }
}

// ─── Internal conversion helpers ────────────────────────────────────────────

interface ConvertToStoryParams {
  originalContent: string;
  existingData: Record<string, unknown>;
  strippedName: string;
  defaultTitle: string;
  today: string;
  epicId: string;
  sprint: string;
  priority: number;
  store: InboxDropStore;
  config: InboxDropConfigService['config'];
  workspaceUri: vscode.Uri;
  sourceFilePath: string;
  /** When set, bump all siblings in the same epic with priority >= this value. */
  bumpAtPriority?: number;
  bumpEpicId?: string;
  storydocsService?: StorydocsService;
}

async function convertToStory(params: ConvertToStoryParams): Promise<void> {
  const {
    originalContent, existingData, strippedName, defaultTitle, today,
    epicId, sprint, priority, store, config, workspaceUri, sourceFilePath,
    bumpAtPriority, bumpEpicId, storydocsService,
  } = params;

  // Generate next story ID
  const existingIds = await collectStoryIds(workspaceUri, config.storyPrefix, store);
  const nextNum = findNextStoryId(existingIds, config.storyPrefix);
  const storyId = `${config.storyPrefix}-${String(nextNum).padStart(5, '0')}`;

  // Build filename
  const newFileName = `${storyId}-${strippedName}.md`;

  // Fill frontmatter
  const mergedData = fillMissingStoryFrontmatter(existingData, {
    id: storyId,
    title: defaultTitle,
    type: 'feature',
    epic: epicId,
    status: getDefaultStatus(config.statuses),
    sprint,
    size: getDefaultSize(config.sizes),
    priority,
    created: today,
    updated: today,
  });

  // Build converted content
  const convertedContent = buildConvertedFileContent(originalContent, mergedData);

  // Write new file
  const newUri = vscode.Uri.joinPath(workspaceUri, '.devstories', 'stories', newFileName);
  await writeFile(newUri, convertedContent);

  // Delete original
  await deleteFile(sourceFilePath);

  // Reload store
  await store.reloadFile(newUri);

  // Create storydocs folder (best-effort, non-blocking)
  void storydocsService?.ensureFolder(storyId, 'story');

  // Bump sibling priorities if needed
  if (bumpAtPriority !== undefined) {
    const siblings = bumpEpicId
      ? store.getStoriesByEpic(bumpEpicId)
      : store.getStoriesWithoutEpic();

    for (const sibling of siblings) {
      if (sibling.id !== storyId && sibling.priority >= bumpAtPriority) {
        await writeStoryPriority(sibling, sibling.priority + 1);
      }
    }
  }

  void vscode.window.showInformationMessage(`Converted to story: ${storyId}`);
}

interface ConvertToEpicParams {
  originalContent: string;
  existingData: Record<string, unknown>;
  strippedName: string;
  defaultTitle: string;
  today: string;
  themeId: string;
  store: InboxDropStore;
  config: InboxDropConfigService['config'];
  workspaceUri: vscode.Uri;
  sourceFilePath: string;
  storydocsService?: StorydocsService;
}

async function convertToEpic(params: ConvertToEpicParams): Promise<void> {
  const {
    originalContent, existingData, strippedName, defaultTitle, today,
    themeId, store, config, workspaceUri, sourceFilePath, storydocsService,
  } = params;

  // Generate next epic ID
  const existingIds = collectEpicIds(store);
  const nextNum = findNextEpicId(existingIds, config.epicPrefix);
  const epicId = `${config.epicPrefix}-${String(nextNum).padStart(4, '0')}`;

  // Determine priority (lowest among epics in this theme)
  const siblings = themeId
    ? store.getEpicsByTheme(themeId)
    : store.getEpicsWithoutTheme();
  const priority = maxPriority(siblings) + 1 || 1;

  // Build filename
  const newFileName = `${epicId}-${strippedName}.md`;

  // Fill frontmatter
  const mergedData = fillMissingEpicFrontmatter(existingData, {
    id: epicId,
    title: defaultTitle,
    status: getDefaultStatus(config.statuses),
    priority,
    theme: themeId,
    created: today,
  });

  // Build converted content
  const convertedContent = buildConvertedFileContent(originalContent, mergedData);

  // Write new file
  const newUri = vscode.Uri.joinPath(workspaceUri, '.devstories', 'epics', newFileName);
  await writeFile(newUri, convertedContent);

  // Delete original
  await deleteFile(sourceFilePath);

  // Reload store
  await store.reloadFile(newUri);

  // Create storydocs folder (best-effort, non-blocking)
  void storydocsService?.ensureFolder(epicId, 'epic');

  void vscode.window.showInformationMessage(`Converted to epic: ${epicId}`);
}
