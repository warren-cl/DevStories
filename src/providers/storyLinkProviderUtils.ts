import { LINK_PATTERN } from '../utils/linkResolver';

/**
 * Represents a link match with position info
 */
export interface LinkMatch {
  id: string;
  start: number;
  end: number;
}

/**
 * Represents a resolved document link with target path
 */
export interface ResolvedLink {
  id: string;
  start: number;
  end: number;
  targetPath: string;
}

/**
 * Find all [[ID]] links in document text
 * Returns array of matches with position info
 */
export function findLinksInDocument(text: string): LinkMatch[] {
  const matches: LinkMatch[] = [];
  // Create new regex instance to reset lastIndex
  const regex = new RegExp(LINK_PATTERN.source, 'g');

  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      id: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return matches;
}

/**
 * Create a resolved document link from a match.
 * @param resolveFilePath - Callback that returns the absolute file path for an ID,
 *   or undefined if the ID is unknown (broken link).
 */
export function createDocumentLink(
  match: LinkMatch,
  resolveFilePath: (id: string) => string | undefined
): ResolvedLink | null {
  const targetPath = resolveFilePath(match.id);
  if (!targetPath) {
    return null;
  }

  return {
    id: match.id,
    start: match.start,
    end: match.end,
    targetPath,
  };
}
