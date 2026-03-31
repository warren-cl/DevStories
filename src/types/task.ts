export type TaskType = string; // Dynamic from config (initial: code, document, remediate, investigate, plan, validate)
export type TaskStatus = string; // Dynamic from config (same statuses as stories)

export interface Task {
  id: string;
  title: string;
  taskType: TaskType;
  story: string; // Parent story ID — tasks must always belong to a story
  assignedAgent?: string;
  status: TaskStatus;
  dependencies?: string[];
  priority: number; // Default 1, lower = higher priority
  created: Date;
  updated?: Date;
  completedOn?: Date; // Auto-set when status reaches isCompletion, cleared otherwise
  content: string; // The markdown body
  filePath?: string; // Absolute path to the file
  isArchived?: boolean; // Derived from file path — true when in archive directory
}

/**
 * Type guard to identify Task in the tree element union.
 * Tasks are distinguished by having both `taskType` and `story` fields.
 */
export function isTask(element: unknown): element is Task {
  return typeof element === "object" && element !== null && "taskType" in element && "story" in element;
}
