/**
 * Pure utility functions for createEpic command - no VS Code dependencies
 * These can be unit tested with Vitest
 */

 
const matter = require('gray-matter');

export interface EpicData {
  id: string;
  title: string;
  goal?: string;
  theme?: string;
}

/**
 * Find the next sequential epic ID number
 * Returns the number only (e.g., 4), not the full ID
 */
export function findNextEpicId(existingIds: string[], prefix: string): number {
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
 * Generate epic markdown content from EpicData
 */
export function generateEpicMarkdown(data: EpicData): string {
  const today = new Date().toISOString().split('T')[0];
  const escapedTitle = data.title.replace(/"/g, '\\"');
  const description = data.goal ?? '[Add epic description here]';
  const themeLine = data.theme ? `theme: ${data.theme}\n` : '';

  return `---
id: ${data.id}
title: "${escapedTitle}"
status: todo
priority: 1
${themeLine}created: ${today}
---

# ${data.title}

## Description
${description}

## Acceptance Criteria
- [ ]

## Stories
<!-- Stories will be auto-linked here when created -->

## Notes

`;
}
