/**
 * Pure utility functions for FrontmatterCompletionProvider - no VS Code dependencies
 * These can be unit tested with Vitest
 */

import { StatusDef } from "../core/configServiceUtils";
import { StorySize, StoryTypeConfig } from "../types/story";

/**
 * Completion data returned by utility functions
 * Converted to VS Code CompletionItem in the provider
 */
export interface CompletionData {
  value: string;
  detail?: string;
}

/**
 * Enum fields that support autocomplete
 */
const ENUM_FIELDS = ["status", "type", "size", "sprint"];

/**
 * Size descriptions for display
 */
const SIZE_DESCRIPTIONS: Record<string, string> = {
  XXS: "Extra Extra Small",
  XS: "Extra Small",
  S: "Small",
  M: "Medium",
  L: "Large",
  XL: "Extra Large",
  XXL: "Extra Extra Large",
};

/**
 * Detect which enum field the cursor is on (if any)
 * @param line The current line text
 * @param charPos The cursor's character position in the line
 * @returns The field name if on an enum field after colon, null otherwise
 */
export function detectFieldAtCursor(line: string, charPos: number): string | null {
  // Empty line
  if (!line.trim()) {
    return null;
  }

  // Find colon position
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }

  // Cursor must be after the colon
  if (charPos <= colonIndex) {
    return null;
  }

  // Extract field name (before colon, trimmed)
  const fieldPart = line.substring(0, colonIndex).trim();

  // Check if it's an enum field
  if (ENUM_FIELDS.includes(fieldPart)) {
    return fieldPart;
  }

  return null;
}

/**
 * Generate completion items for status field
 * @param statuses Status definitions from config
 * @returns Completion data array
 */
export function getStatusCompletions(statuses: StatusDef[]): CompletionData[] {
  return statuses.map((status) => ({
    value: status.id,
    detail: status.label,
  }));
}

/**
 * Generate completion items for type field
 * @param storyTypes Story type configuration from config
 * @returns Completion data array from config storyTypes
 */
export function getTypeCompletions(storyTypes: Record<string, StoryTypeConfig>): CompletionData[] {
  return Object.entries(storyTypes).map(([key, config]) => ({
    value: key,
    detail: config.description,
  }));
}

/**
 * Generate completion items for size field
 * @param sizes Size values from config
 * @returns Completion data array
 */
export function getSizeCompletions(sizes: StorySize[]): CompletionData[] {
  return sizes.map((size) => ({
    value: size,
    detail: SIZE_DESCRIPTIONS[size],
  }));
}

/**
 * Generate completion items for sprint field
 * @param sprints Sprint sequence from config
 * @returns Completion data array
 */
export function getSprintCompletions(sprints: string[]): CompletionData[] {
  return sprints.map((sprint) => ({
    value: sprint,
  }));
}

/**
 * Detect if cursor is on theme: field after the colon
 * @param line The current line text
 * @param charPos The cursor's character position in the line
 * @returns true if on theme field after colon
 */
export function detectThemeField(line: string, charPos: number): boolean {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1 || charPos <= colonIndex) {
    return false;
  }
  const fieldPart = line.substring(0, colonIndex).trim();
  return fieldPart === "theme";
}

/**
 * Detect if cursor is on epic: field after the colon
 * @param line The current line text
 * @param charPos The cursor's character position in the line
 * @returns true if on epic field after colon
 */
export function detectEpicField(line: string, charPos: number): boolean {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1 || charPos <= colonIndex) {
    return false;
  }
  const fieldPart = line.substring(0, colonIndex).trim();
  return fieldPart === "epic";
}

/**
 * Detect if cursor is in a YAML array item under dependencies:
 * @param lines All lines of the document
 * @param lineNum The current line number (0-indexed)
 * @param charPos The cursor's character position (not used but kept for consistency)
 * @returns true if in dependencies array context
 */
