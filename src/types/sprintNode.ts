/**
 * SprintNode - Virtual tree node representing a sprint grouping in the Backlog view.
 *
 * Sprint nodes exist only in memory; they are never persisted to disk.
 * The `_kind` discriminant field distinguishes SprintNode from Theme, Epic,
 * Story, and BrokenFile in union type guards.
 */
export interface SprintNode {
  /** Discriminant field — always `'sprintNode'`. */
  readonly _kind: 'sprintNode';
  /** The sprint identifier, e.g. `'sprint-4'` or `'__BACKLOG__'` for the catch-all node. */
  sprintId: string;
  /** Human-readable label shown in the tree view. */
  label: string;
  /** True when this is the catch-all backlog node that collects unassigned / unrecognized stories. */
  isBacklog: boolean;
}

/** Sentinel sprint ID for the catch-all "Backlog" node. */
export const BACKLOG_SPRINT_ID = '__BACKLOG__';

/** Type guard to identify SprintNode in the tree element union. */
export function isSprintNode(element: unknown): element is SprintNode {
  return typeof element === 'object' && element !== null && '_kind' in element && (element as SprintNode)._kind === 'sprintNode';
}
