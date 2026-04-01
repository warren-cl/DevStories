import * as vscode from "vscode";
import { Store } from "../core/store";
import { ConfigService } from "../core/configService";
import { ConfigData, parseConfigJsonContent, mergeConfigWithDefaults } from "../core/configServiceUtils";
import { getLogger } from "../core/logger";
import { StorydocsService } from "../core/storydocsService";
import { localToday } from "../utils/dateUtils";
import { parseQuickInput, truncateForTitle, cleanSelectionText, OPEN_STORY_ACTION } from "./quickCaptureUtils";
import { findNextStoryId, generateStoryMarkdown, generateStoryLink, appendStoryToEpic, DEFAULT_TEMPLATES } from "./createStoryUtils";
import { validateStoryTitle } from "../utils/inputValidation";
import { toKebabCase } from "../utils/filenameUtils";

// Re-export for testing
export { parseQuickInput, truncateForTitle, cleanSelectionText, INBOX_EPIC_ID, OPEN_STORY_ACTION } from "./quickCaptureUtils";

/**
 * Read config.json from workspace as fallback when ConfigService is not available
 */
async function readConfigFallback(workspaceUri: vscode.Uri): Promise<ConfigData | undefined> {
  const configUri = vscode.Uri.joinPath(workspaceUri, ".devstories", "config.json");
  try {
    const content = await vscode.workspace.fs.readFile(configUri);
    const parsed = parseConfigJsonContent(Buffer.from(content).toString("utf8"));
    return mergeConfigWithDefaults(parsed);
  } catch (error) {
    getLogger().debug("Config not found or unreadable", error);
    return undefined;
  }
}

/**
 * Generate inbox epic markdown content
 */
function generateInboxEpicMarkdown(prefix: string): string {
  const today = localToday();
  return `---
id: ${prefix}-INBOX
title: "Inbox"
status: active
sprint: ""
created: ${today}
updated: ${today}
---

# Inbox

Quick captures and ideas to triage later.

## Stories
`;
}

/**
 * Ensure inbox epic exists, create if missing
 * Returns the epic ID (e.g., EPIC-INBOX)
 */
async function ensureInboxEpic(workspaceUri: vscode.Uri, config: ConfigData, store: Store): Promise<{ id: string; uri: vscode.Uri }> {
  const inboxId = `${config.epicPrefix}-INBOX`;

  // Check store first — handles existing files regardless of filename suffix
  const existing = store.getEpic(inboxId);
  if (existing?.filePath) {
    return { id: inboxId, uri: vscode.Uri.file(existing.filePath) };
  }

  // Not in store — create it
  getLogger().debug("Creating inbox epic");
  const markdown = generateInboxEpicMarkdown(config.epicPrefix);
  const epicUri = vscode.Uri.joinPath(workspaceUri, ".devstories", "epics", `${inboxId}-inbox.md`);
  await vscode.workspace.fs.writeFile(epicUri, Buffer.from(markdown));
  await store.reloadFile(epicUri);
  return { id: inboxId, uri: epicUri };
}

/**
 * Get selected text from active editor, cleaned for title use
 */
function getSelectedText(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    return undefined;
  }

  const text = editor.document.getText(selection);
  if (!text.trim()) {
    return undefined;
  }

  return truncateForTitle(cleanSelectionText(text));
}

/**
 * Execute the quickCapture command
 * Returns true if story was created, false otherwise
 */
