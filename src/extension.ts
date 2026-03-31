import * as vscode from "vscode";
import { executeChangeStatus } from "./commands/changeStatus";
import { executeCreateEpic } from "./commands/createEpic";
import { executeCreateTheme } from "./commands/createTheme";
import { executeCreateStory } from "./commands/createStory";
import { executeCreateStoryMenu } from "./commands/createStoryMenu";
import { executeCreateTask } from "./commands/createTask";
import { wrapCommand } from "./commands/errorHandler";
import { executeInit } from "./commands/init";
import { executePickSprint } from "./commands/pickSprint";
import { executeQuickCapture } from "./commands/quickCapture";
import { executeSaveAsTemplate } from "./commands/saveAsTemplate";
import { executeSetCurrentSprint } from "./commands/setCurrentSprint";
import { executeSortStories } from "./commands/sortStories";
import { executeTextFilter } from "./commands/textFilter";
import { executeSoftArchive, executeRestoreFromArchive, executeRestoreItem } from "./commands/archiveSprint";
import { executeBrowseStorydocs } from "./commands/browseStorydocs";
import { applyAutoFilterSprint } from "./core/autoFilterSprint";
import { AutoTimestamp } from "./core/autoTimestamp";
import { ConfigService } from "./core/configService";
import { showConfigUpgradeNotification } from "./core/configServiceNotifications";
import { initializeLogger, disposeLogger } from "./core/logger";
import { SortService } from "./core/sortService";
import { SprintFilterService } from "./core/sprintFilterService";
import { TextFilterService } from "./core/textFilterService";
import { Store } from "./core/store";
import { Watcher } from "./core/watcher";
import { updateWelcomeContext } from "./core/welcomeContext";
import { FrontmatterCompletionProvider } from "./providers/frontmatterCompletionProvider";
import { StoryHoverProvider } from "./providers/storyHoverProvider";
import { StoryLinkProvider } from "./providers/storyLinkProvider";
import { FrontmatterDiagnosticsProvider } from "./validation/frontmatterDiagnostics";
import { StatusBarController } from "./view/statusBar";
import { StoriesDragAndDropController } from "./view/storiesDragAndDropController";
import { BurndownViewProvider } from "./view/burndownViewProvider";
import { StoriesProvider } from "./view/storiesProvider";
import { getTreeViewTitle } from "./view/storiesProviderUtils";
import { StorydocsService } from "./core/storydocsService";
import { isStorydocsEnabled } from "./core/storydocsUtils";
import { TaskWatcher } from "./core/taskWatcher";
import { isTask } from "./types/task";

