/**
 * Pure utility functions for StoryDocs — no VS Code dependencies.
 * Computes folder paths for the flat, type-based storydocs folder structure.
 *
 * Folder layout mirrors .devstories/:
 *   storydocs/themes/THEME-ID/
 *   storydocs/epics/EPIC-ID/
 *   storydocs/stories/DS-ID/
 */

import * as path from "path";
import { ConfigData } from "./configServiceUtils";

/** Type subfolder names — lowercase plural, mirroring .devstories/ layout. */
export const TYPE_FOLDERS: Record<NodeType, string> = {
  theme: "themes",
  epic: "epics",
  story: "stories",
};

/**
 * Check whether the storydocs feature is enabled and properly configured.
 */
export function isStorydocsEnabled(config: ConfigData): boolean {
  return config.storydocsEnabled === true && typeof config.storydocsRoot === "string" && config.storydocsRoot.length > 0;
}

export type NodeType = "theme" | "epic" | "story";

/**
 * Compute the absolute folder path for a theme's storydocs folder.
 */
export function computeThemeFolderPath(root: string, themeId: string): string {
  return path.join(root, TYPE_FOLDERS.theme, themeId);
}

/**
 * Compute the absolute folder path for an epic's storydocs folder.
 */
export function computeEpicFolderPath(root: string, epicId: string): string {
  return path.join(root, TYPE_FOLDERS.epic, epicId);
}

/**
 * Compute the absolute folder path for a story's storydocs folder.
 */
export function computeStoryFolderPath(root: string, storyId: string): string {
  return path.join(root, TYPE_FOLDERS.story, storyId);
}

/**
 * Compute the storydocs folder path for any node type.
 */
export function computeNodeFolderPath(root: string, nodeId: string, nodeType: NodeType): string {
  return path.join(root, TYPE_FOLDERS[nodeType], nodeId);
}
