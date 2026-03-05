export type StoryType = 'feature' | 'bug' | 'task' | 'chore' | 'spike';
export type StoryStatus = string; // Defined in config
export type StorySize = string; // Defined in config (default: XS, S, M, L, XL)

export interface Story {
  id: string;
  title: string;
  type: StoryType;
  epic: string;
  status: StoryStatus;
  sprint?: string;
  size: StorySize;
  priority: number; // Default 500, lower = higher priority
  assignee?: string;
  dependencies?: string[];
  created: Date;
  updated?: Date;
  completedOn?: Date; // Auto-set when status becomes isCompletion, cleared otherwise
  workflow?: string;
  author?: string;
  owner?: string;
  content: string; // The markdown body
  filePath?: string; // Path to the file
}
