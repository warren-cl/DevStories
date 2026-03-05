/**
 * Pure utility functions for init command - no VS Code dependencies
 * These can be unit tested with Vitest
 */

export interface InitConfig {
  projectName: string;
  epicPrefix: string;
  storyPrefix: string;
  themePrefix: string;
  sprint: string;
}

/**
 * Generates config.json content from InitConfig
 */
export function generateConfigJson(config: InitConfig): string {
  const configObj = {
    version: 1,
    project: config.projectName,
    idMode: 'auto',
    idPrefix: {
      theme: config.themePrefix,
      epic: config.epicPrefix,
      story: config.storyPrefix,
    },
    statuses: [
      { id: 'todo', label: 'To Do' },
      { id: 'in_progress', label: 'In Progress' },
      { id: 'review', label: 'Review' },
      { id: 'done', label: 'Done' },
    ],
    sprints: {
      current: config.sprint,
      sequence: [config.sprint, 'backlog'],
    },
    sizes: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
    storypoints: [1, 2, 4, 8, 16, 32, 64],
  };
  return JSON.stringify(configObj, null, 2);
}

/**
 * Detects project name from project files.
 * Priority: package.json > Cargo.toml > pyproject.toml > go.mod
 */
export function detectProjectName(files: Map<string, string>): string | undefined {
  // package.json (highest priority)
  const packageJson = files.get('package.json');
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson);
      if (parsed.name) {
        return parsed.name;
      }
    } catch {
      // Invalid JSON in package.json - continue to next detection method
    }
  }

  // Cargo.toml
  const cargoToml = files.get('Cargo.toml');
  if (cargoToml) {
    const match = cargoToml.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (match) {
      return match[1];
    }
  }

  // pyproject.toml
  const pyprojectToml = files.get('pyproject.toml');
  if (pyprojectToml) {
    const match = pyprojectToml.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (match) {
      return match[1];
    }
  }

  // go.mod
  const goMod = files.get('go.mod');
  if (goMod) {
    const match = goMod.match(/^module\s+(\S+)/m);
    if (match) {
      // Extract last path segment (e.g., github.com/user/project -> project)
      const parts = match[1].split('/');
      return parts[parts.length - 1];
    }
  }

  return undefined;
}

/**
 * Generates sample epic content
 */
export function generateSampleEpic(storyPrefix: string): string {
  const today = new Date().toISOString().split('T')[0];

  return `---
id: EPIC-001
title: Sample Epic (Delete Me)
status: todo
created: ${today}
---

# Sample Epic (Delete Me)

This is a sample epic to help you understand the DevStories format.

## Description
Replace this with your epic description.

## Stories
- [[${storyPrefix}-001]]

**Feel free to delete this file once you're familiar with the format.**
`;
}

/**
 * Generates sample story content
 */
export function generateSampleStory(sprint: string, storyPrefix: string): string {
  const today = new Date().toISOString().split('T')[0];

  return `---
id: ${storyPrefix}-001
title: Sample Story (Delete Me)
type: feature
epic: EPIC-001
status: todo
sprint: ${sprint}
size: S
priority: 1
assignee: ""
dependencies: []
created: ${today}
---

# Sample Story (Delete Me)

This is a sample story to help you understand the DevStories format.

## User Story
As a developer, I want to understand the story format so that I can create my own stories.

## Acceptance Criteria
- [ ] Read through this example
- [ ] Create your first real story
- [ ] Delete this sample file

**Feel free to delete this file once you're familiar with the format.**
`;
}
