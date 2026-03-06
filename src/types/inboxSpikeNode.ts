/**
 * InboxSpikeNode — Virtual sentinel tree node representing the Inbox or Spikes folder.
 * InboxSpikeFile — Leaf tree node representing a single file in inbox/ or spikes/.
 *
 * Both use the `_kind` discriminant field to distinguish from Theme, Epic,
 * Story, BrokenFile, and SprintNode in union type guards.
 */

/** Sentinel ID for the Inbox container node. */
export const INBOX_NODE_ID = '__INBOX__';

/** Sentinel ID for the Spikes container node. */
export const SPIKES_NODE_ID = '__SPIKES__';

/** Folder type discriminant for inbox vs spikes. */
export type InboxSpikeFolderType = 'inbox' | 'spikes';

/**
 * Virtual container node shown at root level in both Breakdown and Backlog views.
 * Groups all .md files in the corresponding .devstories/ subfolder.
 */
export interface InboxSpikeNode {
  /** Discriminant field — always `'inboxSpikeNode'`. */
  readonly _kind: 'inboxSpikeNode';
  /** Sentinel identifier: `'__INBOX__'` or `'__SPIKES__'`. */
  nodeId: string;
  /** Human-readable label shown in the tree view. */
  label: string;
  /** Which subfolder this sentinel represents. */
  folderName: InboxSpikeFolderType;
}

/**
 * Leaf node representing a single .md file inside .devstories/inbox/ or .devstories/spikes/.
 * These files have YYYY-MM-DD prefixed filenames and may contain partial frontmatter.
 */
export interface InboxSpikeFile {
  /** Discriminant field — always `'inboxSpikeFile'`. */
  readonly _kind: 'inboxSpikeFile';
  /** Display name: filename without the .md extension. */
  fileName: string;
  /** Absolute path to the file on disk. */
  filePath: string;
  /** Which subfolder this file belongs to. */
  folderType: InboxSpikeFolderType;
}

/** Type guard to identify InboxSpikeNode in the tree element union. */
export function isInboxSpikeNode(element: unknown): element is InboxSpikeNode {
  return (
    typeof element === 'object' &&
    element !== null &&
    '_kind' in element &&
    (element as InboxSpikeNode)._kind === 'inboxSpikeNode'
  );
}

/** Type guard to identify InboxSpikeFile in the tree element union. */
export function isInboxSpikeFile(element: unknown): element is InboxSpikeFile {
  return (
    typeof element === 'object' &&
    element !== null &&
    '_kind' in element &&
    (element as InboxSpikeFile)._kind === 'inboxSpikeFile'
  );
}
