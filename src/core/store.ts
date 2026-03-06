import * as vscode from 'vscode';
import * as path from 'path';
import { BrokenFile } from '../types/brokenFile';
import { Epic } from '../types/epic';
import { InboxSpikeFile, InboxSpikeFolderType } from '../types/inboxSpikeNode';
import { Story } from '../types/story';
import { Theme } from '../types/theme';
import { Parser } from './parser';
import { Watcher } from './watcher';
import { getLogger } from './logger';
import { sortEpicsBySprintOrder } from '../view/storiesProviderUtils';

export class Store {
  private stories = new Map<string, Story>();
  private epics = new Map<string, Epic>();
  private themes = new Map<string, Theme>();
  private brokenFiles = new Map<string, BrokenFile>(); // keyed by filePath
  private inboxFiles = new Map<string, InboxSpikeFile>(); // keyed by filePath
  private spikeFiles = new Map<string, InboxSpikeFile>(); // keyed by filePath
  private _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  constructor(private watcher: Watcher) {
    // Listen to watcher events
    this.watcher.onDidCreate(uri => this.onFileChanged(uri));
    this.watcher.onDidChange(uri => this.onFileChanged(uri));
    this.watcher.onDidDelete(uri => this.onFileDeleted(uri));
  }

  async load() {
    const storyFiles = await vscode.workspace.findFiles('**/.devstories/stories/*.md');
    const epicFiles = await vscode.workspace.findFiles('**/.devstories/epics/*.md');
    const themeFiles = await vscode.workspace.findFiles('**/.devstories/themes/*.md');
    const inboxFiles = await vscode.workspace.findFiles('**/.devstories/inbox/*.md');
    const spikeFiles = await vscode.workspace.findFiles('**/.devstories/spikes/*.md');

    this.stories.clear();
    this.epics.clear();
    this.themes.clear();
    this.brokenFiles.clear();
    this.inboxFiles.clear();
    this.spikeFiles.clear();

    await Promise.all(storyFiles.map(uri => this.parseAndAddStory(uri)));
    await Promise.all(epicFiles.map(uri => this.parseAndAddEpic(uri)));
    await Promise.all(themeFiles.map(uri => this.parseAndAddTheme(uri)));
    for (const uri of inboxFiles) { this.addInboxSpikeFile(uri, 'inbox'); }
    for (const uri of spikeFiles) { this.addInboxSpikeFile(uri, 'spikes'); }

    // Notify listeners that data has been loaded
    this._onDidUpdate.fire();
  }

  getStory(id: string): Story | undefined {
    return this.stories.get(id);
  }

  getEpic(id: string): Epic | undefined {
    return this.epics.get(id);
  }

  getTheme(id: string): Theme | undefined {
    return this.themes.get(id);
  }

  getStoriesByEpic(epicId: string): Story[] {
    return Array.from(this.stories.values()).filter(story => story.epic === epicId);
  }

  getEpicsByTheme(themeId: string): Epic[] {
    return Array.from(this.epics.values()).filter(epic => epic.theme === themeId);
  }

  getEpicsWithoutTheme(): Epic[] {
    return Array.from(this.epics.values()).filter(epic => !epic.theme);
  }

  /**
   * Stories where epic field is blank/empty OR references an epic ID not in the store.
   * These are orphaned stories that appear under the "No Epic" sentinel node.
   */
  getStoriesWithoutEpic(): Story[] {
    return Array.from(this.stories.values()).filter(
      story => !story.epic || !this.epics.has(story.epic)
    );
  }

  /** Epic files that failed to parse — shown under the "No Theme" sentinel. */
  getBrokenEpics(): BrokenFile[] {
    return Array.from(this.brokenFiles.values()).filter(f => f.fileType === 'epic');
  }

  /** Story files that failed to parse — shown under the "No Epic" sentinel. */
  getBrokenStories(): BrokenFile[] {
    return Array.from(this.brokenFiles.values()).filter(f => f.fileType === 'story');
  }

  /** Theme files that failed to parse — shown at the root of the Breakdown view. */
  getBrokenThemes(): BrokenFile[] {
    return Array.from(this.brokenFiles.values()).filter(f => f.fileType === 'theme');
  }

  getEpics(): Epic[] {
    return Array.from(this.epics.values());
  }

  getStories(): Story[] {
    return Array.from(this.stories.values());
  }

  getThemes(): Theme[] {
    return Array.from(this.themes.values());
  }

  /** Get all files in the .devstories/inbox/ folder. */
  getInboxFiles(): InboxSpikeFile[] {
    return Array.from(this.inboxFiles.values());
  }

  /** Get all files in the .devstories/spikes/ folder. */
  getSpikeFiles(): InboxSpikeFile[] {
    return Array.from(this.spikeFiles.values());
  }