export async function executeQuickCapture(
  store: Store,
  storydocsService?: StorydocsService,
  configService?: ConfigService,
): Promise<boolean> {
  // Check for workspace
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    void vscode.window.showErrorMessage("DevStories: No workspace folder open");
    return false;
  }

  const workspaceUri = workspaceFolders[0].uri;

  // Use ConfigService if available, otherwise read from file
  const config = configService ? configService.config : await readConfigFallback(workspaceUri);
  if (!config) {
    const action = await vscode.window.showErrorMessage("DevStories: No config.json found. Initialize DevStories first.", "Initialize");
    if (action === "Initialize") {
      void vscode.commands.executeCommand("devstories.init");
    }
    return false;
  }

  // Get prefilled value from selection (if any)
  const prefillValue = getSelectedText() || "";

  const storyTypeKeys = Object.keys(config.storyTypes);

  // Show input box with validation
  const rawInput = await vscode.window.showInputBox({
    prompt: "Quick capture (prefix with type key and colon, e.g., bug: | pipe: for notes)",
    placeHolder: "e.g., bug: Fix login | users report 500",
    value: prefillValue,
    valueSelection: prefillValue ? [0, prefillValue.length] : undefined,
    validateInput: (value) => {
      if (!value || !value.trim()) {
        return "Title is required";
      }
      // Parse to extract title, then validate
      const parsed = parseQuickInput(value, storyTypeKeys);
      const validation = validateStoryTitle(parsed.title);
      return validation.valid ? undefined : validation.error;
    },
  });

  if (!rawInput || !rawInput.trim()) {
    return false;
  }

  // Parse input
  const parsed = parseQuickInput(rawInput, storyTypeKeys);

  // Ensure inbox epic exists
  const { id: inboxEpicId, uri: inboxEpicUri } = await ensureInboxEpic(workspaceUri, config, store);

  // Generate story ID — scan disk + store to guard against watcher race conditions
  const storyFilePattern = new vscode.RelativePattern(workspaceUri, `.devstories/stories/${config.storyPrefix}-*.md`);
  const storyFiles = await vscode.workspace.findFiles(storyFilePattern);
  const diskIds = storyFiles
    .map((uri) => {
      const filename = uri.path.split("/").pop() ?? "";
      const match = filename.match(new RegExp(`^(${config.storyPrefix}-\\d+)`));
      return match ? match[1] : null;
    })
    .filter((id): id is string => id !== null);
  const allExistingIds = [...new Set([...diskIds, ...store.getStories().map((s) => s.id)])];
  const nextNum = findNextStoryId(allExistingIds, config.storyPrefix);
  const storyId = `${config.storyPrefix}-${String(nextNum).padStart(5, "0")}`;

  // Determine sprint based on config option (default: backlog for inbox workflow)
  const sprint = config.quickCaptureDefaultToCurrentSprint && config.currentSprint ? config.currentSprint : "backlog";

  // Get template and add notes if provided
  let template = DEFAULT_TEMPLATES[parsed.type] ?? DEFAULT_TEMPLATES.task ?? "";
  if (parsed.notes) {
    // Prepend notes to template
    template = `## Notes\n${parsed.notes}\n\n${template}`;
  }

  // Generate markdown - use middle size for quick capture
  const middleSize = config.sizes[Math.floor(config.sizes.length / 2)];
  const markdown = generateStoryMarkdown(
    {
      id: storyId,
      title: parsed.title,
      type: parsed.type,
      epic: inboxEpicId,
      sprint,
      size: middleSize,
    },
    template,
  );

  // Write story file
  const storyUri = vscode.Uri.joinPath(workspaceUri, ".devstories", "stories", `${storyId}-${toKebabCase(parsed.title)}.md`);

  await vscode.workspace.fs.writeFile(storyUri, Buffer.from(markdown));
  await store.reloadFile(storyUri);

  // Create storydocs folder (best-effort, non-blocking)
  void storydocsService?.ensureFolder(storyId, "story");

  // Auto-link to inbox epic
  try {
    const epicContent = Buffer.from(await vscode.workspace.fs.readFile(inboxEpicUri)).toString("utf8");
    const storyLink = generateStoryLink(storyId, parsed.title);
    const updatedEpic = appendStoryToEpic(epicContent, storyLink);
    await vscode.workspace.fs.writeFile(inboxEpicUri, Buffer.from(updatedEpic));
  } catch {
    // Non-critical: epic auto-link failed
    getLogger().warn("Failed to auto-link story to inbox epic");
  }

  // Show notification with "Open Story" action button
  // Non-blocking: user can dismiss or click later without interrupting workflow
  void vscode.window.showInformationMessage(`Created ${storyId}: ${parsed.title}`, OPEN_STORY_ACTION).then(async (action) => {
    if (action === OPEN_STORY_ACTION) {
      const doc = await vscode.workspace.openTextDocument(storyUri);
      await vscode.window.showTextDocument(doc);
    }
  });

  return true;
}
