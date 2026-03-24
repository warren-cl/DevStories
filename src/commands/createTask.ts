/**
 * Create Task command — wizard-based task creation inside a story's storydocs folder.
 *
 * Wizard flow:
 *   1. Story selection (pre-selected from context menu, or QuickPick)
 *   2. Title (InputBox with validation)
 *   3. Task type (QuickPick from config taskTypes keys)
 *   4. Agent (QuickPick from .github/agents/*.md)
 *   5. File write + store reload + open in editor
 *
 * Requires storydocs to be enabled. Task files live at:
 *   {storydocsRoot}/stories/{STORY-ID}/tasks/{TASK-ID}-{slug}.md
 */

import * as vscode from "vscode";
import { Store } from "../core/store";
import { ConfigService } from "../core/configService";
import { isStorydocsEnabled } from "../core/storydocsUtils";
import { StorydocsService } from "../core/storydocsService";
import { getLogger } from "../core/logger";
import { validateStoryTitle } from "../utils/inputValidation";
import {
  findNextTaskId,
  buildTaskId,
  buildTaskFilePath,
  generateTaskMarkdown,
  parseAgentFile,
  AgentInfo,
  DEFAULT_TASK_TEMPLATE,
} from "./createTaskUtils";

/**
 * Discover agents by scanning .github/agents/*.md in the workspace.
 * Returns a sorted list of AgentInfo. Returns empty array if folder doesn't exist.
 */
