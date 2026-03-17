/**
 * Pure utility functions for the Browse StoryDocs command.
 * No VS Code dependencies — testable with Vitest.
 */

/** A single entry from a storydocs folder listing. */
export interface StorydocEntry {
  readonly name: string;
  readonly isDirectory: boolean;
}

/** QuickPick item enriched with file-system metadata. */
export interface StorydocPickItem {
  readonly label: string;
  readonly description?: string;
  readonly name: string;
  readonly isDirectory: boolean;
}

/**
 * Build QuickPick items from a flat directory listing.
 *
 * - Folders get a folder icon prefix, files get a file icon prefix.
 * - Sorted alphabetically by name (case-insensitive).
 */
export function buildQuickPickItems(entries: StorydocEntry[]): StorydocPickItem[] {
  return [...entries]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((entry) => ({
      label: entry.isDirectory ? `$(folder) ${entry.name}` : `$(file) ${entry.name}`,
      description: entry.isDirectory ? "folder" : undefined,
      name: entry.name,
      isDirectory: entry.isDirectory,
    }));
}
