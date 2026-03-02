import { describe, it, expect } from 'vitest';
import {
  findNextThemeId,
  generateThemeMarkdown,
  generateEpicLink,
  appendEpicToTheme,
} from '../../commands/createThemeUtils';

describe('createTheme utilities', () => {
  describe('findNextThemeId', () => {
    it('should return 1 when no themes exist', () => {
      const nextId = findNextThemeId([], 'THEME');
      expect(nextId).toBe(1);
    });

    it('should return next sequential number', () => {
      const existingIds = ['THEME-001', 'THEME-002', 'THEME-003'];
      const nextId = findNextThemeId(existingIds, 'THEME');
      expect(nextId).toBe(4);
    });

    it('should find highest + 1 when gaps exist', () => {
      const existingIds = ['THEME-001', 'THEME-005', 'THEME-003'];
      const nextId = findNextThemeId(existingIds, 'THEME');
      expect(nextId).toBe(6);
    });

    it('should handle custom prefix', () => {
      const existingIds = ['AREA-001', 'AREA-002'];
      const nextId = findNextThemeId(existingIds, 'AREA');
      expect(nextId).toBe(3);
    });

    it('should ignore IDs with non-matching prefixes', () => {
      const existingIds = ['THEME-001', 'EPIC-005', 'THEME-002'];
      const nextId = findNextThemeId(existingIds, 'THEME');
      expect(nextId).toBe(3);
    });
  });

  describe('generateThemeMarkdown', () => {
    it('should generate valid theme markdown with all fields', () => {
      const markdown = generateThemeMarkdown({
        id: 'THEME-001',
        title: 'User Onboarding',
        goal: 'Streamline user signup flow',
      });

      expect(markdown).toContain('id: THEME-001');
      expect(markdown).toContain('title: "User Onboarding"');
      expect(markdown).toContain('status: todo');
      expect(markdown).toContain('# User Onboarding');
      expect(markdown).toContain('Streamline user signup flow');
      expect(markdown).toContain('## Epics');
    });

    it('should use placeholder when no goal provided', () => {
      const markdown = generateThemeMarkdown({
        id: 'THEME-002',
        title: 'Payment System',
      });

      expect(markdown).toContain('id: THEME-002');
      expect(markdown).toContain('## Epics');
      // Should have some placeholder text
      expect(markdown).toContain('## Description');
    });

    it('should include created date', () => {
      const markdown = generateThemeMarkdown({
        id: 'THEME-001',
        title: 'Theme with Date',
      });

      expect(markdown).toMatch(/created: \d{4}-\d{2}-\d{2}/);
    });

    it('should quote titles with special characters', () => {
      const markdown = generateThemeMarkdown({
        id: 'THEME-001',
        title: 'Theme: With Colon',
      });

      expect(markdown).toContain('title: "Theme: With Colon"');
    });

    it('should include all standard sections', () => {
      const markdown = generateThemeMarkdown({
        id: 'THEME-001',
        title: 'Full Theme',
        goal: 'Goal here',
      });

      expect(markdown).toContain('## Description');
      expect(markdown).toContain('## Acceptance Criteria');
      expect(markdown).toContain('## Epics');
      expect(markdown).toContain('## Notes');
    });
  });

  describe('generateEpicLink', () => {
    it('should generate a wiki-style link', () => {
      const link = generateEpicLink('EPIC-001', 'User Authentication');
      expect(link).toBe('- [[EPIC-001]] User Authentication');
    });

    it('should handle titles with special characters', () => {
      const link = generateEpicLink('EPIC-002', 'API: REST & GraphQL');
      expect(link).toBe('- [[EPIC-002]] API: REST & GraphQL');
    });
  });

  describe('appendEpicToTheme', () => {
    const themeWithEpicsSection = `---
id: THEME-001
title: "User Onboarding"
status: todo
created: 2025-01-15
---

# User Onboarding

## Description

Overview here.

## Epics

## Notes

Some notes.
`;

    it('should append epic link under ## Epics section', () => {
      const epicLink = '- [[EPIC-001]] Registration';
      const updated = appendEpicToTheme(themeWithEpicsSection, epicLink);

      expect(updated).toContain('## Epics\n\n- [[EPIC-001]] Registration');
    });

    it('should append to existing epic links', () => {
      const contentWithEpics = `---
id: THEME-001
title: "Test"
status: todo
created: 2025-01-15
---

## Epics

- [[EPIC-001]] First Epic

## Notes
`;
      const updated = appendEpicToTheme(contentWithEpics, '- [[EPIC-002]] Second Epic');
      expect(updated).toContain('- [[EPIC-001]] First Epic');
      expect(updated).toContain('- [[EPIC-002]] Second Epic');
    });

    it('should create ## Epics section and append when none exists', () => {
      const noEpicsSection = `---
id: THEME-001
title: "Test"
status: todo
created: 2025-01-15
---

# Test

No epics section here.
`;
      const updated = appendEpicToTheme(noEpicsSection, '- [[EPIC-001]] Some Epic');
      expect(updated).toContain('## Epics');
      expect(updated).toContain('- [[EPIC-001]] Some Epic');
    });
  });
});
