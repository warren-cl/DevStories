import { describe, expect, it } from 'vitest';
import { Parser } from '../../core/parser';

/**
 * DS-063: Additional tests for input validation in parser
 */

describe('Parser', () => {
  describe('parseStory', () => {
    it('should parse a valid story', () => {
      const content = `---
id: DS-001
title: Test Story
type: feature
epic: EPIC-001
status: todo
sprint: sprint-1
size: M
assignee: user
dependencies:
  - DS-002
created: 2025-01-01
updated: 2025-01-02
---

# Test Story
This is the content.`;

      const story = Parser.parseStory(content, '/path/to/DS-001.md');

      expect(story.id).toBe('DS-001');
      expect(story.title).toBe('Test Story');
      expect(story.type).toBe('feature');
      expect(story.epic).toBe('EPIC-001');
      expect(story.status).toBe('todo');
      expect(story.sprint).toBe('sprint-1');
      expect(story.size).toBe('M');
      expect(story.assignee).toBe('user');
      expect(story.dependencies).toEqual(['DS-002']);
      expect(story.created).toBeInstanceOf(Date);
      expect(story.created.toISOString().startsWith('2025-01-01')).toBe(true);
      expect(story.updated).toBeInstanceOf(Date);
      expect(story.content.trim()).toBe('# Test Story\nThis is the content.');
      expect(story.filePath).toBe('/path/to/DS-001.md');
    });

    it('should parse date_done field when present', () => {
      const content = `---
id: DS-010
title: Done Story
type: feature
epic: EPIC-001
status: done
sprint: sprint-1
size: M
created: 2026-01-15
updated: 2026-01-20
date_done: 2026-01-20
---

# Done Story`;
      const story = Parser.parseStory(content);
      expect(story.dateDone).toBeInstanceOf(Date);
      expect(story.dateDone!.toISOString().startsWith('2026-01-20')).toBe(true);
    });

    it('should set dateDone to undefined when date_done is absent', () => {
      const content = `---
id: DS-011
title: Not Done Story
type: feature
epic: EPIC-001
status: todo
size: M
created: 2026-01-15
---

# Not Done Story`;
      const story = Parser.parseStory(content);
      expect(story.dateDone).toBeUndefined();
    });

    it('should throw error if frontmatter is missing', () => {
      const content = `# Just Markdown`;
      expect(() => Parser.parseStory(content)).toThrow('Invalid frontmatter');
    });

    it('should throw error if required fields are missing', () => {
      const content = `---
id: DS-001
---
# Content`;
      expect(() => Parser.parseStory(content)).toThrow('Missing required fields');
    });

    it('should parse successfully when epic field is absent (orphaned story)', () => {
      const content = `---
id: DS-002
title: Orphan Story
type: task
status: todo
size: S
created: 2025-01-01
---
# Orphan Story`;
      const story = Parser.parseStory(content);
      expect(story.epic).toBe('');
    });

    it('should handle missing optional fields', () => {
      const content = `---
id: DS-001
title: Minimal Story
type: task
epic: EPIC-001
status: todo
size: S
created: 2025-01-01
---
Content`;
      const story = Parser.parseStory(content);
      expect(story.assignee).toBeUndefined();
      expect(story.dependencies).toEqual([]);
      expect(story.updated).toBeUndefined();
    });

    it('should parse priority field when present', () => {
      const content = `---
id: DS-001
title: Priority Story
type: feature
epic: EPIC-001
status: todo
size: M
priority: 100
created: 2025-01-01
---
Content`;
      const story = Parser.parseStory(content);
      expect(story.priority).toBe(100);
    });

    it('should default priority to 500 when not specified', () => {
      const content = `---
id: DS-001
title: No Priority Story
type: feature
epic: EPIC-001
status: todo
size: M
created: 2025-01-01
---
Content`;
      const story = Parser.parseStory(content);
      expect(story.priority).toBe(500);
    });

    it('should parse priority = 0 correctly', () => {
      const content = `---
id: DS-001
title: Zero Priority Story
type: feature
epic: EPIC-001
status: todo
size: M
priority: 0
created: 2025-01-01
---
Content`;
      const story = Parser.parseStory(content);
      expect(story.priority).toBe(0);
    });
  });

  describe('parseEpic', () => {
    it('should parse a valid epic', () => {
      const content = `---
id: EPIC-001
title: Test Epic
status: in_progress
sprint: sprint-1
created: 2025-01-01
---
# Epic Content`;

      const epic = Parser.parseEpic(content, '/path/to/EPIC-001.md');

      expect(epic.id).toBe('EPIC-001');
      expect(epic.title).toBe('Test Epic');
      expect(epic.status).toBe('in_progress');
      expect(epic.created).toBeInstanceOf(Date);
      expect(epic.content.trim()).toBe('# Epic Content');
    });
  });

  // DS-063: Content validation tests
  describe('story content validation', () => {
    it('should reject story title over 200 characters', () => {
      const longTitle = 'a'.repeat(201);
      const content = `---
id: DS-001
title: "${longTitle}"
type: task
epic: EPIC-001
status: todo
size: M
created: 2025-01-01
---
Content`;
      expect(() => Parser.parseStory(content)).toThrow('200');
    });

    it('should accept story title at exactly 200 characters', () => {
      const title = 'a'.repeat(200);
      const content = `---
id: DS-001
title: "${title}"
type: task
epic: EPIC-001
status: todo
size: M
created: 2025-01-01
---
Content`;
      const story = Parser.parseStory(content);
      expect(story.title).toBe(title);
    });

    it('should reject story with control characters in title', () => {
      const content = `---
id: DS-001
title: "Bad\\x00Title"
type: task
epic: EPIC-001
status: todo
size: M
created: 2025-01-01
---
Content`;
      expect(() => Parser.parseStory(content)).toThrow('control character');
    });

    it('should accept story with UTF-8 characters in title', () => {
      const content = `---
id: DS-001
title: "修复登录问题 🐛"
type: task
epic: EPIC-001
status: todo
size: M
created: 2025-01-01
---
Content`;
      const story = Parser.parseStory(content);
      expect(story.title).toBe('修复登录问题 🐛');
    });
  });

  describe('epic content validation', () => {
    it('should reject epic title over 100 characters', () => {
      const longTitle = 'b'.repeat(101);
      const content = `---
id: EPIC-001
title: "${longTitle}"
status: active
created: 2025-01-01
---
Content`;
      expect(() => Parser.parseEpic(content)).toThrow('100');
    });

    it('should accept epic title at exactly 100 characters', () => {
      const title = 'b'.repeat(100);
      const content = `---
id: EPIC-001
title: "${title}"
status: active
created: 2025-01-01
---
Content`;
      const epic = Parser.parseEpic(content);
      expect(epic.title).toBe(title);
    });

    it('should reject epic with control characters in title', () => {
      const content = `---
id: EPIC-001
title: "Epic\\nTitle"
status: active
created: 2025-01-01
---
Content`;
      expect(() => Parser.parseEpic(content)).toThrow('control character');
    });
  });

  describe('parseTheme', () => {
    it('should parse a valid theme', () => {
      const content = `---
id: THEME-001
title: User Onboarding
status: active
created: 2025-01-15
updated: 2025-01-20
---

# User Onboarding

## Description

Covers all onboarding flows.

## Epics

- [[EPIC-001]] Registration`;

      const theme = Parser.parseTheme(content, '/path/to/THEME-001.md');

      expect(theme.id).toBe('THEME-001');
      expect(theme.title).toBe('User Onboarding');
      expect(theme.status).toBe('active');
      expect(theme.created).toBeInstanceOf(Date);
      expect(theme.created.toISOString().startsWith('2025-01-15')).toBe(true);
      expect(theme.updated).toBeInstanceOf(Date);
      expect(theme.content).toContain('# User Onboarding');
      expect(theme.content).toContain('[[EPIC-001]]');
      expect(theme.filePath).toBe('/path/to/THEME-001.md');
    });

    it('should throw error if frontmatter is missing', () => {
      const content = `# Just Markdown`;
      expect(() => Parser.parseTheme(content)).toThrow('Invalid frontmatter');
    });

    it('should throw error if id is missing', () => {
      const content = `---
title: Theme without ID
status: todo
created: 2025-01-01
---
Content`;
      expect(() => Parser.parseTheme(content)).toThrow('id');
    });

    it('should throw error if title is missing', () => {
      const content = `---
id: THEME-001
status: todo
created: 2025-01-01
---
Content`;
      expect(() => Parser.parseTheme(content)).toThrow('title');
    });

    it('should accept theme without updated date', () => {
      const content = `---
id: THEME-001
title: Minimal Theme
status: todo
created: 2025-01-01
---
Content`;
      const theme = Parser.parseTheme(content);
      expect(theme.id).toBe('THEME-001');
      expect(theme.updated).toBeUndefined();
    });

    it('should reject theme with title over 100 characters', () => {
      const longTitle = 'b'.repeat(101);
      const content = `---
id: THEME-001
title: "${longTitle}"
status: todo
created: 2025-01-01
---
Content`;
      expect(() => Parser.parseTheme(content)).toThrow('100');
    });
  });
});