async function discoverAgents(workspaceUri: vscode.Uri): Promise<AgentInfo[]> {
  const agentsUri = vscode.Uri.joinPath(workspaceUri, ".github", "agents");
  const agents: AgentInfo[] = [];

  try {
    const entries = await vscode.workspace.fs.readDirectory(agentsUri);
    for (const [filename, fileType] of entries) {
      if (fileType === vscode.FileType.File && filename.endsWith(".md")) {
        const fileUri = vscode.Uri.joinPath(agentsUri, filename);
        const content = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString("utf8");
        agents.push(parseAgentFile(fileUri.fsPath, content));
      }
    }
  } catch {
    // Folder doesn't exist or not readable — no agents available
    getLogger().debug("No .github/agents/ folder found");
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Collect existing task IDs for a given story by scanning its tasks folder on disk.
 * Combines disk-based filenames with store IDs for accuracy.
 */
async function collectExistingTaskIds(
  storydocsRoot: string,
  storyId: string,
  taskPrefix: string,
  store: Store,
): Promise<string[]> {
  const tasksGlob = new vscode.RelativePattern(
    vscode.Uri.file(storydocsRoot),
    `stories/${storyId}/tasks/${taskPrefix}-*.md`,
  );
  const diskFiles = await vscode.workspace.findFiles(tasksGlob);
  const diskIds = diskFiles
    .map((uri) => {
      const filename = uri.path.split("/").pop() ?? "";
      const match = filename.match(new RegExp(`^(${taskPrefix}-\\d+)`));
      return match ? match[1] : null;
    })
    .filter((id): id is string => id !== null);

  const storeIds = store.getTasksByStory(storyId).map((t) => t.id);

  return [...new Set([...diskIds, ...storeIds])];
}

/**
 * Load a task type template from the template root or fall back to default.
 */
async function loadTaskTemplate(
  workspaceUri: vscode.Uri,
  templateRoot: string | undefined,
  templateFilename: string,
): Promise<string> {
  const baseUri = templateRoot
    ? vscode.Uri.joinPath(workspaceUri, templateRoot)
    : vscode.Uri.joinPath(workspaceUri, ".devstories", "templates");

  const templateUri = vscode.Uri.joinPath(baseUri, templateFilename);
  try {
    const content = Buffer.from(await vscode.workspace.fs.readFile(templateUri)).toString("utf8");
    // Strip frontmatter if present — we only want the body
    const matter = require("gray-matter");
    return matter(content).content.trim();
  } catch {
    getLogger().debug(`Task template ${templateFilename} not found, using default`);
    return DEFAULT_TASK_TEMPLATE;
  }
}

/**
 * Execute the createTask command.
 * @param store - The story store
 * @param preselectedStoryId - Story ID when invoked from context menu on a story node
 * @param storydocsService - StorydocsService for ensuring task folder exists
 * @param configService - ConfigService for reading config
 */
export async function executeCreateTask(
  store: Store,
  preselectedStoryId?: string,
  storydocsService?: StorydocsService,
  configService?: ConfigService,
): Promise<boolean> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    void vscode.window.showErrorMessage("DevStories: No workspace folder open");
    return false;
  }

  const workspaceUri = workspaceFolders[0].uri;
  const config = configService?.config;

  if (!config || !isStorydocsEnabled(config)) {
    void vscode.window.showErrorMessage(
      "DevStories: Tasks require storydocs to be enabled. Set storydocs.enabled = true in config.json.",
    );
    return false;
  }

  const storydocsRoot = config.storydocsRoot!;
  const absoluteStorydocsRoot = vscode.Uri.joinPath(workspaceUri, storydocsRoot).fsPath;
  const taskPrefix = config.taskPrefix;
  const taskTypes = config.taskTypes;
  const statuses = config.statuses;

  // ─── Step 1: Story selection ──────────────────────────────────────────────

  let selectedStoryId: string;

  if (preselectedStoryId) {
    const story = store.getStory(preselectedStoryId);
    if (!story) {
      void vscode.window.showErrorMessage(`DevStories: Story '${preselectedStoryId}' not found.`);
      return false;
    }
    selectedStoryId = preselectedStoryId;
  } else {
    const stories = store.getStories();
    if (stories.length === 0) {
      void vscode.window.showWarningMessage("DevStories: No stories found. Create a story first.");
      return false;
    }

    const storyItems = stories.map((s) => ({
      label: `[${s.id}] ${s.title}`,
      description: s.status,
      id: s.id,
    }));

    const picked = await vscode.window.showQuickPick(storyItems, {
      placeHolder: "Select a story for this task",
      title: "Create Task — Step 1: Story",
    });
    if (!picked) {
      return false;
    }
    selectedStoryId = picked.id;
  }

  // ─── Step 2: Title ────────────────────────────────────────────────────────

  const title = await vscode.window.showInputBox({
    prompt: "Task title",
    title: "Create Task — Step 2: Title",
    validateInput: (value) => {
      const validation = validateStoryTitle(value);
      return validation.valid ? undefined : validation.error;
    },
  });
  if (!title) {
    return false;
  }

  // ─── Step 3: Task type ────────────────────────────────────────────────────

  const typeKeys = Object.keys(taskTypes);
  if (typeKeys.length === 0) {
    void vscode.window.showErrorMessage("DevStories: No task types configured in config.json.");
    return false;
  }

  const typeItems = typeKeys.map((key) => ({
    label: key,
    description: taskTypes[key],
    value: key,
  }));

  const pickedType = await vscode.window.showQuickPick(typeItems, {
    placeHolder: "Select task type",
    title: "Create Task — Step 3: Type",
  });
  if (!pickedType) {
    return false;
  }

  // ─── Step 4: Agent ────────────────────────────────────────────────────────

  const agents = await discoverAgents(workspaceUri);
  let selectedAgent: string | undefined;

  if (agents.length > 0) {
    const agentItems: vscode.QuickPickItem[] = [
      { label: "(none)", description: "No agent assigned" },
      ...agents.map((a) => ({ label: a.name, description: a.filePath })),
    ];

    const pickedAgent = await vscode.window.showQuickPick(agentItems, {
      placeHolder: "Assign an agent (optional)",
      title: "Create Task — Step 4: Agent",
    });
    if (!pickedAgent) {
      return false;
    }
    if (pickedAgent.label !== "(none)") {
      selectedAgent = pickedAgent.label;
    }
  }

  // ─── Generate and write ──────────────────────────────────────────────────

  const existingIds = await collectExistingTaskIds(absoluteStorydocsRoot, selectedStoryId, taskPrefix, store);
  const nextNum = findNextTaskId(existingIds, taskPrefix);
  const taskId = buildTaskId(taskPrefix, nextNum);

  // Load template for the selected task type
  const templateFilename = taskTypes[pickedType.value];
  const template = await loadTaskTemplate(workspaceUri, config.templateRoot, templateFilename);

  const firstStatus = statuses.length > 0 ? statuses[0].id : "todo";

  const markdown = generateTaskMarkdown(
    {
      id: taskId,
      title,
      taskType: pickedType.value,
      story: selectedStoryId,
      assignedAgent: selectedAgent,
      status: firstStatus,
    },
    template,
  );

  const filePath = buildTaskFilePath(absoluteStorydocsRoot, selectedStoryId, taskId, title);
  const fileUri = vscode.Uri.file(filePath);

  // Ensure the tasks folder exists
  void storydocsService?.ensureTaskFolder(selectedStoryId);

  try {
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(markdown, "utf8"));
    getLogger().info(`Created task ${taskId} at ${filePath}`);
  } catch (err) {
    void vscode.window.showErrorMessage(`DevStories: Failed to create task file: ${err}`);
    return false;
  }

  // Reload so store picks it up immediately (avoids watcher race on Windows)
  void store.reloadFile(fileUri);

  // Open the new task in the editor
  const doc = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(doc);

  return true;
}
