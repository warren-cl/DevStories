import * as path from 'path';

/**
 * Regex pattern to match [[ID]] link syntax
 * Matches: [[PREFIX-NUMBER]] where PREFIX is uppercase letters and NUMBER is digits
 * Also matches EPIC-INBOX special case
 */
export const LINK_PATTERN = /\[\[([A-Z]+-(?:\d+|INBOX))\]\]/g;

/**
 * Regex pattern to match bare ID (without brackets) in frontmatter
 * Matches: PREFIX-NUMBER where PREFIX is uppercase letters and NUMBER is digits
 * Also matches EPIC-INBOX special case
 * Uses word boundaries to avoid matching partial IDs like DS-001X
 */
export const BARE_ID_PATTERN = /\b([A-Z]+-(?:\d+|INBOX))\b/g;

/**
 * Extract all [[ID]] links from text
 * Returns array of IDs (without brackets)
 */
export function extractLinks(text: string): string[] {
  const matches = [...text.matchAll(LINK_PATTERN)];
  return matches.map(match => match[1]);
}

/**
 * Check if an ID is a theme ID (THEME prefix)
 */
export function isThemeId(id: string): boolean {
  return id.startsWith('THEME-');
}

/**
 * Check if an ID is a story ID (not EPIC or THEME prefix)
 */
export function isStoryId(id: string): boolean {
  return !id.startsWith('EPIC-') && !id.startsWith('THEME-');
}

/**
 * Check if an ID is an epic ID (EPIC prefix)
 */
export function isEpicId(id: string): boolean {
  return id.startsWith('EPIC-');
}

/**
 * Get the type of ID (theme, epic or story)
 */
export function getIdType(id: string): 'theme' | 'epic' | 'story' {
  if (isThemeId(id)) { return 'theme'; }
  return isEpicId(id) ? 'epic' : 'story';
}

/**
 * Resolve an ID to its file path
 * @param id The story, epic, or theme ID
 * @param basePath The .devstories directory path
 * @returns Absolute path to the markdown file
 */
export function resolveLinkPath(id: string, basePath: string): string {
  let folder: string;
  if (isThemeId(id)) {
    folder = 'themes';
  } else if (isEpicId(id)) {
    folder = 'epics';
  } else {
    folder = 'stories';
  }
  return path.join(basePath, folder, `${id}.md`);
}

/**
 * Validate links against known IDs
 * @param links Array of IDs to validate
 * @param knownIds Set of valid IDs
 * @returns Array of broken (invalid) IDs
 */
export function validateLinks(links: string[], knownIds: Set<string>): string[] {
  return links.filter(id => !knownIds.has(id));
}
