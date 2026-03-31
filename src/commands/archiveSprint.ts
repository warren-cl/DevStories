/**
 * Soft Archive Sprint Command — moves stories from sprints up to the cutoff
 * (and their cascading epics/themes) from the live directory into the archive
 * subdirectory. Stories with a sprint are archived regardless of status.
 * No-sprint stories require a canArchive status and an effective date.
 *
 * Flow:
 * 1. User picks a sprint cutoff via QuickPick
 * 2. Pure eligibility logic determines what can be archived
 * 3. Confirmation dialog
 * 4. Files moved via workspace.fs.rename (preserves git history)
 * 5. Store reloaded to reflect new state
 */

import * as vscode from "vscode";
import { Store } from "../core/store";
import { ConfigService } from "../core/configService";
import { StorydocsService } from "../core/storydocsService";
import { getLogger } from "../core/logger";
import { isStorydocsEnabled } from "../core/storydocsUtils";
import {
  computeArchiveCutoffIndex,
  getEligibleStories,
  getEligibleEpics,
  getEligibleThemes,
  getRestorableStories,
  getRestorableEpics,
  getRestorableThemes,
  buildArchivePlan,
  computeArchiveDestination,
  computeStorydocsArchiveDestination,
  computeLiveDestination,
  ArchivePlan,
} from "./archiveSprintUtils";

interface SprintQuickPickItem extends vscode.QuickPickItem {
  value: string;
}

/**
 * Execute the soft archive sprint command.
 * Returns true if archiving was performed, false otherwise.
 */
