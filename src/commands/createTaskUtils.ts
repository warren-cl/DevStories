/**
 * Pure utility functions for createTask command - no VS Code dependencies.
 * These can be unit tested with Vitest.
 */

import * as path from "path";
import { substituteTemplateVariables } from "./templateUtils";
import { localToday } from "../utils/dateUtils";
import { toKebabCase } from "../utils/filenameUtils";

const matter = require("gray-matter");

export interface TaskData {
  id: string;
  title: string;
  taskType: string;
  story: string;
  assignedAgent?: string;
  status: string;
  priority?: number;
}

export interface AgentInfo {
  name: string;
  filePath: string;
}

/**
 * Find the next sequential task ID number.
 * Returns the number only (e.g., 4), not the full ID.
 */
export function findNextTaskId(existingIds: string[], prefix: string): number {
  const regex = new RegExp(`^${prefix}-(\\d+)$`);
  let maxNum = 0;

  for (const id of existingIds) {
    const match = id.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }

  return maxNum + 1;
}

/**
 * Build the full task ID with zero-padded number.
 * e.g. prefix="TASK", num=4 → "TASK-004"
 */
export function buildTaskId(prefix: string, num: number): string {
  return `${prefix}-${String(num).padStart(3, "0")}`;
}

/**
 * Build the file path for a new task file.
 * Layout: {storydocsRoot}/stories/{storyId}/tasks/{TASK-ID}-{slug}.md
 */
export function buildTaskFilePath(
  storydocsRoot: string,
  storyId: string,
  taskId: string,
  title: string,
): string {
  const slug = toKebabCase(title);
  const fileName = slug ? `${taskId}-${slug}.md` : `${taskId}.md`;
  return path.join(storydocsRoot, "stories", storyId, "tasks", fileName);
}

/**
 * Generate task markdown content from TaskData.
 * Substitutes template variables: {{DATE}}, {{TITLE}}, {{ID}}
 */
export function generateTaskMarkdown(data: TaskData, template: string): string {
  const today = localToday();
  const escapedTitle = data.title.replace(/"/g, '\\"');

  const processedTemplate = substituteTemplateVariables(template, {
    date: today,
    title: data.title,
    id: data.id,
  });

  const agentLine = data.assignedAgent ? `\nassigned_agent: "${data.assignedAgent}"` : "";
  const priority = data.priority ?? 1;

  return `---
id: ${data.id}
title: "${escapedTitle}"
task_type: ${data.taskType}
story: ${data.story}
status: ${data.status}${agentLine}
priority: ${priority}
created: ${today}
updated: ${today}
---

# ${data.title}

${processedTemplate}`;
}

/**
 * Parse an agent .md file to extract agent info.
 * Reads frontmatter `name` field, falling back to filename without extension.
 */
export function parseAgentFile(filePath: string, content: string): AgentInfo {
  const baseName = path.basename(filePath, ".md");
  try {
    const parsed = matter(content);
    const name = typeof parsed.data?.name === "string" && parsed.data.name.trim()
      ? parsed.data.name.trim()
      : baseName;
    return { name, filePath };
  } catch {
    return { name: baseName, filePath };
  }
}

/**
 * Default task template used when no template file is found.
 */
export const DEFAULT_TASK_TEMPLATE = `## Description

## Acceptance Criteria
- [ ]

## Notes
`;
