export type EpicStatus = string;

export interface Epic {
  id: string;
  title: string;
  status: EpicStatus;
  theme?: string;
  priority: number; // Default 500, lower = higher priority
  created: Date;
  updated?: Date;
  content: string;
  filePath?: string;
}