export async function activate(context: vscode.ExtensionContext) {
  // Initialize logger first
  const logger = initializeLogger();
  logger.info("DevStories is now active!");

  const extensionVersion: string = context.extension.packageJSON.version ?? "0.0.0";

  // Initialize Core Components
  const watcher = new Watcher();
  const store = new Store(watcher);
  const configService = new ConfigService(extensionVersion);
  const sprintFilterService = new SprintFilterService();
  const sortService = new SortService();
  const textFilterService = new TextFilterService();
  const storiesProvider = new StoriesProvider(
    store,
    context.extensionPath,
    configService,
    sprintFilterService,
    sortService,
    textFilterService,
  );
  const statusBarController = new StatusBarController(store, configService, sprintFilterService);
  const autoTimestamp = new AutoTimestamp(configService);
  const storydocsService = new StorydocsService(store, configService);

  // Initialize config service (loads config and starts watching)
  await configService.initialize();

  // Auto-upgrade config.json if it's an older schema version
  const fieldsAdded = await configService.upgradeConfigIfNeeded();
  if (fieldsAdded.length > 0) {
    void showConfigUpgradeNotification(fieldsAdded);
  }

  // Auto-filter to current sprint if configured (DS-153)
  applyAutoFilterSprint(configService.config, sprintFilterService);

  // Register Tree View with createTreeView for dynamic title updates (DS-139)
  const dragAndDropController = new StoriesDragAndDropController(
    store,
    () => storiesProvider.viewMode,
    sortService,
    configService,
    storydocsService,
  );
  const treeView = vscode.window.createTreeView("devstories.views.explorer", {
    treeDataProvider: storiesProvider,
    dragAndDropController,
    canSelectMany: true,
  });

  // Register Burndown Chart WebviewView (below tree view in sidebar)
  const burndownProvider = new BurndownViewProvider(store, configService, sprintFilterService);
  const burndownDisposable = vscode.window.registerWebviewViewProvider(BurndownViewProvider.viewId, burndownProvider);

  // Helper: refresh tree title using current config + filter
  const refreshTitle = () => {
    treeView.title = getTreeViewTitle(
      configService.config.currentSprint,
      sprintFilterService.currentSprint,
      storiesProvider.viewMode,
      textFilterService.filterText,
    );
  };

  // Update tree view title and context when sprint filter changes
  sprintFilterService.onDidSprintChange(async (sprint) => {
    refreshTitle();
    // DS-153: Update context for filter icon state
    await vscode.commands.executeCommand("setContext", "devstories:hasSprintFilter", sprint !== null);
  });

  // Update title and context when text filter changes
  textFilterService.onDidFilterChange(async (text) => {
    refreshTitle();
    await vscode.commands.executeCommand("setContext", "devstories:hasTextFilter", text !== "");
  });

  // Update title and re-apply sprint filter when config changes
  configService.onDidConfigChange(async (newConfig) => {
    refreshTitle();
    applyAutoFilterSprint(newConfig, sprintFilterService);
    await updateWelcomeContext(store.getEpics().length);
    // Update storydocs-enabled context when config changes
    await vscode.commands.executeCommand("setContext", "devstories:storydocsEnabled", isStorydocsEnabled(newConfig));
  });

  // Set initial title and filter context
  refreshTitle();
  await vscode.commands.executeCommand("setContext", "devstories:hasSprintFilter", sprintFilterService.currentSprint !== null);
  await vscode.commands.executeCommand("setContext", "devstories:hasTextFilter", textFilterService.filterText !== "");
  // Set initial storydocs-enabled context (for context menu visibility)
  await vscode.commands.executeCommand("setContext", "devstories:storydocsEnabled", isStorydocsEnabled(configService.config));
  // Set initial view mode context (default: backlog)
  await vscode.commands.executeCommand("setContext", "devstories:viewMode", storiesProvider.viewMode);

  // Refresh title when view mode changes
  storiesProvider.onDidViewModeChange(async (mode) => {
    refreshTitle();
    await vscode.commands.executeCommand("setContext", "devstories:viewMode", mode);
  });

  // Register Document Link Provider for [[ID]] links
  const storyLinkProvider = new StoryLinkProvider(store);
  const linkProviderDisposable = vscode.languages.registerDocumentLinkProvider({ language: "markdown", scheme: "file" }, storyLinkProvider);

  // Register Hover Provider for [[ID]] preview
  const storyHoverProvider = new StoryHoverProvider(store, configService);
  const hoverProviderDisposable = vscode.languages.registerHoverProvider({ language: "markdown", scheme: "file" }, storyHoverProvider);

  // Register Completion Provider for frontmatter fields and [[ID]] links (DS-123, DS-124)
  const frontmatterCompletionProvider = new FrontmatterCompletionProvider(configService, store);
  const completionProviderDisposable = vscode.languages.registerCompletionItemProvider(
    { language: "markdown", scheme: "file" },
    frontmatterCompletionProvider,
    ":", // Trigger for field values
    " ", // Trigger after space
    "[", // Trigger for [[ID]] links
  );

  // Register Frontmatter Diagnostics Provider (DS-121, DS-122)
  const diagnosticsProvider = new FrontmatterDiagnosticsProvider(configService, store, context.extensionPath);
  const diagnosticsDisposables = diagnosticsProvider.register();

  // Helper: compute absolute storydocs root from config
  function getAbsStorydocsRoot(cfg: typeof configService.config): string | undefined {
    if (!isStorydocsEnabled(cfg)) {
      return undefined;
    }
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      return undefined;
    }
    return vscode.Uri.joinPath(folders[0].uri, cfg.storydocsRoot!).fsPath;
  }

  // Helper: create (or recreate) TaskWatcher, wiring events to store
  let taskWatcher: TaskWatcher | undefined;
  let archiveTaskWatcher: TaskWatcher | undefined;
  function ensureTaskWatcher(absRoot: string | undefined, archiveStorydocsSegment?: string): void {
    taskWatcher?.dispose();
    taskWatcher = undefined;
    archiveTaskWatcher?.dispose();
    archiveTaskWatcher = undefined;
    if (absRoot) {
      taskWatcher = new TaskWatcher(absRoot);
      taskWatcher.onDidCreate((uri) => store.reloadFile(uri));
      taskWatcher.onDidChange((uri) => store.reloadFile(uri));
      taskWatcher.onDidDelete((uri) => store.handleFileDeleted(uri));

      // Second watcher for archived task files
      const archiveSeg = archiveStorydocsSegment ?? "archive";
      const archiveRoot = vscode.Uri.joinPath(vscode.Uri.file(absRoot), archiveSeg).fsPath;
      archiveTaskWatcher = new TaskWatcher(archiveRoot);
      archiveTaskWatcher.onDidCreate((uri) => store.reloadFile(uri));
      archiveTaskWatcher.onDidChange((uri) => store.reloadFile(uri));
      archiveTaskWatcher.onDidDelete((uri) => store.handleFileDeleted(uri));
    }
  }

  // Load initial data (including tasks when storydocs is enabled)
  const absRoot = getAbsStorydocsRoot(configService.config);
  await store.load(absRoot, configService.config.archiveSoftDevstories, configService.config.archiveSoftStorydocs);

  // Create initial TaskWatcher for storydocs task files
  ensureTaskWatcher(absRoot, configService.config.archiveSoftStorydocs);

  // Reconcile storydocs folders after store is populated
  if (isStorydocsEnabled(configService.config)) {
    // Run in background — don't block activation
    void storydocsService.reconcileAll();
  }

  // Re-reconcile when storydocs config changes (e.g. feature enabled mid-session)
  configService.onDidConfigChange(async (newConfig) => {
    const newRoot = getAbsStorydocsRoot(newConfig);
    ensureTaskWatcher(newRoot, newConfig.archiveSoftStorydocs);
    if (isStorydocsEnabled(newConfig)) {
      void storydocsService.reconcileAll();
    }
    // Reload store so task data reflects the new config
    await store.load(newRoot, newConfig.archiveSoftDevstories, newConfig.archiveSoftStorydocs);
  });

  // Update welcome context based on folder and epic state
  await updateWelcomeContext(store.getEpics().length);
  store.onDidUpdate(async () => {
    await updateWelcomeContext(store.getEpics().length);
  });

  // Register Commands with error handling
  const initCommand = vscode.commands.registerCommand(
    "devstories.init",
    wrapCommand("init", async () => {
      const success = await executeInit({ extensionVersion });
      if (success) {
        // Reload store to pick up new files (including tasks if storydocs enabled)
        await store.load(
          getAbsStorydocsRoot(configService.config),
          configService.config.archiveSoftDevstories,
          configService.config.archiveSoftStorydocs,
        );
        // Update welcome context (folder now exists)
        await updateWelcomeContext(store.getEpics().length);
      }
    }),
  );

  const createEpicCommand = vscode.commands.registerCommand(
    "devstories.createEpic",
    wrapCommand("createEpic", async (item) => {
      // item is defined when invoked from tree view context menu
      await executeCreateEpic(store, item?.id, storydocsService, configService);
    }),
  );

  const createStoryCommand = vscode.commands.registerCommand(
    "devstories.createStory",
    wrapCommand("createStory", async (item) => {
      // item is defined when invoked from tree view context menu
      await executeCreateStory(store, item?.id, storydocsService, configService);
    }),
  );

  const quickCaptureCommand = vscode.commands.registerCommand(
    "devstories.quickCapture",
    wrapCommand("quickCapture", async () => {
      await executeQuickCapture(store, storydocsService, configService);
    }),
  );

  const saveAsTemplateCommand = vscode.commands.registerCommand(
    "devstories.saveAsTemplate",
    wrapCommand("saveAsTemplate", async (story) => {
      await executeSaveAsTemplate(story);
    }),
  );

  const changeStatusCommand = vscode.commands.registerCommand(
    "devstories.changeStatus",
    wrapCommand("changeStatus", async (item) => {
      if (item) {
        // Called from context menu with tree item.
        // VS Code passes the data element from getChildren(), not the TreeItem.
        // For tasks, item.id is the bare ID; construct composite key for store lookup.
        const task = isTask(item) ? store.getTask(`${item.story}::${item.id}`) : undefined;
        const story = store.getStory(item.id);
        const epic = store.getEpic(item.id);
        const theme = store.getTheme(item.id);
        const target = task || story || epic || theme;
        if (target) {
          await executeChangeStatus(store, target, configService);
        }
      }
    }),
  );

  const pickSprintCommand = vscode.commands.registerCommand(
    "devstories.pickSprint",
    wrapCommand("pickSprint", async () => {
      await executePickSprint(store, sprintFilterService, configService);
    }),
  );

  const setCurrentSprintCommand = vscode.commands.registerCommand(
    "devstories.setCurrentSprint",
    wrapCommand("setCurrentSprint", async () => {
      await executeSetCurrentSprint(sprintFilterService, configService);
    }),
  );

  const sortStoriesCommand = vscode.commands.registerCommand(
    "devstories.sortStories",
    wrapCommand("sortStories", async () => {
      await executeSortStories(sortService);
    }),
  );

  // DS-153: Clear sprint filter command
  const clearSprintFilterCommand = vscode.commands.registerCommand(
    "devstories.clearSprintFilter",
    wrapCommand("clearSprintFilter", async () => {
      sprintFilterService.setSprint(null);
    }),
  );

  // Text search filter commands
  const textFilterCommand = vscode.commands.registerCommand(
    "devstories.textFilter",
    wrapCommand("textFilter", async () => {
      await executeTextFilter(textFilterService, sprintFilterService);
    }),
  );

  const clearTextFilterCommand = vscode.commands.registerCommand(
    "devstories.clearTextFilter",
    wrapCommand("clearTextFilter", async () => {
      textFilterService.setFilter("");
    }),
  );

  const openEpicCommand = vscode.commands.registerCommand(
    "devstories.openEpic",
    wrapCommand("openEpic", async (item) => {
      if (item) {
        const epic = store.getEpic(item.id);
        if (epic?.filePath) {
          await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(epic.filePath));
        }
      }
    }),
  );

  const createThemeCommand = vscode.commands.registerCommand(
    "devstories.createTheme",
    wrapCommand("createTheme", async () => {
      await executeCreateTheme(store, storydocsService, configService);
    }),
  );

  const openThemeCommand = vscode.commands.registerCommand(
    "devstories.openTheme",
    wrapCommand("openTheme", async (item) => {
      if (item) {
        const theme = store.getTheme(item.id);
        if (theme?.filePath) {
          await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(theme.filePath));
        }
      }
    }),
  );

  const createStoryMenuCommand = vscode.commands.registerCommand(
    "devstories.createStoryMenu",
    wrapCommand("createStoryMenu", async () => {
      await executeCreateStoryMenu();
    }),
  );

  // View mode toggle commands
  const switchToBreakdownCommand = vscode.commands.registerCommand(
    "devstories.switchToBreakdown",
    wrapCommand("switchToBreakdown", async () => {
      storiesProvider.setViewMode("breakdown");
    }),
  );

  const switchToBacklogCommand = vscode.commands.registerCommand(
    "devstories.switchToBacklog",
    wrapCommand("switchToBacklog", async () => {
      storiesProvider.setViewMode("backlog");
    }),
  );

  // StoryDocs: Browse command (QuickPick of files/subfolders in node's storydocs folder)
  const browseStorydocsCommand = vscode.commands.registerCommand(
    "devstories.browseStorydocs",
    wrapCommand("browseStorydocs", async (item) => {
      await executeBrowseStorydocs(store, configService, item, storydocsService);
    }),
  );

  // StoryDocs: Reconcile command
  const reconcileStorydocsCommand = vscode.commands.registerCommand(
    "devstories.reconcileStorydocs",
    wrapCommand("reconcileStorydocs", async () => {
      if (!isStorydocsEnabled(configService.config)) {
        void vscode.window.showWarningMessage(
          'StoryDocs is not enabled. Add "storydocs": { "enabled": true, "root": "..." } to config.json.',
        );
        return;
      }
      await storydocsService.reconcileAll();
      void vscode.window.showInformationMessage("StoryDocs folders reconciled.");
    }),
  );

  // Create Task command (requires storydocs)
  const createTaskCommand = vscode.commands.registerCommand(
    "devstories.createTask",
    wrapCommand("createTask", async (item) => {
      await executeCreateTask(store, item?.id, storydocsService, configService);
    }),
  );

  // Soft Archive command
  const reloadStore = async () => {
    const root = getAbsStorydocsRoot(configService.config);
    await store.load(root, configService.config.archiveSoftDevstories, configService.config.archiveSoftStorydocs);
  };

  const softArchiveCommand = vscode.commands.registerCommand(
    "devstories.softArchive",
    wrapCommand("softArchive", async () => {
      await executeSoftArchive(store, configService, reloadStore, storydocsService);
    }),
  );

  // Restore from Archive command (sprint-based)
  const restoreFromArchiveCommand = vscode.commands.registerCommand(
    "devstories.restoreFromArchive",
    wrapCommand("restoreFromArchive", async () => {
      await executeRestoreFromArchive(store, configService, reloadStore, storydocsService);
    }),
  );

  // Restore single item command (context menu)
  const restoreItemCommand = vscode.commands.registerCommand(
    "devstories.restoreItem",
    wrapCommand("restoreItem", async (item) => {
      if (!item?.id) {
        return;
      }
      // VS Code passes the data element from getChildren(), not the TreeItem.
      // Use store lookups to determine type (same pattern as changeStatus).
      const epic = store.getEpic(item.id);
      const theme = store.getTheme(item.id);
      const itemType = epic ? ("epic" as const) : theme ? ("theme" as const) : ("story" as const);
      await executeRestoreItem(store, configService, item.id, itemType, reloadStore, storydocsService);
    }),
  );

  context.subscriptions.push(
    watcher,
    configService,
    sprintFilterService,
    sortService,
    textFilterService,
    autoTimestamp,
    storydocsService,
    statusBarController,
    treeView,
    burndownDisposable,
    linkProviderDisposable,
    hoverProviderDisposable,
    completionProviderDisposable,
    diagnosticsProvider,
    ...diagnosticsDisposables,
    initCommand,
    createEpicCommand,
    createStoryCommand,
    quickCaptureCommand,
    saveAsTemplateCommand,
    changeStatusCommand,
    pickSprintCommand,
    setCurrentSprintCommand,
    sortStoriesCommand,
    clearSprintFilterCommand,
    textFilterCommand,
    clearTextFilterCommand,
    openEpicCommand,
    createThemeCommand,
    openThemeCommand,
    createStoryMenuCommand,
    switchToBreakdownCommand,
    switchToBacklogCommand,
    browseStorydocsCommand,
    reconcileStorydocsCommand,
    createTaskCommand,
    softArchiveCommand,
    restoreFromArchiveCommand,
    restoreItemCommand,
  );
  // TaskWatcher is managed by ensureTaskWatcher(); register a disposal wrapper
  context.subscriptions.push({
    dispose: () => {
      taskWatcher?.dispose();
      archiveTaskWatcher?.dispose();
    },
  });
}

export function deactivate() {
  disposeLogger();
}
