export type ThemeStatus = string;

export interface Theme {
  id: string;
  title: string;
  status: ThemeStatus;
  priority: number; // Default 500, lower = higher priority
  created: Date;
  updated?: Date;
  content: string;
  filePath?: string;
}
