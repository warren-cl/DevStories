/**
 * Pure utility functions for init command - no VS Code dependencies
 * These can be unit tested with Vitest
 */

import { localToday, mondayOfCurrentWeek } from "../utils/dateUtils";

export interface InitConfig {
  projectName: string;
  epicPrefix: string;
  storyPrefix: string;
  themePrefix: string;
  taskPrefix: string;
  sprint: string;
}

/**
 * Generates config.json content from InitConfig
 */
export function generateConfigJson(config: InitConfig, extensionVersion: string): string {
  const configObj = {
    version: extensionVersion,
    project: config.projectName,
    idMode: "auto",
    idPrefix: {
      theme: config.themePrefix,
      epic: config.epicPrefix,
      story: config.storyPrefix,
      task: config.taskPrefix,
    },
    statuses: [
      { id: "todo", label: "To Do" },
      { id: "in_progress", label: "In Progress" },
      { id: "review", label: "Review" },
      { id: "done", label: "Done" },
    ],
    sprints: {
      current: config.sprint,
      sequence: [config.sprint, "backlog"],
      length: 7,
      firstSprintStartDate: mondayOfCurrentWeek(),
    },
    sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"],
    storypoints: [1, 2, 4, 8, 16, 32, 64],
    autoFilterCurrentSprint: true,
    quickCapture: {
      defaultToCurrentSprint: false,
    },
    storydocs: {
      enabled: false,
      root: "docs/storydocs",
    },
    taskTypes: {
      code: "code.template.md",
      document: "document.template.md",
      remediate: "remediate.template.md",
      investigate: "investigate.template.md",
      plan: "plan.template.md",
      validate: "validate.template.md",
    },
    storyTypes: {
      feature: { template: "feature.template.md", description: "New functionality or capability", icon: "lightbulb", emoji: "✨" },
      bug: { template: "bug.template.md", description: "Defect or issue to fix", icon: "bug", emoji: "🐛" },
      task: { template: "task.template.md", description: "Work item or action", icon: "tasklist", emoji: "📋" },
      chore: { template: "chore.template.md", description: "Maintenance or housekeeping", icon: "tools", emoji: "🔧" },
      spike: { template: "spike.template.md", description: "Time-boxed investigation or research", icon: "beaker", emoji: "🔬" },
    },
    storyTemplateRoot: ".devstories/templates",
    taskTemplateRoot: ".devstories/templates",
    archive: {
      soft: { devstories: "archive", storydocs: "archive" },
      hard: { devstories: "glacier", storydocs: "glacier" },
    },
  };
  return JSON.stringify(configObj, null, 2);
}

/**
 * Detects project name from project files.
 * Priority: package.json > Cargo.toml > pyproject.toml > go.mod
 */
export function detectProjectName(files: Map<string, string>): string | undefined {
  // package.json (highest priority)
  const packageJson = files.get("package.json");
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
  const cargoToml = files.get("Cargo.toml");
  if (cargoToml) {
    const match = cargoToml.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (match) {
      return match[1];
    }
  }

  // pyproject.toml
  const pyprojectToml = files.get("pyproject.toml");
  if (pyprojectToml) {
    const match = pyprojectToml.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (match) {
      return match[1];
    }
  }

  // go.mod
  const goMod = files.get("go.mod");
  if (goMod) {
    const match = goMod.match(/^module\s+(\S+)/m);
    if (match) {
      // Extract last path segment (e.g., github.com/user/project -> project)
      const parts = match[1].split("/");
      return parts[parts.length - 1];
    }
  }

  return undefined;
}

/**
 * Generates sample epic content
 */
export function generateSampleEpic(storyPrefix: string): string {
  const today = localToday();

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
  const today = localToday();

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
