import * as vscode from "vscode";
import * as path from "path";
import matter from "gray-matter";
import { BrokenFile } from "../types/brokenFile";
import { Epic } from "../types/epic";
import { InboxSpikeFile, InboxSpikeFolderType } from "../types/inboxSpikeNode";
import { Story } from "../types/story";
import { Task } from "../types/task";
import { Theme } from "../types/theme";
import { Parser } from "./parser";
import { Watcher } from "./watcher";
import { getLogger } from "./logger";
import { isArchivedPath } from "./storeUtils";
import { normalizeDatesInData } from "../utils/dateUtils";
import { sortEpicsBySprintOrder } from "../view/storiesProviderUtils";

export class Store {
  private stories = new Map<string, Story>();
  private epics = new Map<string, Epic>();
  private themes = new Map<string, Theme>();
  private brokenFiles = new Map<string, BrokenFile>(); // keyed by filePath
  private inboxFiles = new Map<string, InboxSpikeFile>(); // keyed by filePath
  private spikeFiles = new Map<string, InboxSpikeFile>(); // keyed by filePath
  private tasks = new Map<string, Task>(); // keyed by task ID
  private archiveDevstoriesSegment = "archive";
  private archiveStorydocsSegment = "archive";
  private _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  /** Fires before a node is removed from the store (on file deletion), carrying its info. */
  private _onWillDeleteNode = new vscode.EventEmitter<{
    id: string;
    nodeType: "story" | "epic" | "theme" | "task";
    epicId?: string;
    themeId?: string;
  }>();
  readonly onWillDeleteNode = this._onWillDeleteNode.event;

  constructor(private watcher: Watcher) {
    // Listen to watcher events
    this.watcher.onDidCreate((uri) => this.onFileChanged(uri));
    this.watcher.onDidChange((uri) => this.onFileChanged(uri));
    this.watcher.onDidDelete((uri) => this.handleFileDeleted(uri));
  }

  async load(storydocsRoot?: string, archiveDevstoriesSegment?: string, archiveStorydocsSegment?: string) {
    this.archiveDevstoriesSegment = archiveDevstoriesSegment ?? "archive";
    this.archiveStorydocsSegment = archiveStorydocsSegment ?? "archive";

    const storyFiles = await vscode.workspace.findFiles("**/.devstories/stories/*.md");
    const epicFiles = await vscode.workspace.findFiles("**/.devstories/epics/*.md");
    const themeFiles = await vscode.workspace.findFiles("**/.devstories/themes/*.md");
    const inboxFiles = await vscode.workspace.findFiles("**/.devstories/inbox/*.md");
    const spikeFiles = await vscode.workspace.findFiles("**/.devstories/spikes/*.md");

    // Scan archive paths for soft-archived files
    const archiveStoryFiles = await vscode.workspace.findFiles(`**/.devstories/${this.archiveDevstoriesSegment}/stories/*.md`);
    const archiveEpicFiles = await vscode.workspace.findFiles(`**/.devstories/${this.archiveDevstoriesSegment}/epics/*.md`);
    const archiveThemeFiles = await vscode.workspace.findFiles(`**/.devstories/${this.archiveDevstoriesSegment}/themes/*.md`);

    this.stories.clear();
    this.epics.clear();
    this.themes.clear();
    this.brokenFiles.clear();
    this.inboxFiles.clear();
    this.spikeFiles.clear();
    this.tasks.clear();

    await Promise.all([...storyFiles, ...archiveStoryFiles].map((uri) => this.parseAndAddStory(uri)));
    await Promise.all([...epicFiles, ...archiveEpicFiles].map((uri) => this.parseAndAddEpic(uri)));
    await Promise.all([...themeFiles, ...archiveThemeFiles].map((uri) => this.parseAndAddTheme(uri)));
    for (const uri of inboxFiles) {
      this.addInboxSpikeFile(uri, "inbox");
    }
    for (const uri of spikeFiles) {
      this.addInboxSpikeFile(uri, "spikes");
    }

    // Load task files from storydocs directories when root is known
    if (storydocsRoot) {
      const pattern = new vscode.RelativePattern(storydocsRoot, "stories/*/tasks/*.md");
      const taskFiles = await vscode.workspace.findFiles(pattern);
      // Also scan archive task files
      const archiveTaskPattern = new vscode.RelativePattern(storydocsRoot, `${this.archiveStorydocsSegment}/stories/*/tasks/*.md`);
      const archiveTaskFiles = await vscode.workspace.findFiles(archiveTaskPattern);
      await Promise.all([...taskFiles, ...archiveTaskFiles].map((uri) => this.parseAndAddTask(uri)));
    }

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
    return Array.from(this.stories.values()).filter((story) => story.epic === epicId);
  }

