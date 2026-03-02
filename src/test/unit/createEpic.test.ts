import { describe, it, expect } from 'vitest';
import {
  generateEpicMarkdown,
  findNextEpicId,
  parseConfigJson,
} from '../../commands/createEpicUtils';

describe('createEpic utilities', () => {
  describe('parseConfigJson', () => {
    it('should parse epic prefix from config', () => {
      const json = JSON.stringify({
        version: 1,
        project: 'TestProject',
        idPrefix: {
          epic: 'EPIC',
          story: 'STORY',
        },
      });
      const config = parseConfigJson(json);
      expect(config.epicPrefix).toBe('EPIC');
    });

    it('should parse custom epic prefix', () => {
      const json = JSON.stringify({
        version: 1,
        project: 'TestProject',
        idPrefix: {
          epic: 'PROJ',
          story: 'FEAT',
        },
      });
      const config = parseConfigJson(json);
      expect(config.epicPrefix).toBe('PROJ');
    });

    it('should parse current sprint', () => {
      const json = JSON.stringify({
        version: 1,
        project: 'TestProject',
        idPrefix: {
          epic: 'EPIC',
          story: 'STORY',
        },
        sprints: {
          current: 'sprint-5',
        },
      });
      const config = parseConfigJson(json);
      expect(config.currentSprint).toBe('sprint-5');
    });

    it('should parse statuses list', () => {
      const json = JSON.stringify({
        version: 1,
        project: 'TestProject',
        idPrefix: {
          epic: 'EPIC',
          story: 'STORY',
        },
        statuses: [
          { id: 'todo', label: 'To Do' },
          { id: 'in_progress', label: 'In Progress' },
          { id: 'done', label: 'Done' },
        ],
      });
      const config = parseConfigJson(json);
      expect(config.statuses).toEqual(['todo', 'in_progress', 'done']);
    });

    it('should handle invalid JSON', () => {
      const config = parseConfigJson('{ invalid json');
      expect(config.epicPrefix).toBe('EPIC');
      expect(config.storyPrefix).toBe('STORY');
    });
  });

  describe('findNextEpicId', () => {
    it('should return 1 when no epics exist', () => {
      const existingIds: string[] = [];
      const nextId = findNextEpicId(existingIds, 'EPIC');
      expect(nextId).toBe(1);
    });

    it('should return next sequential number', () => {
      const existingIds = ['EPIC-001', 'EPIC-002', 'EPIC-003'];
      const nextId = findNextEpicId(existingIds, 'EPIC');
      expect(nextId).toBe(4);
    });

    it('should find gaps and use highest + 1', () => {
      const existingIds = ['EPIC-001', 'EPIC-005', 'EPIC-003'];
      const nextId = findNextEpicId(existingIds, 'EPIC');
      expect(nextId).toBe(6);
    });

    it('should handle custom prefix', () => {
      const existingIds = ['PROJ-001', 'PROJ-002'];
      const nextId = findNextEpicId(existingIds, 'PROJ');
      expect(nextId).toBe(3);
    });

    it('should ignore non-matching prefixes', () => {
      const existingIds = ['EPIC-001', 'STORY-005', 'EPIC-002'];
      const nextId = findNextEpicId(existingIds, 'EPIC');
      expect(nextId).toBe(3);
    });

    it('should handle 4-digit boundary: EPIC-0999 → 1000', () => {
      const existingIds = ['EPIC-0997', 'EPIC-0998', 'EPIC-0999'];
      const nextId = findNextEpicId(existingIds, 'EPIC');
      expect(nextId).toBe(1000);
    });

    it('should handle mixed 3-digit and 4-digit IDs', () => {
      const existingIds = ['EPIC-001', 'EPIC-0010', 'EPIC-005'];
      const nextId = findNextEpicId(existingIds, 'EPIC');
      expect(nextId).toBe(11);
    });

    it('should handle large IDs up to 9999', () => {
      const existingIds = ['EPIC-9998', 'EPIC-9999'];
      const nextId = findNextEpicId(existingIds, 'EPIC');
      expect(nextId).toBe(10000);
    });
  });

  describe('generateEpicMarkdown', () => {
    it('should generate valid epic markdown with all fields', () => {
      const markdown = generateEpicMarkdown({
        id: 'EPIC-001',
        title: 'Test Epic',
        goal: 'Build amazing features',
      });

      expect(markdown).toContain('id: EPIC-001');
      expect(markdown).toContain('title: "Test Epic"');
      expect(markdown).toContain('status: todo');
      expect(markdown).not.toContain('sprint:'); // Epics don't have sprints
      expect(markdown).toContain('# Test Epic');
      expect(markdown).toContain('Build amazing features');
    });

    it('should use placeholder when no goal provided', () => {
      const markdown = generateEpicMarkdown({
        id: 'EPIC-002',
        title: 'Another Epic',
      });

      expect(markdown).toContain('[Add epic description here]');
    });

    it('should escape quotes in title', () => {
      const markdown = generateEpicMarkdown({
        id: 'EPIC-003',
        title: 'Epic with "quotes"',
      });

      expect(markdown).toContain('title: "Epic with \\"quotes\\""');
    });

    it('should include created date as today', () => {
      const today = new Date().toISOString().split('T')[0];
      const markdown = generateEpicMarkdown({
        id: 'EPIC-001',
        title: 'Test Epic',
      });

      expect(markdown).toContain(`created: ${today}`);
    });

    it('should include Stories section placeholder', () => {
      const markdown = generateEpicMarkdown({
        id: 'EPIC-001',
        title: 'Test Epic',
      });

      expect(markdown).toContain('## Stories');
    });

    it('should include theme in frontmatter when provided (context-menu scenario)', () => {
      const markdown = generateEpicMarkdown({
        id: 'EPIC-007',
        title: 'Auth System',
        theme: 'THEME-002',
      });

      expect(markdown).toContain('theme: THEME-002');
      // theme line must appear before the Stories section
      const themePos = markdown.indexOf('theme: THEME-002');
      const storiesPos = markdown.indexOf('## Stories');
      expect(themePos).toBeGreaterThan(-1);
      expect(themePos).toBeLessThan(storiesPos);
    });

    it('should omit theme line when not provided', () => {
      const markdown = generateEpicMarkdown({
        id: 'EPIC-007',
        title: 'Auth System',
      });

      expect(markdown).not.toContain('theme:');
    });
  });
});