  /**
   * Get epics sorted by their earliest story's sprint position.
   * Epics with earlier sprints appear first.
   */
  getEpicsBySprintOrder(sprintSequence: string[]): Epic[] {
    const allEpics = this.getEpics();
    return sortEpicsBySprintOrder(
      allEpics,
      sprintSequence,
      (epicId) => this.getStoriesByEpic(epicId)
    );
  }

  private async onFileChanged(uri: vscode.Uri) {
    await this.reloadFile(uri);
  }

  /**
   * Explicitly reload a single file into the store.
   * Called after programmatic file creation to guarantee store is updated
   * without relying solely on the FileSystemWatcher (which can be delayed on Windows).
   */
  async reloadFile(uri: vscode.Uri): Promise<void> {
    if (uri.path.includes('/stories/')) {
      await this.parseAndAddStory(uri);
    } else if (uri.path.includes('/epics/')) {
      await this.parseAndAddEpic(uri);
    } else if (uri.path.includes('/themes/')) {
      await this.parseAndAddTheme(uri);
    } else if (uri.path.includes('/inbox/')) {
      this.addInboxSpikeFile(uri, 'inbox');
    } else if (uri.path.includes('/spikes/')) {
      this.addInboxSpikeFile(uri, 'spikes');
    }
    this._onDidUpdate.fire();
  }

  private onFileDeleted(uri: vscode.Uri) {
    // We don't know the ID from the URI easily without parsing, but we can iterate.
    // Or we can assume ID is filename? No, ID is in frontmatter.
    // But if file is deleted, we can't read it.
    // We have to search the map for the story with this filePath.
    
    for (const [id, story] of this.stories) {
      if (story.filePath === uri.fsPath) {
        this.stories.delete(id);
        break;
      }
    }

    for (const [id, epic] of this.epics) {
      if (epic.filePath === uri.fsPath) {
        this.epics.delete(id);
        break;
      }
    }

    for (const [id, theme] of this.themes) {
      if (theme.filePath === uri.fsPath) {
        this.themes.delete(id);
        break;
      }
    }
    // Also remove from broken files if it was previously broken
    this.brokenFiles.delete(uri.fsPath);

    // Remove from inbox/spike files
    this.inboxFiles.delete(uri.fsPath);
    this.spikeFiles.delete(uri.fsPath);

    this._onDidUpdate.fire();
  }

  private async parseAndAddStory(uri: vscode.Uri) {
    try {
      const content = await this.readFile(uri);
      const story = Parser.parseStory(content, uri.fsPath);
      this.stories.set(story.id, story);
      this.brokenFiles.delete(uri.fsPath); // clear if previously broken
    } catch (e) {
      getLogger().error(`Failed to parse story ${uri.fsPath}:`, e);
      this.brokenFiles.set(uri.fsPath, {
        broken: true,
        id: path.basename(uri.fsPath, '.md'),
        filePath: uri.fsPath,
        error: (e instanceof Error ? e.message : String(e)),
        fileType: 'story',
      });
    }
  }

  private async parseAndAddEpic(uri: vscode.Uri) {
    try {
      const content = await this.readFile(uri);
      const epic = Parser.parseEpic(content, uri.fsPath);
      this.epics.set(epic.id, epic);
      this.brokenFiles.delete(uri.fsPath); // clear if previously broken
    } catch (e) {
      getLogger().error(`Failed to parse epic ${uri.fsPath}:`, e);
      this.brokenFiles.set(uri.fsPath, {
        broken: true,
        id: path.basename(uri.fsPath, '.md'),
        filePath: uri.fsPath,
        error: (e instanceof Error ? e.message : String(e)),
        fileType: 'epic',
      });
    }
  }

  private async parseAndAddTheme(uri: vscode.Uri) {
    try {
      const content = await this.readFile(uri);
      const theme = Parser.parseTheme(content, uri.fsPath);
      this.themes.set(theme.id, theme);
      this.brokenFiles.delete(uri.fsPath); // clear if previously broken
    } catch (e) {
      getLogger().error(`Failed to parse theme ${uri.fsPath}:`, e);
      this.brokenFiles.set(uri.fsPath, {
        broken: true,
        id: path.basename(uri.fsPath, '.md'),
        filePath: uri.fsPath,
        error: (e instanceof Error ? e.message : String(e)),
        fileType: 'theme',
      });
    }
  }

  private addInboxSpikeFile(uri: vscode.Uri, folderType: InboxSpikeFolderType): void {
    const fileName = path.basename(uri.fsPath, '.md');
    const file: InboxSpikeFile = {
      _kind: 'inboxSpikeFile',
      fileName,
      filePath: uri.fsPath,
      folderType,
    };
    if (folderType === 'inbox') {
      this.inboxFiles.set(uri.fsPath, file);
    } else {
      this.spikeFiles.set(uri.fsPath, file);
    }
  }

  private async readFile(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  }
}
