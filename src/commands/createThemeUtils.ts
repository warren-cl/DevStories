/**
 * Pure utility functions for createTheme command - no VS Code dependencies
 * These can be unit tested with Vitest
 */

const matter = require('gray-matter');

export interface ThemeData {
  id: string;
  title: string;
  goal?: string;
}

/**
 * Find the next sequential theme ID number
 * Returns the number only (e.g., 4), not the full ID
 */
export function findNextThemeId(existingIds: string[], prefix: string): number {
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
 * Generate theme markdown content from ThemeData
 */
export function generateThemeMarkdown(data: ThemeData): string {
  const today = new Date().toISOString().split('T')[0];
  const escapedTitle = data.title.replace(/"/g, '\\"');
  const description = data.goal ?? '[Add theme description here]';

  return `---
id: ${data.id}
title: "${escapedTitle}"
status: todo
priority: 1
created: ${today}
---

# ${data.title}

## Description
${description}

## Acceptance Criteria
- [ ]

## Epics
<!-- Epics will be auto-linked here when created -->

## Notes

`;
}

/**
 * Generate the epic link line to append to theme's Epics section
 */
export function generateEpicLink(epicId: string, epicTitle: string): string {
  return `- [[${epicId}]] ${epicTitle}`;
}

/**
 * Append epic link to theme markdown content
 * Finds the "## Epics" section and appends the link
 */
export function appendEpicToTheme(themeContent: string, epicLink: string): string {
  // Find ## Epics section
  const epicsRegex = /^## Epics\s*$/m;
  const match = themeContent.match(epicsRegex);

  if (!match || match.index === undefined) {
    // No Epics section found, append at end
    return themeContent.trimEnd() + '\n\n## Epics\n' + epicLink + '\n';
  }

  // Find where to insert (after ## Epics and any existing content before next ##)
  const afterEpicsIdx = match.index + match[0].length;
  const restContent = themeContent.slice(afterEpicsIdx);

  // Find the next ## section
  const nextSectionMatch = restContent.match(/^## /m);
  const insertPoint = nextSectionMatch?.index !== undefined
    ? afterEpicsIdx + nextSectionMatch.index
    : themeContent.length;

  // Get content between ## Epics and next section
  const epicsContent = themeContent.slice(afterEpicsIdx, insertPoint).trimEnd();

  // Build new content
  const before = themeContent.slice(0, afterEpicsIdx);
  const after = themeContent.slice(insertPoint);

  // Append link after existing epics content
  const newEpicsContent = epicsContent
    ? epicsContent + '\n' + epicLink
    : '\n' + epicLink;

  return before + newEpicsContent + '\n\n' + after.trimStart();
}
