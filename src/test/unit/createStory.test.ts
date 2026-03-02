import { describe, it, expect } from 'vitest';
import {
  parseConfigJson,
  findNextStoryId,
  getSuggestedSize,
  calculateTitleSimilarity,
  generateStoryMarkdown,
  generateStoryLink,
  appendStoryToEpic,
  DEFAULT_TEMPLATES,
  parseCustomTemplate,
  CustomTemplate,
} from '../../commands/createStoryUtils';

describe('createStory Utils', () => {
  describe('parseConfigJson', () => {
    it('should parse complete config', () => {
      const json = JSON.stringify({
        version: 1,
        project: 'Test Project',
        idPrefix: {
          epic: 'EPIC',
          story: 'STORY',
        },
        statuses: [
          { id: 'todo', label: 'To Do' },
          { id: 'done', label: 'Done' },
        ],
        sprints: {
          current: 'sprint-1',
        },
        sizes: ['XS', 'S', 'M', 'L', 'XL'],
      });
      const config = parseConfigJson(json);

      expect(config.storyPrefix).toBe('STORY');
      expect(config.epicPrefix).toBe('EPIC');
      expect(config.currentSprint).toBe('sprint-1');
      expect(config.statuses).toEqual(['todo', 'done']);
      expect(config.sizes).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    });

    it('should use defaults for missing fields', () => {
      const json = JSON.stringify({ version: 1 });
      const config = parseConfigJson(json);

      expect(config.storyPrefix).toBe('STORY');
      expect(config.epicPrefix).toBe('EPIC');
    });

    it('should parse quickCapture.defaultToCurrentSprint option', () => {
      const json = JSON.stringify({
        version: 1,
        quickCapture: {
          defaultToCurrentSprint: true,
        },
      });
      const config = parseConfigJson(json);
      expect(config.quickCaptureDefaultToCurrentSprint).toBe(true);
    });

    it('should default quickCapture.defaultToCurrentSprint to false when not specified', () => {
      const json = JSON.stringify({ version: 1 });
      const config = parseConfigJson(json);
      expect(config.quickCaptureDefaultToCurrentSprint).toBe(false);
    });

    it('should handle quickCapture.defaultToCurrentSprint set to false explicitly', () => {
      const json = JSON.stringify({
        version: 1,
        quickCapture: {
          defaultToCurrentSprint: false,
        },
      });
      const config = parseConfigJson(json);
      expect(config.quickCaptureDefaultToCurrentSprint).toBe(false);
    });

    it('should handle invalid JSON', () => {
      const config = parseConfigJson('{ invalid json');
      expect(config.storyPrefix).toBe('STORY');
      expect(config.epicPrefix).toBe('EPIC');
    });
  });

  describe('findNextStoryId', () => {
    it('should return 1 for empty list', () => {
      expect(findNextStoryId([], 'STORY')).toBe(1);
    });

    it('should find next sequential ID', () => {
      const existing = ['STORY-001', 'STORY-002', 'STORY-005'];
      expect(findNextStoryId(existing, 'STORY')).toBe(6);
    });

    it('should work with custom prefix', () => {
      const existing = ['DS-001', 'DS-010', 'DS-003'];
      expect(findNextStoryId(existing, 'DS')).toBe(11);
    });

    it('should ignore IDs with different prefix', () => {
      const existing = ['STORY-005', 'EPIC-010', 'OTHER-100'];
      expect(findNextStoryId(existing, 'STORY')).toBe(6);
    });

    it('should handle IDs near the 4-digit boundary', () => {
      const existing = ['DS-09997', 'DS-09998', 'DS-09999'];
      expect(findNextStoryId(existing, 'DS')).toBe(10000);
    });

    it('should handle IDs in the 5-digit range', () => {
      const existing = ['DS-10000', 'DS-10001', 'DS-99998'];
      expect(findNextStoryId(existing, 'DS')).toBe(99999);
    });

    it('should handle mixed 3-digit and 5-digit IDs on same project', () => {
      // Backward-compatible: old DS-001 style and new DS-00100 style coexist
      const existing = ['DS-001', 'DS-002', 'DS-00100'];
      expect(findNextStoryId(existing, 'DS')).toBe(101);
    });
  });

  describe('getSuggestedSize', () => {
    const defaultSizes = ['XS', 'S', 'M', 'L', 'XL'];

    it('should suggest first size for bugs', () => {
      expect(getSuggestedSize('bug', defaultSizes)).toBe('XS');
    });

    it('should suggest middle size for features', () => {
      expect(getSuggestedSize('feature', defaultSizes)).toBe('M');
    });

    it('should suggest second size for tasks', () => {
      expect(getSuggestedSize('task', defaultSizes)).toBe('S');
    });

    it('should suggest first size for chores', () => {
      expect(getSuggestedSize('chore', defaultSizes)).toBe('XS');
    });

    it('should work with custom size arrays', () => {
      const customSizes = ['Tiny', 'Small', 'Large'];
      expect(getSuggestedSize('bug', customSizes)).toBe('Tiny');
      expect(getSuggestedSize('feature', customSizes)).toBe('Small'); // middle of 3
      expect(getSuggestedSize('task', customSizes)).toBe('Small');
      expect(getSuggestedSize('chore', customSizes)).toBe('Tiny');
    });

    it('should handle single-element array', () => {
      const singleSize = ['OneSize'];
      expect(getSuggestedSize('bug', singleSize)).toBe('OneSize');
      expect(getSuggestedSize('feature', singleSize)).toBe('OneSize');
      expect(getSuggestedSize('task', singleSize)).toBe('OneSize');
    });

    it('should handle two-element array', () => {
      const twoSizes = ['Small', 'Large'];
      expect(getSuggestedSize('bug', twoSizes)).toBe('Small'); // first
      expect(getSuggestedSize('feature', twoSizes)).toBe('Large'); // middle (index 1)
      expect(getSuggestedSize('task', twoSizes)).toBe('Large'); // second (clamped to index 1)
    });
  });

  describe('calculateTitleSimilarity', () => {
    it('should return 1 for identical titles', () => {
      expect(calculateTitleSimilarity('Add user login', 'Add user login')).toBe(1);
    });

    it('should return 0 for completely different titles', () => {
      expect(calculateTitleSimilarity('Add login', 'Delete database')).toBe(0);
    });

    it('should return partial match for similar titles', () => {
      const similarity = calculateTitleSimilarity('Add user login form', 'User login validation');
      expect(similarity).toBeGreaterThan(0.3);
      expect(similarity).toBeLessThan(1);
    });

    it('should be case insensitive', () => {
      expect(calculateTitleSimilarity('Add Login', 'add login')).toBe(1);
    });

    it('should ignore short words', () => {
      // "a" and "to" are < 3 chars, ignored
      expect(calculateTitleSimilarity('a to', 'b in')).toBe(0);
    });
  });

  describe('generateStoryMarkdown', () => {
    it('should generate valid story markdown', () => {
      const data = {
        id: 'STORY-001',
        title: 'Add user login',
        type: 'feature' as const,
        epic: 'EPIC-001',
        sprint: 'sprint-1',
        size: 'M' as const,
      };
      const md = generateStoryMarkdown(data, DEFAULT_TEMPLATES.feature);

      expect(md).toContain('id: STORY-001');
      expect(md).toContain('title: "Add user login"');
      expect(md).toContain('type: feature');
      expect(md).toContain('epic: EPIC-001');
      expect(md).toContain('status: todo');
      expect(md).toContain('sprint: sprint-1');
      expect(md).toContain('size: M');
      expect(md).toContain('# Add user login');
      expect(md).toContain('## User Story');
    });

    it('should escape quotes in title', () => {
      const data = {
        id: 'STORY-001',
        title: 'Fix "broken" thing',
        type: 'bug' as const,
        epic: 'EPIC-001',
        sprint: 'sprint-1',
        size: 'S' as const,
      };
      const md = generateStoryMarkdown(data, DEFAULT_TEMPLATES.bug);

      expect(md).toContain('title: "Fix \\"broken\\" thing"');
    });

    it('should embed the pre-selected epic ID in frontmatter (context-menu scenario)', () => {
      // Simulates right-click on EPIC-042 in the tree → epic picker skipped,
      // the exact ID must appear verbatim in the generated frontmatter.
      const data = {
        id: 'DS-00001',
        title: 'First story from context menu',
        type: 'feature' as const,
        epic: 'EPIC-042',
        sprint: 'sprint-3',
        size: 'M' as const,
      };
      const md = generateStoryMarkdown(data, DEFAULT_TEMPLATES.feature);

      expect(md).toContain('id: DS-00001');
      expect(md).toContain('epic: EPIC-042');
    });

    it('should embed a 5-digit story ID correctly in frontmatter', () => {
      const data = {
        id: 'DS-10001',
        title: 'High-numbered story',
        type: 'task' as const,
        epic: 'EPIC-001',
        sprint: 'sprint-5',
        size: 'S' as const,
      };
      const md = generateStoryMarkdown(data, DEFAULT_TEMPLATES.task);

      expect(md).toContain('id: DS-10001');
      expect(md).toContain('epic: EPIC-001');
    });

    it('should include dependencies wrapped in [[ID]] format', () => {
      const data = {
        id: 'STORY-003',
        title: 'Dependent story',
        type: 'task' as const,
        epic: 'EPIC-001',
        sprint: 'sprint-1',
        size: 'M' as const,
        dependencies: ['STORY-001', 'STORY-002'],
      };
      const md = generateStoryMarkdown(data, DEFAULT_TEMPLATES.task);

      expect(md).toContain('dependencies:');
      expect(md).toContain('- [[STORY-001]]');
      expect(md).toContain('- [[STORY-002]]');
    });

    it('should substitute {{TITLE}} variable in template', () => {
      const data = {
        id: 'STORY-001',
        title: 'Add dark mode',
        type: 'feature' as const,
        epic: 'EPIC-001',
        sprint: 'sprint-1',
        size: 'M' as const,
      };
      const template = '## Feature: {{TITLE}}\n\nImplement {{TITLE}} functionality';
      const md = generateStoryMarkdown(data, template);

      expect(md).toContain('## Feature: Add dark mode');
      expect(md).toContain('Implement Add dark mode functionality');
    });

    it('should substitute {{ID}} variable in template', () => {
      const data = {
        id: 'DS-042',
        title: 'Test story',
        type: 'task' as const,
        epic: 'EPIC-001',
        sprint: 'sprint-1',
        size: 'S' as const,
      };
      const template = 'Reference: {{ID}}';
      const md = generateStoryMarkdown(data, template);

      expect(md).toContain('Reference: DS-042');
    });

    it('should resolve @library reference', () => {
      const data = {
        id: 'STORY-001',
        title: 'Add API endpoint',
        type: 'feature' as const,
        epic: 'EPIC-001',
        sprint: 'sprint-1',
        size: 'L' as const,
      };
      const md = generateStoryMarkdown(data, '@library/api-endpoint');

      expect(md).toContain('## Endpoint');
      expect(md).toContain('Implementation Checklist');
    });

    it('should pass through unknown @library reference as-is', () => {
      const data = {
        id: 'STORY-001',
        title: 'Test',
        type: 'task' as const,
        epic: 'EPIC-001',
        sprint: 'sprint-1',
        size: 'M' as const,
      };
      const md = generateStoryMarkdown(data, '@library/nonexistent');

      expect(md).toContain('@library/nonexistent');
    });

    it('should substitute {{PROJECT}} when options provided', () => {
      const data = {
        id: 'STORY-001',
        title: 'Test',
        type: 'task' as const,
        epic: 'EPIC-001',
        sprint: 'sprint-1',
        size: 'M' as const,
      };
      const template = 'Project: {{PROJECT}}';
      const md = generateStoryMarkdown(data, template, { project: 'DevStories' });

      expect(md).toContain('Project: DevStories');
    });
  });

  describe('generateStoryLink', () => {
    it('should generate correct link format', () => {
      const link = generateStoryLink('STORY-005', 'Add dark mode');
      expect(link).toBe('- [[STORY-005]] Add dark mode');
    });
  });

  describe('appendStoryToEpic', () => {
    it('should append to existing Stories section', () => {
      const epicContent = `---
id: EPIC-001
title: "Test Epic"
---

# Test Epic

## Description
Some description

## Stories
- [[STORY-001]] First story

## Notes
Some notes
`;
      const result = appendStoryToEpic(epicContent, '- [[STORY-002]] Second story');

      expect(result).toContain('- [[STORY-001]] First story');
      expect(result).toContain('- [[STORY-002]] Second story');
      expect(result).toContain('## Notes');
    });

    it('should create Stories section if missing', () => {
      const epicContent = `---
id: EPIC-001
---

# Test Epic

## Description
`;
      const result = appendStoryToEpic(epicContent, '- [[STORY-001]] New story');

      expect(result).toContain('## Stories');
      expect(result).toContain('- [[STORY-001]] New story');
    });

    it('should handle empty Stories section', () => {
      const epicContent = `---
id: EPIC-001
---

# Test Epic

## Stories

## Notes
`;
      const result = appendStoryToEpic(epicContent, '- [[STORY-001]] First story');

      expect(result).toContain('## Stories');
      expect(result).toContain('- [[STORY-001]] First story');
      expect(result).toContain('## Notes');
    });
  });

  describe('parseCustomTemplate', () => {
    it('should parse template with frontmatter metadata', () => {
      const filename = 'api-endpoint.md';
      const content = `---
title: "API Endpoint"
description: "Template for REST API endpoints"
types:
  - feature
  - task
---

## Endpoint Details

- Method: GET/POST/PUT/DELETE
- Path: /api/...
`;
      const template = parseCustomTemplate(filename, content);

      expect(template.name).toBe('api-endpoint');
      expect(template.displayName).toBe('API Endpoint');
      expect(template.description).toBe('Template for REST API endpoints');
      expect(template.types).toEqual(['feature', 'task']);
      expect(template.content).toContain('## Endpoint Details');
      expect(template.content).not.toContain('title:');
    });

    it('should use filename as display name when no frontmatter title', () => {
      const filename = 'my-custom-template.md';
      const content = `## Simple Template

Just content, no frontmatter.
`;
      const template = parseCustomTemplate(filename, content);

      expect(template.name).toBe('my-custom-template');
      expect(template.displayName).toBe('my-custom-template');
      expect(template.description).toBeUndefined();
      expect(template.types).toBeUndefined();
      expect(template.content).toContain('## Simple Template');
    });

    it('should handle kebab-case to display name conversion', () => {
      const filename = 'react-component-with-hooks.md';
      const content = `Template content`;
      const template = parseCustomTemplate(filename, content);

      expect(template.name).toBe('react-component-with-hooks');
      expect(template.displayName).toBe('react-component-with-hooks');
    });

    it('should strip .md extension from name', () => {
      const filename = 'test-template.md';
      const content = `Content`;
      const template = parseCustomTemplate(filename, content);

      expect(template.name).toBe('test-template');
    });

    it('should handle template with only frontmatter title', () => {
      const filename = 'quick.md';
      const content = `---
title: "Quick Start Guide"
---

Steps here.
`;
      const template = parseCustomTemplate(filename, content);

      expect(template.displayName).toBe('Quick Start Guide');
      expect(template.content).toContain('Steps here.');
    });

    it('should filter template by type when types specified', () => {
      const filename = 'bug-only.md';
      const content = `---
types:
  - bug
---

Bug-specific template.
`;
      const template = parseCustomTemplate(filename, content);

      expect(template.types).toEqual(['bug']);
    });
  });
});