export async function executeSoftArchive(
  store: Store,
  configService: ConfigService,
  reloadStore: () => Promise<void>,
  storydocsService?: StorydocsService,
): Promise<boolean> {
  const config = configService.config;
  const sprintSequence = config.sprintSequence;

  if (sprintSequence.length === 0) {
    void vscode.window.showWarningMessage("No sprints defined. Add sprints to config.json to use archive.");
    return false;
  }

  // Step 1: Pick cutoff sprint
  const items: SprintQuickPickItem[] = sprintSequence.map((sprint) => ({
    label: `$(milestone) ${sprint}`,
    description: sprint === config.currentSprint ? "Current Sprint" : undefined,
    value: sprint,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Archive stories completed up to and including...",
    title: "DevStories: Soft Archive Sprint",
  });

  if (!selected) return false;

  const cutoffIndex = computeArchiveCutoffIndex(selected.value, sprintSequence);
  if (cutoffIndex === -1) return false;

  // Step 2: Compute eligible items
  const allStories = store.getStories().filter((s) => !s.isArchived);
  const allEpics = store.getEpics().filter((e) => !e.isArchived);
  const allThemes = store.getThemes().filter((t) => !t.isArchived);

  const sprintDateInfo =
    config.firstSprintStartDate && config.sprintLength
      ? { firstSprintStartDate: config.firstSprintStartDate, sprintLength: config.sprintLength }
      : undefined;

  const eligibleStories = getEligibleStories(allStories, sprintSequence, cutoffIndex, config.statuses, sprintDateInfo);

  const eligibleStoryIds = new Set(eligibleStories.map((s) => s.id));
  const eligibleEpics = getEligibleEpics(allEpics, eligibleStoryIds, store.getStories(), config.statuses);
  const eligibleEpicIds = new Set(eligibleEpics.map((e) => e.id));
  const eligibleThemes = getEligibleThemes(allThemes, eligibleEpicIds, store.getEpics(), config.statuses);

  const plan = buildArchivePlan(eligibleStories, eligibleEpics, eligibleThemes);

  if (plan.storyCount === 0 && plan.epicCount === 0 && plan.themeCount === 0) {
    void vscode.window.showInformationMessage(`No eligible items found up to ${selected.value}.`);
    return false;
  }

  // Step 3: Confirmation
  const confirmed = await confirmArchive(plan, selected.value);
  if (!confirmed) return false;

  // Step 4: Move files
  const archiveDevSeg = config.archiveSoftDevstories ?? "archive";
  const archiveDocsSeg = config.archiveSoftStorydocs ?? "archive";
  const storydocsEnabled = isStorydocsEnabled(config);

  const folders = vscode.workspace.workspaceFolders;
  const storydocsRoot = storydocsEnabled && folders ? vscode.Uri.joinPath(folders[0].uri, config.storydocsRoot!).fsPath : undefined;

  getLogger().info(
    `[Archive] storydocsRoot resolution: enabled=${storydocsEnabled}, configRoot=${config.storydocsRoot ?? "(undefined)"}, hasFolders=${!!folders}, resolved=${storydocsRoot ?? "(undefined)"}`,
  );

  await moveFilesToArchive(plan, archiveDevSeg, archiveDocsSeg, storydocsRoot);

  // Step 5: Reload store and reconcile storydocs folders
  await reloadStore();
  if (storydocsService) {
    void storydocsService.reconcileAll();
  }

  void vscode.window.showInformationMessage(`Archived ${plan.storyCount} stories, ${plan.epicCount} epics, ${plan.themeCount} themes.`);
  return true;
}

/**
 * Execute restore from archive for a specific sprint.
 * Returns true if restore was performed, false otherwise.
 */
export async function executeRestoreFromArchive(
  store: Store,
  configService: ConfigService,
  reloadStore: () => Promise<void>,
  storydocsService?: StorydocsService,
): Promise<boolean> {
  const config = configService.config;
  const archiveDevSeg = config.archiveSoftDevstories ?? "archive";
  const archiveDocsSeg = config.archiveSoftStorydocs ?? "archive";
  const sprintSequence = config.sprintSequence;

  // Get archived stories grouped by sprint
  const archivedStories = store.getStories().filter((s) => s.isArchived);
  if (archivedStories.length === 0) {
    void vscode.window.showInformationMessage("No archived items to restore.");
    return false;
  }

  // Collect unique sprints from archived stories, ordered by sprint sequence
  const sprintSet = new Set<string>();
  for (const story of archivedStories) {
    if (story.sprint) sprintSet.add(story.sprint);
  }

  const sprints = Array.from(sprintSet).sort((a, b) => {
    return sprintSequence.indexOf(a) - sprintSequence.indexOf(b);
  });

  if (sprints.length === 0) {
    void vscode.window.showInformationMessage("No archived sprints found.");
    return false;
  }

  const items: SprintQuickPickItem[] = sprints.map((sprint) => ({
    label: `$(milestone) ${sprint}`,
    value: sprint,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Restore all items from sprint and newer...",
    title: "DevStories: Restore From Archive",
  });

  if (!selected) return false;

  // Use cutoff-based multi-sprint restore
  const cutoffIndex = sprintSequence.indexOf(selected.value);
  if (cutoffIndex === -1) return false;

  const sprintDateInfo =
    config.firstSprintStartDate && config.sprintLength
      ? { firstSprintStartDate: config.firstSprintStartDate, sprintLength: config.sprintLength }
      : undefined;

  const storiesToRestore = getRestorableStories(archivedStories, sprintSequence, cutoffIndex, sprintDateInfo);
  const storyIds = new Set(storiesToRestore.map((s) => s.id));

  const archivedEpics = store.getEpics().filter((e) => e.isArchived);
  const epicsToRestore = getRestorableEpics(archivedEpics, storyIds, store.getStories());
  const epicIds = new Set(epicsToRestore.map((e) => e.id));

  const archivedThemes = store.getThemes().filter((t) => t.isArchived);
  const themesToRestore = getRestorableThemes(archivedThemes, epicIds, store.getEpics());

  const total = storiesToRestore.length + epicsToRestore.length + themesToRestore.length;
  if (total === 0) {
    void vscode.window.showInformationMessage(`No items to restore from ${selected.value} and newer.`);
    return false;
  }

  const answer = await vscode.window.showWarningMessage(
    `Restore ${storiesToRestore.length} stories, ${epicsToRestore.length} epics, ${themesToRestore.length} themes from ${selected.value} and newer?`,
    { modal: true },
    "Restore",
  );
  if (answer !== "Restore") return false;

  const storydocsEnabled = isStorydocsEnabled(config);
  const folders = vscode.workspace.workspaceFolders;
  const storydocsRoot = storydocsEnabled && folders ? vscode.Uri.joinPath(folders[0].uri, config.storydocsRoot!).fsPath : undefined;

  getLogger().info(
    `[Restore] storydocsRoot resolution: enabled=${storydocsEnabled}, configRoot=${config.storydocsRoot ?? "(undefined)"}, hasFolders=${!!folders}, resolved=${storydocsRoot ?? "(undefined)"}`,
  );

  await moveFilesFromArchive(storiesToRestore, epicsToRestore, themesToRestore, archiveDevSeg, archiveDocsSeg, storydocsRoot);

  await reloadStore();
  if (storydocsService) {
    void storydocsService.reconcileAll();
  }

  void vscode.window.showInformationMessage(
    `Restored ${storiesToRestore.length} stories, ${epicsToRestore.length} epics, ${themesToRestore.length} themes.`,
  );
  return true;
}

/**
 * Execute restore for a single item (from context menu).
 */
export async function executeRestoreItem(
  store: Store,
  configService: ConfigService,
  itemId: string,
  itemType: "story" | "epic" | "theme",
  reloadStore: () => Promise<void>,
  storydocsService?: StorydocsService,
): Promise<boolean> {
  const config = configService.config;
  const archiveDevSeg = config.archiveSoftDevstories ?? "archive";
  const archiveDocsSeg = config.archiveSoftStorydocs ?? "archive";

  let filePath: string | undefined;
  if (itemType === "story") {
    filePath = store.getStory(itemId)?.filePath;
  } else if (itemType === "epic") {
    filePath = store.getEpic(itemId)?.filePath;
  } else {
    filePath = store.getTheme(itemId)?.filePath;
  }

  if (!filePath) return false;

  const livePath = computeLiveDestination(filePath, archiveDevSeg);
  await ensureParentDir(vscode.Uri.file(livePath));
  await vscode.workspace.fs.rename(vscode.Uri.file(filePath), vscode.Uri.file(livePath), { overwrite: false });

  // Also restore storydocs folder if applicable
  const storydocsEnabled = isStorydocsEnabled(config);
  const folders = vscode.workspace.workspaceFolders;
  getLogger().info(
    `[RestoreItem] storydocsRoot resolution: enabled=${storydocsEnabled}, configRoot=${config.storydocsRoot ?? "(undefined)"}, hasFolders=${!!folders}`,
  );
  if (storydocsEnabled && folders) {
    const storydocsRoot = vscode.Uri.joinPath(folders[0].uri, config.storydocsRoot!).fsPath;
    await restoreStorydocsFolder(itemId, itemType, storydocsRoot, archiveDocsSeg);
  }

  await reloadStore();
  if (storydocsService) {
    void storydocsService.reconcileAll();
  }
  return true;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

async function confirmArchive(plan: ArchivePlan, sprintLabel: string): Promise<boolean> {
  const parts: string[] = [];
  if (plan.storyCount > 0) parts.push(`${plan.storyCount} stories`);
  if (plan.epicCount > 0) parts.push(`${plan.epicCount} epics`);
  if (plan.themeCount > 0) parts.push(`${plan.themeCount} themes`);

  const answer = await vscode.window.showWarningMessage(`Archive ${parts.join(", ")} up to ${sprintLabel}?`, { modal: true }, "Archive");
  return answer === "Archive";
}

async function ensureParentDir(uri: vscode.Uri): Promise<void> {
  const parent = vscode.Uri.joinPath(uri, "..");
  await vscode.workspace.fs.createDirectory(parent);
}

async function moveFilesToArchive(plan: ArchivePlan, archiveDevSeg: string, archiveDocsSeg: string, storydocsRoot?: string): Promise<void> {
  // Move stories first, then epics, then themes
  for (const story of plan.stories) {
    if (!story.filePath) continue;
    const dest = computeArchiveDestination(story.filePath, archiveDevSeg);
    await ensureParentDir(vscode.Uri.file(dest));
    await vscode.workspace.fs.rename(vscode.Uri.file(story.filePath), vscode.Uri.file(dest), { overwrite: false });
    if (storydocsRoot) {
      await archiveStorydocsFolder(story.id, "story", storydocsRoot, archiveDocsSeg);
    }
  }

  for (const epic of plan.epics) {
    if (!epic.filePath) continue;
    const dest = computeArchiveDestination(epic.filePath, archiveDevSeg);
    await ensureParentDir(vscode.Uri.file(dest));
    await vscode.workspace.fs.rename(vscode.Uri.file(epic.filePath), vscode.Uri.file(dest), { overwrite: false });
    if (storydocsRoot) {
      await archiveStorydocsFolder(epic.id, "epic", storydocsRoot, archiveDocsSeg);
    }
  }

  for (const theme of plan.themes) {
    if (!theme.filePath) continue;
    const dest = computeArchiveDestination(theme.filePath, archiveDevSeg);
    await ensureParentDir(vscode.Uri.file(dest));
    await vscode.workspace.fs.rename(vscode.Uri.file(theme.filePath), vscode.Uri.file(dest), { overwrite: false });
    if (storydocsRoot) {
      await archiveStorydocsFolder(theme.id, "theme", storydocsRoot, archiveDocsSeg);
    }
  }
}

async function archiveStorydocsFolder(
  nodeId: string,
  nodeType: "story" | "epic" | "theme",
  storydocsRoot: string,
  archiveDocsSeg: string,
): Promise<void> {
  const typeFolder = nodeType === "story" ? "stories" : nodeType === "epic" ? "epics" : "themes";
  const root = storydocsRoot.replace(/\\/g, "/");
  const sourcePath = `${root}/${typeFolder}/${nodeId}`;
  const sourceUri = vscode.Uri.file(sourcePath);
  getLogger().info(`[Archive] storydocs: stat ${sourcePath}`);
  try {
    await vscode.workspace.fs.stat(sourceUri);
  } catch {
    getLogger().info(`[Archive] storydocs: source not found, skipping ${sourcePath}`);
    return; // Folder doesn't exist, nothing to move
  }
  const destPath = computeStorydocsArchiveDestination(sourcePath, root, archiveDocsSeg);
  getLogger().info(`[Archive] storydocs: moving ${sourcePath} → ${destPath}`);
  try {
    await ensureParentDir(vscode.Uri.file(destPath));
    getLogger().info(`[Archive] storydocs: ensureParentDir done, calling rename`);
    await vscode.workspace.fs.rename(sourceUri, vscode.Uri.file(destPath), { overwrite: false });
    getLogger().info(`[Archive] storydocs: rename succeeded for ${nodeId}`);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code ?? "unknown";
    const msg = err instanceof Error ? err.message : String(err);
    getLogger().error(`[Archive] storydocs rename FAILED (${code}): ${msg}\n  source: ${sourcePath}\n  dest:   ${destPath}`);
    void vscode.window.showWarningMessage(`Archive: failed to move storydocs folder for ${nodeId} (${code}: ${msg})`);
  }
}

async function moveFilesFromArchive(
  stories: { id: string; filePath?: string }[],
  epics: { id: string; filePath?: string }[],
  themes: { id: string; filePath?: string }[],
  archiveDevSeg: string,
  archiveDocsSeg: string,
  storydocsRoot?: string,
): Promise<void> {
  for (const story of stories) {
    if (!story.filePath) continue;
    const dest = computeLiveDestination(story.filePath, archiveDevSeg);
    await ensureParentDir(vscode.Uri.file(dest));
    await vscode.workspace.fs.rename(vscode.Uri.file(story.filePath), vscode.Uri.file(dest), { overwrite: false });
    if (storydocsRoot) {
      await restoreStorydocsFolder(story.id, "story", storydocsRoot, archiveDocsSeg);
    }
  }

  for (const epic of epics) {
    if (!epic.filePath) continue;
    const dest = computeLiveDestination(epic.filePath, archiveDevSeg);
    await ensureParentDir(vscode.Uri.file(dest));
    await vscode.workspace.fs.rename(vscode.Uri.file(epic.filePath), vscode.Uri.file(dest), { overwrite: false });
    if (storydocsRoot) {
      await restoreStorydocsFolder(epic.id, "epic", storydocsRoot, archiveDocsSeg);
    }
  }

  for (const theme of themes) {
    if (!theme.filePath) continue;
    const dest = computeLiveDestination(theme.filePath, archiveDevSeg);
    await ensureParentDir(vscode.Uri.file(dest));
    await vscode.workspace.fs.rename(vscode.Uri.file(theme.filePath), vscode.Uri.file(dest), { overwrite: false });
    if (storydocsRoot) {
      await restoreStorydocsFolder(theme.id, "theme", storydocsRoot, archiveDocsSeg);
    }
  }
}

async function restoreStorydocsFolder(
  nodeId: string,
  nodeType: "story" | "epic" | "theme",
  storydocsRoot: string,
  archiveDocsSeg: string,
): Promise<void> {
  const typeFolder = nodeType === "story" ? "stories" : nodeType === "epic" ? "epics" : "themes";
  const root = storydocsRoot.replace(/\\/g, "/");
  const archivedPath = `${root}/${archiveDocsSeg}/${typeFolder}/${nodeId}`;
  const archivedUri = vscode.Uri.file(archivedPath);
  getLogger().info(`[Archive] storydocs restore: stat ${archivedPath}`);
  try {
    await vscode.workspace.fs.stat(archivedUri);
  } catch {
    getLogger().info(`[Archive] storydocs restore: source not found, skipping ${archivedPath}`);
    return; // Folder doesn't exist in archive, nothing to restore
  }
  const livePath = `${root}/${typeFolder}/${nodeId}`;
  getLogger().info(`[Archive] storydocs restore: moving ${archivedPath} → ${livePath}`);
  try {
    await ensureParentDir(vscode.Uri.file(livePath));
    getLogger().info(`[Archive] storydocs restore: ensureParentDir done, calling rename`);
    await vscode.workspace.fs.rename(archivedUri, vscode.Uri.file(livePath), { overwrite: true });
    getLogger().info(`[Archive] storydocs restore: rename succeeded for ${nodeId}`);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code ?? "unknown";
    const msg = err instanceof Error ? err.message : String(err);
    getLogger().error(`[Archive] storydocs restore rename FAILED (${code}): ${msg}\n  source: ${archivedPath}\n  dest:   ${livePath}`);
    void vscode.window.showWarningMessage(`Archive: failed to restore storydocs folder for ${nodeId} (${code}: ${msg})`);
  }
}
