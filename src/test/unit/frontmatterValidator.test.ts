import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import {
  validateFrontmatter,
  validateCrossFile,
  findFieldLine,
  findValueColumn,
  getFileTypeFromPath,
  isDevStoriesFile,
  resetAjvCache,
  ValidationConfig,
  ValidationError,
  KnownIds
} from '../../validation/frontmatterValidator';

const SCHEMAS_DIR = path.join(__dirname, '../../../schemas');

// Default config for tests
const defaultConfig: ValidationConfig = {
  statuses: ['todo', 'in_progress', 'review', 'done'],
  sizes: ['XS', 'S', 'M', 'L', 'XL']
};

describe('frontmatterValidator', () => {
  beforeEach(() => {
    // Reset Ajv cache between tests to ensure clean state
    resetAjvCache();
  });

  describe('validateFrontmatter - Story', () => {
    it('should return no errors for valid story', () => {
      const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---

# Test Story
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);
      expect(errors).toHaveLength(0);
    });

    it('should return no errors for valid story with all optional fields', () => {
      const content = `---
id: DS-001
title: Complete Story
type: bug
epic: EPIC-INBOX
status: in_progress
sprint: sprint-1
size: L
priority: 100
assignee: developer
dependencies:
  - DS-002
  - "[[DS-003]]"
created: 2025-01-15
updated: 2025-01-20
---

# Complete Story
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing required field (id)', () => {
      const content = `---
title: Missing ID
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);
      expect(errors.length).toBeGreaterThan(0);
      const idError = errors.find(e => e.message.includes('id'));
      expect(idError).toBeDefined();
      expect(idError?.severity).toBe('error');
    });

    it('should return error for missing required field (title)', () => {
      const content = `---
id: DS-001
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);
      expect(errors.length).toBeGreaterThan(0);
      const titleError = errors.find(e => e.message.includes('title'));
      expect(titleError).toBeDefined();
    });

    it('should return error for invalid type enum', () => {
      const content = `---
id: DS-001
title: Invalid Type
type: invalid_type
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);
      expect(errors.length).toBeGreaterThan(0);
      const typeError = errors.find(e => e.field === 'type');
      expect(typeError).toBeDefined();
      expect(typeError?.severity).toBe('error');
      expect(typeError?.message).toContain('feature');
    });

    it('should return warning for size not in config', () => {
      const content = `---
id: DS-001
title: Invalid Size
type: feature
epic: EPIC-001
status: todo
size: XXL
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);
      expect(errors.length).toBeGreaterThan(0);
      const sizeError = errors.find(e => e.field === 'size');
      expect(sizeError).toBeDefined();
      expect(sizeError?.severity).toBe('warning');
    });

    it('should return error for invalid date format', () => {
      const content = `---
id: DS-001
title: Invalid Date
type: feature
epic: EPIC-001
status: todo
size: M
created: 01-15-2025
---
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);
      expect(errors.length).toBeGreaterThan(0);
      const dateError = errors.find(e => e.field === 'created');
      expect(dateError).toBeDefined();
      expect(dateError?.severity).toBe('error');
    });

    it('should return error for invalid ID pattern', () => {
      const content = `---
id: invalid-id
title: Invalid ID Pattern
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);
      expect(errors.length).toBeGreaterThan(0);
      const idError = errors.find(e => e.field === 'id');
      expect(idError).toBeDefined();
      expect(idError?.severity).toBe('error');
    });

    it('should return warning for status not in config', () => {
      const content = `---
id: DS-001
title: Unknown Status
type: feature
epic: EPIC-001
status: blocked
size: M
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);
      const statusWarning = errors.find(e => e.field === 'status');
      expect(statusWarning).toBeDefined();
      expect(statusWarning?.severity).toBe('warning');
      expect(statusWarning?.message).toContain('blocked');
      expect(statusWarning?.message).toContain('not defined in config');
    });

    it('should return warning for size not in config', () => {
      const customConfig: ValidationConfig = {
        statuses: ['todo', 'done'],
        sizes: ['S', 'M', 'L'] // No XS or XL
      };
      const content = `---
id: DS-001
title: Unknown Size
type: feature
epic: EPIC-001
status: todo
size: XS
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'story', customConfig, SCHEMAS_DIR);
      const sizeWarning = errors.find(e => e.field === 'size' && e.severity === 'warning');
      expect(sizeWarning).toBeDefined();
      expect(sizeWarning?.message).toContain('XS');
      expect(sizeWarning?.message).toContain('not defined in config');
    });

    it('should return error for no frontmatter', () => {
      const content = `# Just a markdown file

No frontmatter here.
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('No frontmatter');
    });

    it('should include correct line numbers', () => {
      const content = `---
id: DS-001
title: Test
type: invalid_type
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);
      const typeError = errors.find(e => e.field === 'type');
      expect(typeError?.line).toBe(4); // type is on line 4
    });

    it('should handle additional unknown fields', () => {
      const content = `---
id: DS-001
title: Extra Fields
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
unknown_field: some_value
---
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);
      const unknownError = errors.find(e => e.message.includes('unknown_field') || e.message.includes('Unknown field'));
      expect(unknownError).toBeDefined();
    });
  });

  describe('validateFrontmatter - Epic', () => {
    it('should return no errors for valid epic', () => {
      const content = `---
id: EPIC-001
title: Test Epic
status: todo
created: 2025-01-15
---

# Test Epic
`;
      const errors = validateFrontmatter(content, 'epic', defaultConfig, SCHEMAS_DIR);
      expect(errors).toHaveLength(0);
    });

    it('should accept EPIC-INBOX as valid ID', () => {
      const content = `---
id: EPIC-INBOX
title: Inbox
status: in_progress
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'epic', defaultConfig, SCHEMAS_DIR);
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing title', () => {
      const content = `---
id: EPIC-001
status: active
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'epic', defaultConfig, SCHEMAS_DIR);
      expect(errors.length).toBeGreaterThan(0);
      const titleError = errors.find(e => e.message.includes('title'));
      expect(titleError).toBeDefined();
    });

    it('should return error for invalid epic ID pattern', () => {
      const content = `---
id: epic-001
title: Invalid ID
status: active
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'epic', defaultConfig, SCHEMAS_DIR);
      expect(errors.length).toBeGreaterThan(0);
      const idError = errors.find(e => e.field === 'id');
      expect(idError).toBeDefined();
    });

    it('should return warning for status not in config', () => {
      const content = `---
id: EPIC-001
title: Unknown Status
status: archived
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'epic', defaultConfig, SCHEMAS_DIR);
      const statusWarning = errors.find(e => e.field === 'status' && e.severity === 'warning');
      expect(statusWarning).toBeDefined();
      expect(statusWarning?.message).toContain('archived');
    });

    it('should NOT validate size for epics', () => {
      // Epics don't have size field - any size-related check should not apply
      const content = `---
id: EPIC-001
title: Epic Without Size
status: active
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'epic', defaultConfig, SCHEMAS_DIR);
      // Should not have any size-related errors/warnings
      const sizeError = errors.find(e => e.field === 'size');
      expect(sizeError).toBeUndefined();
    });
  });

  describe('findFieldLine', () => {
    it('should find line number of field', () => {
      const content = `---
id: DS-001
title: Test
type: feature
---`;
      expect(findFieldLine(content, 'id')).toBe(2);
      expect(findFieldLine(content, 'title')).toBe(3);
      expect(findFieldLine(content, 'type')).toBe(4);
    });

    it('should return 1 for non-existent field', () => {
      const content = `---
id: DS-001
---`;
      expect(findFieldLine(content, 'missing')).toBe(1);
    });
  });

  describe('findValueColumn', () => {
    it('should find value position in simple field', () => {
      const line = 'status: todo';
      const { start, end } = findValueColumn(line, 'status');
      expect(start).toBe(8);
      expect(end).toBe(12);
    });

    it('should handle quoted values', () => {
      const line = 'title: "My Story"';
      const { start, end } = findValueColumn(line, 'title');
      expect(start).toBe(7);
    });

    it('should handle extra whitespace', () => {
      const line = 'type:   feature  ';
      const { start, end } = findValueColumn(line, 'type');
      expect(line.slice(start, end)).toBe('feature');
    });
  });

  describe('getFileTypeFromPath', () => {
    it('should return story for stories path', () => {
      expect(getFileTypeFromPath('/project/.devstories/stories/DS-001.md')).toBe('story');
    });

    it('should return epic for epics path', () => {
      expect(getFileTypeFromPath('/project/.devstories/epics/EPIC-001.md')).toBe('epic');
    });

    it('should return null for unknown path', () => {
      expect(getFileTypeFromPath('/project/README.md')).toBeNull();
    });

    it('should handle Windows paths', () => {
      expect(getFileTypeFromPath('C:\\project\\.devstories\\stories\\DS-001.md')).toBe('story');
      expect(getFileTypeFromPath('C:\\project\\.devstories\\epics\\EPIC-001.md')).toBe('epic');
    });

    it('should return task for task file paths (storydocs)', () => {
      expect(getFileTypeFromPath('/project/docs/storydocs/stories/DS-001/tasks/TASK-001.md')).toBe('task');
    });

    it('should return task for Windows task paths', () => {
      expect(getFileTypeFromPath('C:\\project\\docs\\storydocs\\stories\\DS-001\\tasks\\TASK-001.md')).toBe('task');
    });

    it('should prioritise task over story when path contains /tasks/', () => {
      // Task files live inside stories folder, so /stories/ is also present in path
      expect(getFileTypeFromPath('/docs/stories/DS-001/tasks/TASK-001.md')).toBe('task');
    });
  });

  describe('isDevStoriesFile', () => {
    it('should return true for devstories files', () => {
      expect(isDevStoriesFile('/project/.devstories/stories/DS-001.md')).toBe(true);
      expect(isDevStoriesFile('/project/.devstories/epics/EPIC-001.md')).toBe(true);
      expect(isDevStoriesFile('/project/.devstories/config.json')).toBe(true);
    });

    it('should return false for non-devstories files', () => {
      expect(isDevStoriesFile('/project/src/index.ts')).toBe(false);
      expect(isDevStoriesFile('/project/README.md')).toBe(false);
    });

    it('should handle Windows paths', () => {
      expect(isDevStoriesFile('C:\\project\\.devstories\\stories\\DS-001.md')).toBe(true);
    });
  });

  describe('lenient mode - invalid files still load', () => {
    it('should return warnings not errors for config mismatches', () => {
      const content = `---
id: DS-001
title: Valid Structure
type: feature
epic: EPIC-001
status: custom_status
size: M
created: 2025-01-15
---
`;
      const errors = validateFrontmatter(content, 'story', defaultConfig, SCHEMAS_DIR);

      // Should have warning for status, not error
      const statusIssue = errors.find(e => e.field === 'status');
      expect(statusIssue?.severity).toBe('warning');

      // No schema errors - file structure is valid
      const schemaErrors = errors.filter(e => e.severity === 'error');
      expect(schemaErrors).toHaveLength(0);
    });
  });

  describe('validateCrossFile', () => {
    // Helper to create KnownIds for tests
    const createKnownIds = (overrides: Partial<KnownIds> = {}): KnownIds => ({
      stories: new Set(['DS-001', 'DS-002', 'DS-003']),
      epics: new Set(['EPIC-001', 'EPIC-002', 'EPIC-INBOX']),
      themes: new Set<string>(),
      tasks: new Set<string>(),
      epicStoryMap: new Map([
        ['EPIC-001', new Set(['DS-001', 'DS-002'])],
        ['EPIC-002', new Set(['DS-003'])],
        ['EPIC-INBOX', new Set()]
      ]),
      themeEpicMap: new Map<string, Set<string>>(),
      ...overrides
    });

    describe('epic field validation', () => {
      it('should return no errors when epic exists', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---

Some content.
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const epicErrors = errors.filter(e => e.field === 'epic');
        expect(epicErrors).toHaveLength(0);
      });

      it('should return error when epic does not exist', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-999
status: todo
size: M
created: 2025-01-15
---
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const epicError = errors.find(e => e.field === 'epic');
        expect(epicError).toBeDefined();
        expect(epicError?.severity).toBe('error');
        expect(epicError?.message).toContain('EPIC-999');
        expect(epicError?.message).toContain('does not exist');
      });

      it('should return correct line number for epic error', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-999
status: todo
size: M
created: 2025-01-15
---
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const epicError = errors.find(e => e.field === 'epic');
        expect(epicError?.line).toBe(5); // epic is on line 5
      });

      it('should NOT check epic for epics (epics dont have epic field)', () => {
        const content = `---
id: EPIC-001
title: Test Epic
status: todo
created: 2025-01-15
---
`;
        const errors = validateCrossFile(content, 'epic', 'EPIC-001', createKnownIds());
        const epicErrors = errors.filter(e => e.field === 'epic');
        expect(epicErrors).toHaveLength(0);
      });

      it('should NOT error for EPIC-INBOX (special case)', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-INBOX
status: todo
size: M
created: 2025-01-15
---
`;
        // EPIC-INBOX always valid even if not in knownIds
        const knownIds = createKnownIds({ epics: new Set(['EPIC-001']) });
        const errors = validateCrossFile(content, 'story', 'DS-001', knownIds);
        const epicErrors = errors.filter(e => e.field === 'epic');
        expect(epicErrors).toHaveLength(0);
      });
    });

    describe('dependencies validation', () => {
      it('should return no errors when all dependencies exist', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
dependencies:
  - DS-002
  - DS-003
created: 2025-01-15
---
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const depErrors = errors.filter(e => e.field === 'dependencies');
        expect(depErrors).toHaveLength(0);
      });

      it('should return error when dependency does not exist', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
dependencies:
  - DS-999
created: 2025-01-15
---
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const depError = errors.find(e => e.field === 'dependencies');
        expect(depError).toBeDefined();
        expect(depError?.severity).toBe('error');
        expect(depError?.message).toContain('DS-999');
      });

      it('should return error for self-reference in dependencies', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
dependencies:
  - DS-001
created: 2025-01-15
---
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const selfRefError = errors.find(e => e.message.includes('itself'));
        expect(selfRefError).toBeDefined();
        expect(selfRefError?.severity).toBe('error');
      });

      it('should return multiple errors for multiple missing dependencies', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
dependencies:
  - DS-888
  - DS-999
created: 2025-01-15
---
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const depErrors = errors.filter(e => e.field === 'dependencies');
        expect(depErrors.length).toBeGreaterThanOrEqual(2);
      });

      it('should handle wiki-style dependency format [[DS-002]]', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
dependencies:
  - "[[DS-002]]"
created: 2025-01-15
---
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const depErrors = errors.filter(e => e.field === 'dependencies');
        expect(depErrors).toHaveLength(0);
      });

      it('should handle empty dependencies array', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
dependencies: []
created: 2025-01-15
---
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const depErrors = errors.filter(e => e.field === 'dependencies');
        expect(depErrors).toHaveLength(0);
      });
    });

    describe('[[ID]] link validation in body', () => {
      it('should return no errors when all links resolve', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---

# Story

Related to [[DS-002]] and [[EPIC-001]].
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const linkErrors = errors.filter(e => e.message.includes('[['));
        expect(linkErrors).toHaveLength(0);
      });

      it('should return warning when link does not resolve', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---

# Story

See [[DS-999]] for more info.
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const linkWarning = errors.find(e => e.message.includes('DS-999'));
        expect(linkWarning).toBeDefined();
        expect(linkWarning?.severity).toBe('warning');
      });

      it('should include line number for broken link', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---

# Story

See [[DS-999]] for more info.
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const linkWarning = errors.find(e => e.message.includes('DS-999'));
        expect(linkWarning?.line).toBe(13); // The line with [[DS-999]]
      });

      it('should find multiple broken links', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---

See [[DS-888]] and [[EPIC-999]].
`;
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const linkWarnings = errors.filter(e => e.severity === 'warning' && e.message.includes('does not exist'));
        expect(linkWarnings.length).toBe(2);
      });

      it('should validate links in epics too', () => {
        const content = `---
id: EPIC-001
title: Test Epic
status: todo
created: 2025-01-15
---

# Epic

Stories: [[DS-001]], [[DS-999]]
`;
        const errors = validateCrossFile(content, 'epic', 'EPIC-001', createKnownIds());
        const linkWarning = errors.find(e => e.message.includes('DS-999'));
        expect(linkWarning).toBeDefined();
      });
    });

    describe('ID uniqueness validation', () => {
      it('should return error if story ID exists as epic ID', () => {
        const content = `---
id: EPIC-001
title: Test Story
type: feature
epic: EPIC-002
status: todo
size: M
created: 2025-01-15
---
`;
        // Story file trying to use EPIC-001 as ID (which exists in epics)
        const errors = validateCrossFile(content, 'story', 'EPIC-001', createKnownIds());
        const dupeError = errors.find(e => e.message.includes('duplicate') || e.message.includes('already exists'));
        expect(dupeError).toBeDefined();
        expect(dupeError?.severity).toBe('error');
      });

      it('should return error if epic ID exists as story ID', () => {
        const content = `---
id: DS-001
title: Test Epic
status: todo
created: 2025-01-15
---
`;
        // Epic file trying to use DS-001 as ID (which exists in stories)
        const errors = validateCrossFile(content, 'epic', 'DS-001', createKnownIds());
        const dupeError = errors.find(e => e.message.includes('duplicate') || e.message.includes('already exists'));
        expect(dupeError).toBeDefined();
        expect(dupeError?.severity).toBe('error');
      });

      it('should NOT error for own ID in same collection', () => {
        const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---
`;
        // DS-001 exists in stories but we're validating DS-001.md itself
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const dupeErrors = errors.filter(e => e.message.includes('duplicate') || e.message.includes('already exists'));
        expect(dupeErrors).toHaveLength(0);
      });
    });

    describe('orphan story validation', () => {
      it('should return warning when story is not listed in epic', () => {
        const content = `---
id: DS-004
title: Orphan Story
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---
`;
        // DS-004 references EPIC-001 but EPIC-001's stories list only has DS-001, DS-002
        const knownIds = createKnownIds({ stories: new Set(['DS-001', 'DS-002', 'DS-004']) });
        const errors = validateCrossFile(content, 'story', 'DS-004', knownIds);
        const orphanWarning = errors.find(e => e.message.includes('not listed') || e.message.includes('orphan'));
        expect(orphanWarning).toBeDefined();
        expect(orphanWarning?.severity).toBe('warning');
      });

      it('should NOT warn for stories in EPIC-INBOX', () => {
        const content = `---
id: DS-004
title: Inbox Story
type: feature
epic: EPIC-INBOX
status: todo
size: M
created: 2025-01-15
---
`;
        // EPIC-INBOX is a special case - stories don't need to be listed
        const errors = validateCrossFile(content, 'story', 'DS-004', createKnownIds());
        const orphanWarning = errors.find(e => e.message.includes('not listed') || e.message.includes('orphan'));
        expect(orphanWarning).toBeUndefined();
      });

      it('should NOT warn when story IS listed in epic', () => {
        const content = `---
id: DS-001
title: Listed Story
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-15
---
`;
        // DS-001 is in EPIC-001's epicStoryMap
        const errors = validateCrossFile(content, 'story', 'DS-001', createKnownIds());
        const orphanWarning = errors.find(e => e.message.includes('not listed') || e.message.includes('orphan'));
        expect(orphanWarning).toBeUndefined();
      });
    });
  });
});
