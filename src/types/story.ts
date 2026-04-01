export type StoryType = string; // Defined in config.json storyTypes
export type StoryStatus = string; // Defined in config
export type StorySize = string; // Defined in config (default: XS, S, M, L, XL)

/**
 * Configuration for a single story type (from config.json storyTypes)
 */
export interface StoryTypeConfig {
  /** Template filename (with .template.md suffix) for this story type */
  template: string;
  /** Human-readable description shown in QuickPick and hover */
  description: string;
  /** VS Code codicon name for tree view (e.g., "lightbulb", "bug") */
  icon: string;
  /** Emoji for hover cards (e.g., "✨", "🐛") */
  emoji: string;
}

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
  isArchived?: boolean; // Derived from file path — true when in archive directory
}