  getEpicsByTheme(themeId: string): Epic[] {
    return Array.from(this.epics.values()).filter((epic) => epic.theme === themeId);
  }

  getEpicsWithoutTheme(): Epic[] {
    return Array.from(this.epics.values()).filter((epic) => !epic.theme);
  }

  /**
   * Stories where epic field is blank/empty OR references an epic ID not in the store.
   * These are orphaned stories that appear under the "No Epic" sentinel node.
   */
  getStoriesWithoutEpic(): Story[] {
    return Array.from(this.stories.values()).filter((story) => !story.epic || !this.epics.has(story.epic));
  }

  /** Epic files that failed to parse — shown under the "No Theme" sentinel. */
  getBrokenEpics(): BrokenFile[] {
    return Array.from(this.brokenFiles.values()).filter((f) => f.fileType === "epic");
  }

  /** Story files that failed to parse — shown under the "No Epic" sentinel. */
  getBrokenStories(): BrokenFile[] {
    return Array.from(this.brokenFiles.values()).filter((f) => f.fileType === "story");
  }

  /** Theme files that failed to parse — shown at the root of the Breakdown view. */
  getBrokenThemes(): BrokenFile[] {
    return Array.from(this.brokenFiles.values()).filter((f) => f.fileType === "theme");
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

  getTask(compositeId: string): Task | undefined {
    return this.tasks.get(compositeId);
  }

  getTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getTasksByStory(storyId: string): Task[] {
    return Array.from(this.tasks.values()).filter((task) => task.story === storyId);
  }

  /** Returns true if the store has any content (stories, epics, themes, broken files, inbox, or spikes). */
  hasContent(): boolean {
    return (
      this.stories.size > 0 ||
      this.epics.size > 0 ||
      this.themes.size > 0 ||
      this.brokenFiles.size > 0 ||
      this.inboxFiles.size > 0 ||
      this.spikeFiles.size > 0
    );
  }

  /**
   * Get epics sorted by their earliest story's sprint position.
   * Epics with earlier sprints appear first.
   */
  getEpicsBySprintOrder(sprintSequence: string[]): Epic[] {
    const allEpics = this.getEpics();
    return sortEpicsBySprintOrder(allEpics, sprintSequence, (epicId) => this.getStoriesByEpic(epicId));
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
    // Check /tasks/ before /stories/ — task paths contain both segments
    // (e.g. storydocs/stories/STORY-001/tasks/TASK-001.md)
    if (uri.path.includes("/tasks/")) {
      await this.parseAndAddTask(uri);
    } else if (uri.path.includes("/stories/")) {
      await this.parseAndAddStory(uri);
    } else if (uri.path.includes("/epics/")) {
      await this.parseAndAddEpic(uri);
    } else if (uri.path.includes("/themes/")) {
      await this.parseAndAddTheme(uri);
    } else if (uri.path.includes("/inbox/")) {
      this.addInboxSpikeFile(uri, "inbox");
    } else if (uri.path.includes("/spikes/")) {
      this.addInboxSpikeFile(uri, "spikes");
    }
    this._onDidUpdate.fire();
  }

  handleFileDeleted(uri: vscode.Uri) {
    // We don't know the ID from the URI easily without parsing, but we can iterate.
    // Or we can assume ID is filename? No, ID is in frontmatter.
    // But if file is deleted, we can't read it.
    // We have to search the map for the story with this filePath.

    for (const [id, story] of this.stories) {
      if (story.filePath === uri.fsPath) {
        this._onWillDeleteNode.fire({
          id,
          nodeType: "story",
          epicId: story.epic || undefined,
          themeId: story.epic ? this.epics.get(story.epic)?.theme : undefined,
        });
        this.stories.delete(id);
        break;
      }
    }

    for (const [id, epic] of this.epics) {
      if (epic.filePath === uri.fsPath) {
        this._onWillDeleteNode.fire({ id, nodeType: "epic", themeId: epic.theme });
        this.epics.delete(id);
        break;
      }
    }

    for (const [id, theme] of this.themes) {
      if (theme.filePath === uri.fsPath) {
        this._onWillDeleteNode.fire({ id, nodeType: "theme" });
        this.themes.delete(id);
        break;
      }
    }
    // Also remove from broken files if it was previously broken
    this.brokenFiles.delete(uri.fsPath);

    // Remove from inbox/spike files
    this.inboxFiles.delete(uri.fsPath);
    this.spikeFiles.delete(uri.fsPath);

    // Remove tasks
    for (const [id, task] of this.tasks) {
      if (task.filePath === uri.fsPath) {
        this._onWillDeleteNode.fire({ id, nodeType: "task" });
        this.tasks.delete(id);
        break;
      }
    }

    this._onDidUpdate.fire();
  }

  private async parseAndAddStory(uri: vscode.Uri) {
    try {
      const content = await this.readFile(uri);
      const story = Parser.parseStory(content, uri.fsPath);
      story.isArchived = isArchivedPath(uri.fsPath, this.archiveDevstoriesSegment);
      this.stories.set(story.id, story);
      this.brokenFiles.delete(uri.fsPath); // clear if previously broken
    } catch (e) {
      getLogger().error(`Failed to parse story ${uri.fsPath}:`, e);
      this.brokenFiles.set(uri.fsPath, {
        broken: true,
        id: path.basename(uri.fsPath, ".md"),
        filePath: uri.fsPath,
        error: e instanceof Error ? e.message : String(e),
        fileType: "story",
      });
    }
  }

  private async parseAndAddEpic(uri: vscode.Uri) {
    try {
      const content = await this.readFile(uri);
      const epic = Parser.parseEpic(content, uri.fsPath);
      epic.isArchived = isArchivedPath(uri.fsPath, this.archiveDevstoriesSegment);
      this.epics.set(epic.id, epic);
      this.brokenFiles.delete(uri.fsPath); // clear if previously broken
    } catch (e) {
      getLogger().error(`Failed to parse epic ${uri.fsPath}:`, e);
      this.brokenFiles.set(uri.fsPath, {
        broken: true,
        id: path.basename(uri.fsPath, ".md"),
        filePath: uri.fsPath,
        error: e instanceof Error ? e.message : String(e),
        fileType: "epic",
      });
    }
  }

  private async parseAndAddTheme(uri: vscode.Uri) {
    try {
      const content = await this.readFile(uri);
      const theme = Parser.parseTheme(content, uri.fsPath);
      theme.isArchived = isArchivedPath(uri.fsPath, this.archiveDevstoriesSegment);
      this.themes.set(theme.id, theme);
      this.brokenFiles.delete(uri.fsPath); // clear if previously broken
    } catch (e) {
      getLogger().error(`Failed to parse theme ${uri.fsPath}:`, e);
      this.brokenFiles.set(uri.fsPath, {
        broken: true,
        id: path.basename(uri.fsPath, ".md"),
        filePath: uri.fsPath,
        error: e instanceof Error ? e.message : String(e),
        fileType: "theme",
      });
    }
  }

  private addInboxSpikeFile(uri: vscode.Uri, folderType: InboxSpikeFolderType): void {
    const fileName = path.basename(uri.fsPath, ".md");
    const file: InboxSpikeFile = {
      _kind: "inboxSpikeFile",
      fileName,
      filePath: uri.fsPath,
      folderType,
    };
    if (folderType === "inbox") {
      this.inboxFiles.set(uri.fsPath, file);
    } else {
      this.spikeFiles.set(uri.fsPath, file);
    }
  }

  private async parseAndAddTask(uri: vscode.Uri) {
    try {
      const content = await this.readFile(uri);
      const { task, changed, normalizedData, markdownBody } = Parser.parseTask(content, uri.fsPath);
      task.isArchived = isArchivedPath(uri.fsPath, this.archiveStorydocsSegment);
      this.tasks.set(`${task.story}::${task.id}`, task);

      // Auto-heal: write canonical frontmatter back if normalization changed anything
      if (changed) {
        normalizeDatesInData(normalizedData);
        const newContent = matter.stringify(markdownBody, normalizedData);
        // Loop guard: only write if content actually changed on disk
        if (newContent !== content) {
          const encoder = new TextEncoder();
          void vscode.workspace.fs.writeFile(uri, encoder.encode(newContent));
          getLogger().info(`Auto-healed task frontmatter: ${uri.fsPath}`);
        }
      }
    } catch (e) {
      getLogger().error(`Failed to parse task ${uri.fsPath}:`, e);
    }
  }

  private async readFile(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  }
}
