import * as vscode from "vscode";
import * as path from "path";
import { ConfigService } from "../core/configService";
import { SortService } from "../core/sortService";
import { SprintFilterService } from "../core/sprintFilterService";
import { TextFilterService } from "../core/textFilterService";
import { Store } from "../core/store";
import { BrokenFile } from "../types/brokenFile";
import { Epic } from "../types/epic";
import { InboxSpikeNode, InboxSpikeFile, INBOX_NODE_ID, SPIKES_NODE_ID, isInboxSpikeNode, isInboxSpikeFile } from "../types/inboxSpikeNode";
import { Story, StoryType } from "../types/story";
import { Theme } from "../types/theme";
import { SprintNode, BACKLOG_SPRINT_ID, isSprintNode } from "../types/sprintNode";
import {
  sortStoriesBy,
  sortStoriesForTreeView,
  sortEpicsBySprintOrder,
  sortThemesByEpicSprintOrder,
  getStatusIndicator,
  isBacklogStory,
  ViewMode,
} from "./storiesProviderUtils";

/** Sentinel id for the virtual "No Theme" root node */
const NO_THEME_ID = "__NO_THEME__";

/** Sentinel id for the virtual "No Epic" node nested under "No Theme" */
const NO_EPIC_ID = "__NO_EPIC__";

function makeNoThemeNode(): Theme {
  return {
    id: NO_THEME_ID,
    title: "No Theme",
    status: "",
    priority: 500,
    created: new Date(0),
    content: "",
  };
}

/** Returns an Epic-shaped sentinel so existing isTheme/isStory discriminants work unchanged. */
function makeNoEpicNode(): Epic {
  return {
    id: NO_EPIC_ID,
    title: "No Epic",
    status: "",
    theme: NO_THEME_ID, // ensures 'theme' in obj === true → not detected as Theme
    priority: 500,
    created: new Date(0),
    content: "",
  };
}

/** Union of all node types that can appear in the tree view. */
export type TreeElement = Theme | Epic | Story | BrokenFile | SprintNode | InboxSpikeNode | InboxSpikeFile;

function makeInboxNode(): InboxSpikeNode {
  return { _kind: "inboxSpikeNode", nodeId: INBOX_NODE_ID, label: "Inbox", folderName: "inbox" };
}

function makeSpikesNode(): InboxSpikeNode {
  return { _kind: "inboxSpikeNode", nodeId: SPIKES_NODE_ID, label: "Spikes", folderName: "spikes" };
}

