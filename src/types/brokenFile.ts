/**
 * Represents a .devstories file that failed to parse.
 * Broken files are surfaced in the tree view under the appropriate
 * orphan sentinel node so the user can find and fix them.
 */
export interface BrokenFile {
  /** Literal discriminant — distinguishes BrokenFile from Theme | Epic | Story in all type guards. */
  broken: true;
  /**
   * Derived from the filename (e.g. `STORY-001.md` → `STORY-001`) since the
   * frontmatter could not be parsed reliably.
   */
  id: string;
  /** Absolute path to the file on disk. */
  filePath: string;
  /** The error message thrown by the parser. */
  error: string;
  /** Whether this was a story, epic, or theme file, used to route it to the correct sentinel. */
  fileType: 'story' | 'epic' | 'theme';
}
