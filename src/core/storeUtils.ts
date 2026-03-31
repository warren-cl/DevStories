/**
 * Pure utility functions for Store — no VS Code dependencies.
 * These can be unit tested with Vitest.
 */

/**
 * Check whether a file path is inside an archive directory.
 * Matches the segment as an exact directory name (not a substring of another folder name).
 * Handles both forward slashes and backslashes.
 */
export function isArchivedPath(fsPath: string, archiveSegment: string): boolean {
  if (!fsPath) {
    return false;
  }
  // Normalize to forward slashes for consistent matching
  const normalized = fsPath.replace(/\\/g, "/");
  return normalized.includes(`/${archiveSegment}/`);
}