export class StoriesProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeElement | undefined | null | void> = new vscode.EventEmitter<
    TreeElement | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<TreeElement | undefined | null | void> = this._onDidChangeTreeData.event;

  private _viewMode: ViewMode = "backlog";

  /** Event emitted when the view mode changes. */
  private _onDidViewModeChange = new vscode.EventEmitter<ViewMode>();
  readonly onDidViewModeChange: vscode.Event<ViewMode> = this._onDidViewModeChange.event;

  constructor(
    private store: Store,
    private extensionPath: string | undefined,
    private configService?: ConfigService,
    private sprintFilterService?: SprintFilterService,
    private sortService?: SortService,
    private textFilterService?: TextFilterService,
  ) {
    this.store.onDidUpdate(() => this.refresh());
    // DS-035: Subscribe to config changes to refresh tree
    this.configService?.onDidConfigChange(() => this.refresh());
    // DS-034: Subscribe to sprint filter changes to refresh tree
    this.sprintFilterService?.onDidSprintChange(() => this.refresh());
    // Subscribe to sort changes to refresh tree
    this.sortService?.onDidSortChange(() => this.refresh());
    // Subscribe to text filter changes to refresh tree
    this.textFilterService?.onDidFilterChange(() => this.refresh());
  }

  /** Current view mode ('breakdown' = Theme→Epic→Story, 'backlog' = Sprint→Story). */
  get viewMode(): ViewMode {
    return this._viewMode;
  }

  /** Switch between breakdown and backlog view modes. Triggers a full tree refresh. */
  setViewMode(mode: ViewMode): void {
    if (this._viewMode !== mode) {
      this._viewMode = mode;
      this._onDidViewModeChange.fire(mode);
      this.refresh();
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return this.createTreeItem(element);
  }

  getChildren(element?: TreeElement): Thenable<TreeElement[]> {
    // Return empty array at root when store has no content so VS Code shows welcome view
    if (!element && !this.store.hasContent()) {
      return Promise.resolve([]);
    }
    if (this._viewMode === "backlog") {
      return this.getBacklogChildren(element);
    }
    return this.getBreakdownChildren(element);
  }

  // ─── Backlog view mode (Sprint → Story) ─────────────────────────────────

  private getBacklogChildren(element?: TreeElement): Thenable<TreeElement[]> {
    const sprintSequence = this.configService?.config.sprintSequence ?? [];
    const textFilter = this.textFilterService?.filterText ?? "";
    // When text filter is active, bypass sprint filter so all nodes are searched
    const sprintFilter = textFilter !== "" ? null : (this.sprintFilterService?.currentSprint ?? null);
    const currentSprint = this.configService?.config.currentSprint ?? null;

    if (!element) {
      // Root level: one SprintNode per sprint in sequence, plus Backlog sentinel at end
      const allStories = this.store.getStories();
      const nodes: SprintNode[] = [];

      for (const sprint of sprintSequence) {
        // Skip 'backlog' sprint — its stories go to the catch-all Backlog sentinel
        if (sprint.toLowerCase() === "backlog") {
          continue;
        }

        // Apply sprint filter: if a filter is active, only show matching sprint node(s)
        if (sprintFilter !== null) {
          if (sprintFilter === "backlog") {
            continue; // skip named sprints when filtering to backlog only
          }
          if (sprintFilter !== sprint) {
            continue;
          }
        }

        // When text filter is active, hide sprint nodes with no matching stories
        if (textFilter !== "") {
          const sprintStories = allStories.filter((s) => s.sprint === sprint);
          if (!sprintStories.some((s) => this.matchesTextFilter(s))) {
            continue;
          }
        }

        nodes.push({
          _kind: "sprintNode",
          sprintId: sprint,
          label: sprint,
          isBacklog: false,
        });
      }

      // Always add the Backlog sentinel (unless filter is a named sprint)
      if (sprintFilter === null || sprintFilter === "backlog") {
        // When text filter active, only show backlog if it has matching stories or broken files
        let showBacklog = true;
        if (textFilter !== "") {
          const backlogStories = allStories.filter((s) => isBacklogStory(s, sprintSequence));
          const brokenStories = this.store.getBrokenStories();
          showBacklog = backlogStories.some((s) => this.matchesTextFilter(s)) || brokenStories.some((b) => this.matchesTextFilter(b));
        }
        if (showBacklog) {
          nodes.push({
            _kind: "sprintNode",
            sprintId: BACKLOG_SPRINT_ID,
            label: "Backlog",
            isBacklog: true,
          });
        }
      }

      // Append Inbox and Spikes sentinels if those folders have (matching) files
      const inboxFiles = this.store.getInboxFiles();
      if (inboxFiles.length > 0) {
        if (textFilter === "" || inboxFiles.some((f) => this.matchesTextFilter(f))) {
          nodes.push(makeInboxNode() as unknown as SprintNode);
        }
      }
      const spikeFiles = this.store.getSpikeFiles();
      if (spikeFiles.length > 0) {
        if (textFilter === "" || spikeFiles.some((f) => this.matchesTextFilter(f))) {
          nodes.push(makeSpikesNode() as unknown as SprintNode);
        }
      }

      return Promise.resolve(nodes);
    }

    // InboxSpikeNode children: flat list of (matching) files in that folder
    if (isInboxSpikeNode(element)) {
      let files = element.folderName === "inbox" ? this.store.getInboxFiles() : this.store.getSpikeFiles();
      if (textFilter !== "") {
        files = files.filter((f) => this.matchesTextFilter(f));
      }
      return Promise.resolve(files);
    }

    // InboxSpikeFile nodes are leaves
    if (isInboxSpikeFile(element)) {
      return Promise.resolve([]);
    }

    // SprintNode children: stories belonging to this sprint
    if (isSprintNode(element)) {
      const allStories = this.store.getStories();
      const sortState = this.sortService?.state;

      let filtered: Story[];
      if (element.isBacklog) {
        // Backlog catch-all: unassigned, empty, 'backlog', or sprint not in sequence
        filtered = allStories.filter((s) => isBacklogStory(s, sprintSequence));
      } else {
        filtered = allStories.filter((s) => s.sprint === element.sprintId);
      }

      // Apply text filter if active
      if (textFilter !== "") {
        filtered = filtered.filter((s) => this.matchesTextFilter(s));
      }

      const sorted = sortState ? sortStoriesBy(filtered, sortState, sprintSequence) : sortStoriesForTreeView(filtered, sprintSequence);

      // In the backlog node, also show broken stories at the top
      if (element.isBacklog) {
        let brokenStories = this.store.getBrokenStories();
        if (textFilter !== "") {
          brokenStories = brokenStories.filter((b) => this.matchesTextFilter(b));
        }
        return Promise.resolve([...brokenStories, ...sorted]);
      }

      return Promise.resolve(sorted);
    }

    // Story and BrokenFile nodes are leaves
    return Promise.resolve([]);
  }

  // ─── Breakdown view mode (Theme → Epic → Story) ────────────────────────

  private getBreakdownChildren(element?: TreeElement): Thenable<TreeElement[]> {
    const sprintSequence = this.configService?.config.sprintSequence ?? [];
    const textFilter = this.textFilterService?.filterText ?? "";
    // When text filter is active, bypass sprint filter so all nodes are searched
    const sprintFilter = textFilter !== "" ? null : (this.sprintFilterService?.currentSprint ?? null);

    if (!element) {
      // Root level: return themes + "No Theme" virtual node
      // (shown when there are orphan epics OR orphan stories)
      const allThemes = this.store.getThemes();
      const orphanEpics = this.getVisibleEpics(this.store.getEpicsWithoutTheme(), sprintFilter, textFilter);
      const orphanStories = this.getVisibleOrphanStories(sprintFilter, textFilter);
      const brokenEpics = this.store.getBrokenEpics();
      const brokenStories = this.store.getBrokenStories();
      const brokenThemes = this.store.getBrokenThemes();

      // Filter themes to only those with visible descendants (or that match text filter directly)
      let visibleThemes = allThemes;
      if (sprintFilter !== null || textFilter !== "") {
        visibleThemes = allThemes.filter((theme) => {
          // Theme itself matches text filter → show it
          if (textFilter !== "" && this.matchesTextFilter(theme)) {
            return true;
          }
          const epics = this.store.getEpicsByTheme(theme.id);
          return epics.some((epic) => {
            // Epic itself matches text filter → show its parent theme
            if (textFilter !== "" && this.matchesTextFilter(epic)) {
              return true;
            }
            const stories = this.store.getStoriesByEpic(epic.id);
            if (sprintFilter !== null) {
              return stories.some((s) => this.matchesSprintFilter(s, sprintFilter));
            }
            // Text filter: at least one child story matches
            return stories.some((s) => this.matchesTextFilter(s));
          });
        });
      }

      const sortedThemes = sortThemesByEpicSprintOrder(
        visibleThemes,
        sprintSequence,
        (themeId) => this.store.getEpicsByTheme(themeId),
        (epicId) => this.store.getStoriesByEpic(epicId),
        this.sortService?.state,
      );

      // Broken theme files surface at root level alongside valid themes
      // Filter broken files by text filter if active
      let filteredBrokenEpics = brokenEpics;
      let filteredBrokenStories = brokenStories;
      let filteredBrokenThemes = brokenThemes;
      if (textFilter !== "") {
        filteredBrokenEpics = brokenEpics.filter((b) => this.matchesTextFilter(b));
        filteredBrokenStories = brokenStories.filter((b) => this.matchesTextFilter(b));
        filteredBrokenThemes = brokenThemes.filter((b) => this.matchesTextFilter(b));
      }

      const roots: TreeElement[] = [...sortedThemes, ...filteredBrokenThemes];

      if (orphanEpics.length > 0 || orphanStories.length > 0 || filteredBrokenEpics.length > 0 || filteredBrokenStories.length > 0) {
        roots.push(makeNoThemeNode());
      }

      // Append Inbox and Spikes sentinels if those folders have (matching) files
      const inboxFiles = this.store.getInboxFiles();
      if (inboxFiles.length > 0) {
        if (textFilter === "" || inboxFiles.some((f) => this.matchesTextFilter(f))) {
          roots.push(makeInboxNode());
        }
      }
      const spikeFiles = this.store.getSpikeFiles();
      if (spikeFiles.length > 0) {
        if (textFilter === "" || spikeFiles.some((f) => this.matchesTextFilter(f))) {
          roots.push(makeSpikesNode());
        }
      }

      return Promise.resolve(roots);
    }

    // BrokenFile nodes are leaves — no children
    if ("broken" in element) {
      return Promise.resolve([]);
    }

    // InboxSpikeNode children: flat list of (matching) files in that folder
    if (isInboxSpikeNode(element)) {
      let files = element.folderName === "inbox" ? this.store.getInboxFiles() : this.store.getSpikeFiles();
      if (textFilter !== "") {
        files = files.filter((f) => this.matchesTextFilter(f));
      }
      return Promise.resolve(files);
    }

    // InboxSpikeFile and SprintNode nodes are leaves in breakdown mode
    if (isInboxSpikeFile(element) || isSprintNode(element)) {
      return Promise.resolve([]);
    }

    if (this.isTheme(element)) {
      // Theme: return filtered epics for this theme
      const epics = element.id === NO_THEME_ID ? this.store.getEpicsWithoutTheme() : this.store.getEpicsByTheme(element.id);

      const visibleEpics = this.getVisibleEpics(epics, sprintFilter, textFilter);
      const sortedEpics = sortEpicsBySprintOrder(
        visibleEpics,
        sprintSequence,
        (epicId) => this.store.getStoriesByEpic(epicId),
        this.sortService?.state,
      );

      // Under "No Theme", also show broken epics and the "No Epic" sentinel
      if (element.id === NO_THEME_ID) {
        const orphanStories = this.getVisibleOrphanStories(sprintFilter, textFilter);
        let brokenEpics = this.store.getBrokenEpics();
        let brokenStories = this.store.getBrokenStories();
        if (textFilter !== "") {
          brokenEpics = brokenEpics.filter((b) => this.matchesTextFilter(b));
          brokenStories = brokenStories.filter((b) => this.matchesTextFilter(b));
        }
        const trailing: (Epic | BrokenFile)[] = [
          ...brokenEpics,
          ...(orphanStories.length > 0 || brokenStories.length > 0 ? [makeNoEpicNode()] : []),
        ];
        return Promise.resolve(trailing.length > 0 ? [...sortedEpics, ...trailing] : sortedEpics);
      }

      return Promise.resolve(sortedEpics);
    }

    if (!this.isStory(element as Epic | Story)) {
      const epic = element as Epic;

      // "No Epic" sentinel: return broken stories (pinned top) + sorted valid orphan stories
      if (epic.id === NO_EPIC_ID) {
        const orphanStories = this.getVisibleOrphanStories(sprintFilter, textFilter);
        let brokenStories = this.store.getBrokenStories();
        if (textFilter !== "") {
          brokenStories = brokenStories.filter((b) => this.matchesTextFilter(b));
        }
        const sortState = this.sortService?.state;
        const sortedValid = sortState
          ? sortStoriesBy(orphanStories, sortState, sprintSequence)
          : sortStoriesForTreeView(orphanStories, sprintSequence);
        return Promise.resolve([...brokenStories, ...sortedValid]);
      }

      // Epic: return filtered and sorted stories
      const stories = this.store.getStoriesByEpic(epic.id);

      // Apply sprint filter if active
      let filtered = stories;
      if (sprintFilter !== null) {
        filtered = stories.filter((s) => this.matchesSprintFilter(s, sprintFilter));
      }

      // Apply text filter: if the epic itself matches, show all its stories;
      // otherwise only show stories that individually match
      if (textFilter !== "" && !this.matchesTextFilter(epic)) {
        filtered = filtered.filter((s) => this.matchesTextFilter(s));
      }

      // Sort stories by configured sort state (or fallback to default sprint/priority sort)
      const sortState = this.sortService?.state;
      const sorted = sortState ? sortStoriesBy(filtered, sortState, sprintSequence) : sortStoriesForTreeView(filtered, sprintSequence);

      return Promise.resolve(sorted);
    }

    return Promise.resolve([]);
  }

  private getVisibleEpics(epics: Epic[], sprintFilter: string | null, textFilter: string = ""): Epic[] {
    if (sprintFilter === null && textFilter === "") {
      return epics;
    }
    return epics.filter((epic) => {
      // Epic itself matches text filter → show it (with ancestor)
      if (textFilter !== "" && this.matchesTextFilter(epic)) {
        return true;
      }
      const stories = this.store.getStoriesByEpic(epic.id);
      if (sprintFilter !== null) {
        return stories.some((s) => this.matchesSprintFilter(s, sprintFilter));
      }
      // Text filter only: at least one child story matches
      return stories.some((s) => this.matchesTextFilter(s));
    });
  }

  private getVisibleOrphanStories(sprintFilter: string | null, textFilter: string = ""): Story[] {
    const orphans = this.store.getStoriesWithoutEpic();
    if (sprintFilter === null && textFilter === "") {
      return orphans;
    }
    return orphans.filter((s) => {
      if (sprintFilter !== null && !this.matchesSprintFilter(s, sprintFilter)) {
        return false;
      }
      if (textFilter !== "" && !this.matchesTextFilter(s)) {
        return false;
      }
      return true;
    });
  }

  private matchesSprintFilter(story: Story, sprintFilter: string): boolean {
    if (sprintFilter === "backlog") {
      // Backlog = empty, undefined, or 'backlog' sprint
      return !story.sprint || story.sprint === "" || story.sprint === "backlog";
    }
    return story.sprint === sprintFilter;
  }

  /**
   * Case-insensitive substring match against the display text of a tree element.
   * Returns true when no text filter is active (empty string).
   */
  private matchesTextFilter(element: Story | Epic | Theme | BrokenFile | InboxSpikeFile): boolean {
    const filterText = this.textFilterService?.filterText ?? "";
    if (filterText === "") {
      return true;
    }
    const query = filterText.toLowerCase();

    if ("broken" in element) {
      // BrokenFile — match against id
      return element.id.toLowerCase().includes(query);
    }
    if (isInboxSpikeFile(element)) {
      // InboxSpikeFile — match against fileName
      return element.fileName.toLowerCase().includes(query);
    }
    // Story, Epic, or Theme — match against "id: title" (same as tree label)
    const label = `${element.id}: ${element.title}`.toLowerCase();
    return label.includes(query);
  }

  private isTheme(element: Theme | Epic | Story): element is Theme {
    // Theme has no 'type' (Story discriminant) and no 'theme' key (Epic always has
    // theme: data.theme set by parser, even when undefined, making 'theme' in epic === true).
    // Also exclude _kind-based nodes (SprintNode, InboxSpikeNode, InboxSpikeFile).
    return !("type" in element) && !("theme" in element) && !("_kind" in element);
  }

  private isStory(element: Epic | Story): element is Story {
    return "type" in element;
  }

  private getIconPath(iconName: string): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } | undefined {
    if (!this.extensionPath) {
      return undefined;
    }

    const iconsPath = path.join(this.extensionPath, "assets", "icons");
    return {
      light: vscode.Uri.file(path.join(iconsPath, `${iconName}-light.svg`)),
      dark: vscode.Uri.file(path.join(iconsPath, `${iconName}-dark.svg`)),
    };
  }

  private getStoryIcon(type: StoryType): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } | undefined {
    const iconMap: Record<StoryType, string> = {
      feature: "feature",
      bug: "bug",
      task: "task",
      chore: "chore",
      spike: "task",
    };

    const iconName = iconMap[type] || "story";
    return this.getIconPath(iconName);
  }

  private getStatusIndicator(status: string): string {
    const statuses = this.configService?.config?.statuses ?? [];
    return getStatusIndicator(status, statuses);
  }

  private createTreeItem(element: TreeElement): vscode.TreeItem {
    if (isInboxSpikeNode(element)) {
      return this.createInboxSpikeNodeTreeItem(element);
    }
    if (isInboxSpikeFile(element)) {
      return this.createInboxSpikeFileTreeItem(element);
    }
    if (isSprintNode(element)) {
      return this.createSprintTreeItem(element);
    }
    if ("broken" in element) {
      return this.createBrokenFileTreeItem(element);
    }
    if (this.isTheme(element)) {
      return this.createThemeTreeItem(element);
    }
    if (!this.isStory(element as Epic | Story)) {
      return this.createEpicTreeItem(element as Epic);
    }
    return this.createStoryTreeItem(element as Story);
  }

  private createInboxSpikeNodeTreeItem(element: InboxSpikeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = "inboxSpikeNode";
    item.id = element.nodeId;

    const files = element.folderName === "inbox" ? this.store.getInboxFiles() : this.store.getSpikeFiles();
    const count = files.length;

    if (element.folderName === "inbox") {
      item.iconPath = new vscode.ThemeIcon("inbox");
      item.description = `${count} ${count === 1 ? "file" : "files"}`;
      item.tooltip = "Inbox — drag files onto sprints or epics to convert them";
    } else {
      item.iconPath = new vscode.ThemeIcon("beaker");
      item.description = `${count} ${count === 1 ? "file" : "files"}`;
      item.tooltip = "Spikes — drag files onto sprints or epics to convert them";
    }

    return item;
  }

  private createInboxSpikeFileTreeItem(element: InboxSpikeFile): vscode.TreeItem {
    const item = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "inboxSpikeFile";
    item.id = `inboxSpike:${element.filePath}`;
    item.iconPath = new vscode.ThemeIcon("file");
    item.tooltip = `${element.folderType === "inbox" ? "Inbox" : "Spike"}: ${element.fileName}\nDrag onto a sprint, epic, or theme to convert`;
    item.command = {
      command: "vscode.open",
      title: "Open file",
      arguments: [vscode.Uri.file(element.filePath)],
    };
    return item;
  }

  private createSprintTreeItem(element: SprintNode): vscode.TreeItem {
    const currentSprint = this.configService?.config.currentSprint ?? null;
    const sprintFilter = this.sprintFilterService?.currentSprint ?? null;
    const isCurrent = !element.isBacklog && element.sprintId === currentSprint;

    // When filtered to a single sprint, expand it; otherwise expand only the current sprint
    const isFiltered = sprintFilter !== null;
    const collapsibleState = isFiltered || isCurrent ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;

    const item = new vscode.TreeItem(element.label, collapsibleState);
    item.contextValue = "sprintNode";
    item.id = isFiltered ? `sprint:${element.sprintId}:filtered` : `sprint:${element.sprintId}`;

    if (element.isBacklog) {
      item.iconPath = new vscode.ThemeIcon("inbox");
      // Count stories in backlog
      const sprintSequence = this.configService?.config.sprintSequence ?? [];
      const backlogCount = this.store.getStories().filter((s) => isBacklogStory(s, sprintSequence)).length;
      const brokenCount = this.store.getBrokenStories().length;
      const totalCount = backlogCount + brokenCount;
      item.description = `${totalCount} ${totalCount === 1 ? "story" : "stories"}`;
      item.tooltip = "Unassigned & unrecognized sprints";
    } else {
      item.iconPath = new vscode.ThemeIcon("milestone");
      // Count stories in this sprint
      const storyCount = this.store.getStories().filter((s) => s.sprint === element.sprintId).length;
      const suffix = isCurrent ? " (current)" : "";
      item.description = `${storyCount} ${storyCount === 1 ? "story" : "stories"}${suffix}`;
      item.tooltip = `Sprint: ${element.sprintId}${isCurrent ? " (current sprint)" : ""}`;
    }

    return item;
  }

  private createBrokenFileTreeItem(element: BrokenFile): vscode.TreeItem {
    const item = new vscode.TreeItem(element.id, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "brokenFile";
    item.id = `broken:${element.filePath}`;
    item.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("errorForeground"));
    // Show truncated error as inline description
    const shortError = element.error.length > 60 ? element.error.slice(0, 57) + "..." : element.error;
    item.description = shortError;
    item.tooltip = new vscode.MarkdownString(
      `**$(error) Broken ${element.fileType} file**\n\n` + `**File:** \`${element.filePath}\`\n\n` + `**Error:** ${element.error}`,
    );
    item.tooltip.supportThemeIcons = true;
    // Click opens the file so the user can fix it
    item.command = {
      command: "vscode.open",
      title: "Open file",
      arguments: [vscode.Uri.file(element.filePath)],
    };
    return item;
  }

  private createThemeTreeItem(element: Theme): vscode.TreeItem {
    if (element.id === NO_THEME_ID) {
      const item = new vscode.TreeItem("No Theme", vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = "noTheme";
      item.id = NO_THEME_ID;
      item.iconPath = new vscode.ThemeIcon("folder");
      item.description = "Epics without a theme";
      item.tooltip = "Epics not assigned to any theme";
      return item;
    }

    const label = `${element.id}: ${element.title}`;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = "theme";
    item.id = element.id;
    item.iconPath = this.getIconPath("epic") ?? new vscode.ThemeIcon("symbol-namespace");
    item.description = element.status ? `${this.getStatusIndicator(element.status)} ${element.status}` : undefined;
    const epicCount = this.store.getEpicsByTheme(element.id).length;
    const createdDate = element.created.toISOString().split("T")[0];
    item.tooltip = new vscode.MarkdownString(
      `**${element.id}**: ${element.title}\n\n` + `Status: ${element.status}\n` + `Created: ${createdDate}\n` + `Epics: ${epicCount}`,
    );
    if (element.filePath) {
      item.resourceUri = vscode.Uri.file(element.filePath);
    }
    return item;
  }

  private createEpicTreeItem(element: Epic): vscode.TreeItem {
    // "No Epic" sentinel node
    if (element.id === NO_EPIC_ID) {
      const item = new vscode.TreeItem("No Epic", vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = "noEpic";
      item.id = NO_EPIC_ID;
      item.iconPath = new vscode.ThemeIcon("inbox");
      item.description = "Stories without an epic";
      item.tooltip = "Stories not assigned to any epic";
      return item;
    }

    const label = `${element.id}: ${element.title}`;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = "epic";
    item.id = element.id;
    item.iconPath = this.getIconPath("epic");
    item.description = `${this.getStatusIndicator(element.status)} ${element.status}`;
    const storyCount = this.store.getStoriesByEpic(element.id).length;
    const createdDate = element.created.toISOString().split("T")[0];
    item.tooltip = new vscode.MarkdownString(
      `**${element.id}**: ${element.title}\n\n` + `Status: ${element.status}\n` + `Created: ${createdDate}\n` + `Stories: ${storyCount}`,
    );
    if (element.filePath) {
      item.resourceUri = vscode.Uri.file(element.filePath);
    }
    return item;
  }

  private createStoryTreeItem(element: Story): vscode.TreeItem {
    const label = `${element.id}: ${element.title}`;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "story";
    item.id = element.id;
    item.iconPath = this.getStoryIcon(element.type);
    item.description = `${this.getStatusIndicator(element.status)} ${element.status}`;
    item.tooltip = new vscode.MarkdownString(
      `**${element.id}**: ${element.title}\n\n` +
        `Type: ${element.type}\n` +
        `Status: ${element.status}\n` +
        `Size: ${element.size || "N/A"}`,
    );
    if (element.filePath) {
      item.command = {
        command: "vscode.open",
        title: "Open Story",
        arguments: [vscode.Uri.file(element.filePath)],
      };
    }
    return item;
  }
}
