export type ThemeStatus = string;

export interface Theme {
  id: string;
  title: string;
  status: ThemeStatus;
  priority: number; // Default 500, lower = higher priority
  created: Date;
  updated?: Date;
  workflow?: string;
  author?: string;
  owner?: string;
  content: string;
  filePath?: string;
  isArchived?: boolean; // Derived from file path — true when in archive directory
}
