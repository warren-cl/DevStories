/**
 * Pure utility functions for createStory command - no VS Code dependencies
 * These can be unit tested with Vitest
 */

import { StoryType, StorySize } from '../types/story';
import { substituteTemplateVariables, resolveTemplateReference } from './templateUtils';

 
const matter = require('gray-matter');

/**
 * Custom template parsed from .devstories/templates/ folder
 */
export interface CustomTemplate {
  name: string;           // Filename without .md (e.g., "api-endpoint")
  displayName: string;    // From frontmatter title or fallback to name
  description?: string;   // From frontmatter description
  types?: StoryType[];    // Filter by story type (if specified)
  content: string;        // Template body (without frontmatter)
}

/**
 * Parse a custom template file content into CustomTemplate object
 * Extracts frontmatter metadata (title, description, types) and body content
 */
export function parseCustomTemplate(filename: string, content: string): CustomTemplate {
  const name = filename.replace(/\.md$/, '');
  const parsed = matter(content);

  return {
    name,
    displayName: parsed.data?.title ?? name,
    description: parsed.data?.description,
    types: parsed.data?.types,
    content: parsed.content.trim(),
  };
}

export interface DevStoriesConfig {
  epicPrefix: string;
  storyPrefix: string;
  currentSprint?: string;
  statuses: string[];
  sizes: StorySize[];
  quickCaptureDefaultToCurrentSprint: boolean;
}

export interface StoryData {
  id: string;
  title: string;
  type: StoryType;
  epic: string;
  sprint: string;
  size: StorySize;
  priority?: number;
  dependencies?: string[];
}

/**
 * Default templates for each story type
 */
export const DEFAULT_TEMPLATES: Record<StoryType, string> = {
  feature: `## User Story
As a [user], I need [feature] so that [benefit].

## Acceptance Criteria
- [ ]

## Technical Notes

## Files to Modify
`,
  bug: `## Bug Description

## Steps to Reproduce
1.

## Expected vs Actual

## Root Cause
`,
  task: `## Task Description

## Checklist
- [ ]
`,
  chore: `## Description

## Checklist
- [ ]
`,
};

/**
 * Parse config.json content and extract relevant fields for story creation
 */
export function parseConfigJson(content: string): DevStoriesConfig {
  try {
    const parsed = JSON.parse(content);

    return {
      epicPrefix: parsed?.idPrefix?.epic ?? 'EPIC',
      storyPrefix: parsed?.idPrefix?.story ?? 'STORY',
      currentSprint: parsed?.sprints?.current,
      statuses: parsed?.statuses?.map((s: { id: string }) => s.id) ?? ['todo', 'in_progress', 'review', 'done'],
      sizes: parsed?.sizes ?? ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
      quickCaptureDefaultToCurrentSprint: parsed?.quickCapture?.defaultToCurrentSprint === true,
    };
  } catch {
    return {
      epicPrefix: 'EPIC',
      storyPrefix: 'STORY',
      currentSprint: undefined,
      statuses: ['todo', 'in_progress', 'review', 'done'],
      sizes: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
      quickCaptureDefaultToCurrentSprint: false,
    };
  }
}

/**
 * Find the next sequential story ID number
 * Returns the number only (e.g., 15), not the full ID
 */
export function findNextStoryId(existingIds: string[], prefix: string): number {
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
 * Get suggested size based on story type using index-based selection
 * Bug/Chore → first size, Feature → middle size, Task → second size
 */
export function getSuggestedSize(type: StoryType, sizes: StorySize[]): StorySize {
  if (sizes.length === 0) {
    return 'M' as StorySize; // Fallback for edge case (shouldn't happen with valid config)
  }

  const middleIndex = Math.floor(sizes.length / 2);
  const secondIndex = Math.min(1, sizes.length - 1);

  switch (type) {
    case 'bug':
      return sizes[0];
    case 'feature':
      return sizes[middleIndex];
    case 'task':
      return sizes[secondIndex];
    case 'chore':
      return sizes[0];
    default:
      return sizes[middleIndex];
  }
}

/**
 * Simple word overlap for duplicate detection
 * Returns similarity score 0-1
 */
export function calculateTitleSimilarity(title1: string, title2: string): number {
  const words1 = new Set(title1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(title2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const word of words1) {
    if (words2.has(word)) {
      overlap++;
    }
  }

  // Jaccard similarity
  const union = new Set([...words1, ...words2]);
  return overlap / union.size;
}

export interface GenerateOptions {
  project?: string;
  author?: string;
}

/**
 * Generate story markdown content from StoryData
 * Applies variable substitution to template: {{DATE}}, {{TITLE}}, {{ID}}, {{PROJECT}}, {{AUTHOR}}
 */
export function generateStoryMarkdown(
  data: StoryData,
  template: string,
  options?: GenerateOptions
): string {
  const today = new Date().toISOString().split('T')[0];
  const escapedTitle = data.title.replace(/"/g, '\\"');
  const deps = data.dependencies && data.dependencies.length > 0
    ? `\n  - ${data.dependencies.map(d => `[[${d}]]`).join('\n  - ')}`
    : '';

  // Resolve library reference if template is like "@library/api-endpoint"
  const resolvedTemplate = resolveTemplateReference(template) ?? template;

  // Substitute template variables
  const processedTemplate = substituteTemplateVariables(resolvedTemplate, {
    date: today,
    title: data.title,
    id: data.id,
    project: options?.project,
    author: options?.author,
  });

  const priority = data.priority ?? 500;

  return `---
id: ${data.id}
title: "${escapedTitle}"
type: ${data.type}
epic: ${data.epic}
status: todo
sprint: ${data.sprint}
size: ${data.size}
priority: ${priority}
assignee: ""
dependencies:${deps}
created: ${today}
updated: ${today}
---

# ${data.title}

${processedTemplate}`;
}

/**
 * Generate the story link line to append to epic's Stories section
 */
export function generateStoryLink(storyId: string, storyTitle: string): string {
  return `- [[${storyId}]] ${storyTitle}`;
}

/**
 * Append story link to epic markdown content
 * Finds the "## Stories" section and appends the link
 */
export function appendStoryToEpic(epicContent: string, storyLink: string): string {
  // Find ## Stories section
  const storiesRegex = /^## Stories\s*$/m;
  const match = epicContent.match(storiesRegex);

  if (!match || match.index === undefined) {
    // No Stories section found, append at end
    return epicContent.trimEnd() + '\n\n## Stories\n' + storyLink + '\n';
  }

  // Find where to insert (after ## Stories and any existing content before next ##)
  const afterStoriesIdx = match.index + match[0].length;
  const restContent = epicContent.slice(afterStoriesIdx);

  // Find the next ## section
  const nextSectionMatch = restContent.match(/^## /m);
  const insertPoint = nextSectionMatch?.index !== undefined
    ? afterStoriesIdx + nextSectionMatch.index
    : epicContent.length;

  // Get content between ## Stories and next section
  const storiesContent = epicContent.slice(afterStoriesIdx, insertPoint).trimEnd();

  // Build new content
  const before = epicContent.slice(0, afterStoriesIdx);
  const after = epicContent.slice(insertPoint);

  // Append link after existing stories content
  const newStoriesContent = storiesContent
    ? storiesContent + '\n' + storyLink
    : '\n' + storyLink;

  return before + newStoriesContent + '\n\n' + after.trimStart();
}