export function detectDependencyContext(lines: string[], lineNum: number, _charPos: number): boolean {
  const currentLine = lines[lineNum];

  // Must be an array item line (starts with whitespace and -)
  if (!currentLine.match(/^\s+-/)) {
    return false;
  }

  // Check if we're inside frontmatter
  let inFrontmatter = false;
  let frontmatterStart = -1;
  for (let i = 0; i <= lineNum; i++) {
    if (lines[i].trim() === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
        frontmatterStart = i;
      } else {
        // Second --- before our line means we're outside frontmatter
        if (i < lineNum) {
          return false;
        }
      }
    }
  }

  if (!inFrontmatter || frontmatterStart === -1) {
    return false;
  }

  // Look backwards to find the parent field
  for (let i = lineNum - 1; i >= frontmatterStart; i--) {
    const prevLine = lines[i];
    // If we hit a non-indented line with a colon, that's the parent field
    if (prevLine.match(/^[a-z_]+:/i)) {
      const fieldName = prevLine.split(":")[0].trim();
      return fieldName === "dependencies";
    }
    // If we hit another array item, continue looking back
    if (prevLine.match(/^\s+-/)) {
      continue;
    }
  }

  return false;
}

/**
 * Detect if cursor is inside a [[ link pattern
 * @param line The current line text
 * @param charPos The cursor's character position in the line
 * @returns true if inside [[ but not after ]]
 */
export function detectLinkTrigger(line: string, charPos: number): boolean {
  if (!line || charPos <= 0) {
    return false;
  }

  const textBefore = line.substring(0, charPos);

  // Find last [[ before cursor
  const lastOpenBracket = textBefore.lastIndexOf("[[");
  if (lastOpenBracket === -1) {
    return false;
  }

  // Check if there's a ]] after the [[ but before cursor
  const textAfterOpen = textBefore.substring(lastOpenBracket);
  if (textAfterOpen.includes("]]")) {
    return false;
  }

  return true;
}

/**
 * Simple Epic type for completions (only need id and title)
 */
interface EpicLike {
  id: string;
  title: string;
}

/**
 * Simple Story type for completions (only need id and title)
 */
interface StoryLike {
  id: string;
  title: string;
}

/**
 * Generate completion items for theme field
 * @param themes Theme objects with id and title
 * @returns Completion data array
 */
export function getThemeCompletions(themes: EpicLike[]): CompletionData[] {
  return themes.map((theme) => ({
    value: theme.id,
    detail: theme.title,
  }));
}

/**
 * Generate completion items for epic field
 * Always includes EPIC-INBOX as a valid option
 * @param epics Epic objects with id and title
 * @returns Completion data array
 */
export function getEpicCompletions(epics: EpicLike[]): CompletionData[] {
  const completions: CompletionData[] = [{ value: "EPIC-INBOX", detail: "Inbox for uncategorized stories" }];

  for (const epic of epics) {
    completions.push({
      value: epic.id,
      detail: epic.title,
    });
  }

  return completions;
}

/**
 * Generate completion items for story references (dependencies)
 * @param stories Story objects with id and title
 * @returns Completion data array
 */
export function getStoryCompletions(stories: StoryLike[]): CompletionData[] {
  return stories.map((story) => ({
    value: story.id,
    detail: story.title,
  }));
}

/**
 * Generate completion items for [[ID]] links (stories, epics, and themes)
 * @param stories Story objects with id and title
 * @param epics Epic objects with id and title
 * @param themes Theme objects with id and title
 * @returns Completion data array
 */
export function getAllIdCompletions(stories: StoryLike[], epics: EpicLike[], themes: EpicLike[] = []): CompletionData[] {
  const themeCompletions = getThemeCompletions(themes);
  const epicCompletions = getEpicCompletions(epics);
  const storyCompletions = getStoryCompletions(stories);
  return [...themeCompletions, ...epicCompletions, ...storyCompletions];
}
