import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  LINK_PATTERN,
  extractLinks,
  isStoryId,
  isEpicId,
  getIdType,
  resolveLinkPath,
  validateLinks,
} from '../../utils/linkResolver';

describe('LINK_PATTERN', () => {
  it('should match [[ID]] pattern', () => {
    const text = 'See [[DS-001]] for details';
    const matches = [...text.matchAll(LINK_PATTERN)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('DS-001');
  });

  it('should match multiple [[ID]] patterns', () => {
    const text = 'See [[DS-001]] and [[EPIC-002]] for details';
    const matches = [...text.matchAll(LINK_PATTERN)];
    expect(matches).toHaveLength(2);
    expect(matches[0][1]).toBe('DS-001');
    expect(matches[1][1]).toBe('EPIC-002');
  });

  it('should match various ID formats', () => {
    const ids = ['DS-001', 'STORY-123', 'EPIC-001', 'FEAT-99', 'BUG-1'];
    for (const id of ids) {
      const text = `[[${id}]]`;
      const matches = [...text.matchAll(LINK_PATTERN)];
      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe(id);
    }
  });

  it('should not match invalid patterns', () => {
    const invalidPatterns = [
      '[DS-001]',     // single brackets
      '[[ds-001]]',   // lowercase
      '[[DS001]]',    // no dash
      '[[DS-]]',      // no number
      '[[123]]',      // no prefix
      '[[DS-001',     // unclosed
      'DS-001]]',     // no opening
    ];
    for (const pattern of invalidPatterns) {
      const matches = [...pattern.matchAll(LINK_PATTERN)];
      expect(matches).toHaveLength(0);
    }
  });
});

describe('extractLinks', () => {
  it('should extract all links from text', () => {
    const text = `
# Story Title
Depends on [[DS-001]] and [[DS-002]].
See also [[EPIC-001]].
    `;
    const links = extractLinks(text);
    expect(links).toEqual(['DS-001', 'DS-002', 'EPIC-001']);
  });

  it('should return empty array for text without links', () => {
    const text = 'No links here';
    const links = extractLinks(text);
    expect(links).toEqual([]);
  });

  it('should handle duplicate links', () => {
    const text = '[[DS-001]] and again [[DS-001]]';
    const links = extractLinks(text);
    // Returns all occurrences
    expect(links).toEqual(['DS-001', 'DS-001']);
  });
});

describe('isStoryId', () => {
  it('should return true for story IDs', () => {
    expect(isStoryId('DS-001')).toBe(true);
    expect(isStoryId('STORY-123')).toBe(true);
    expect(isStoryId('FEAT-99')).toBe(true);
    expect(isStoryId('BUG-1')).toBe(true);
  });

  it('should return false for epic IDs', () => {
    expect(isStoryId('EPIC-001')).toBe(false);
  });

  it('should return true for custom prefixes (not EPIC)', () => {
    expect(isStoryId('PROJ-001')).toBe(true);
    expect(isStoryId('TASK-001')).toBe(true);
  });
});

describe('isEpicId', () => {
  it('should return true for epic IDs', () => {
    expect(isEpicId('EPIC-001')).toBe(true);
    expect(isEpicId('EPIC-123')).toBe(true);
  });

  it('should return false for story IDs', () => {
    expect(isEpicId('DS-001')).toBe(false);
    expect(isEpicId('STORY-001')).toBe(false);
  });

  it('should handle EPIC-INBOX', () => {
    expect(isEpicId('EPIC-INBOX')).toBe(true);
  });
});

describe('getIdType', () => {
  it('should return epic for EPIC prefix', () => {
    expect(getIdType('EPIC-001')).toBe('epic');
    expect(getIdType('EPIC-INBOX')).toBe('epic');
  });

  it('should return story for non-EPIC prefix', () => {
    expect(getIdType('DS-001')).toBe('story');
    expect(getIdType('STORY-001')).toBe('story');
    expect(getIdType('FEAT-001')).toBe('story');
  });
});

describe('resolveLinkPath', () => {
  const basePath = '/project/.devstories';

  it('should resolve story ID to stories folder', () => {
    const result = resolveLinkPath('DS-001', basePath);
    expect(result).toBe(path.join(basePath, 'stories', 'DS-001.md'));
  });

  it('should resolve epic ID to epics folder', () => {
    const result = resolveLinkPath('EPIC-001', basePath);
    expect(result).toBe(path.join(basePath, 'epics', 'EPIC-001.md'));
  });

  it('should handle EPIC-INBOX', () => {
    const result = resolveLinkPath('EPIC-INBOX', basePath);
    expect(result).toBe(path.join(basePath, 'epics', 'EPIC-INBOX.md'));
  });

  it('should handle various story prefixes', () => {
    expect(resolveLinkPath('STORY-001', basePath)).toBe(path.join(basePath, 'stories', 'STORY-001.md'));
    expect(resolveLinkPath('FEAT-001', basePath)).toBe(path.join(basePath, 'stories', 'FEAT-001.md'));
    expect(resolveLinkPath('BUG-001', basePath)).toBe(path.join(basePath, 'stories', 'BUG-001.md'));
  });
});

describe('validateLinks', () => {
  const knownIds = new Set(['DS-001', 'DS-002', 'EPIC-001']);

  it('should return empty array for all valid links', () => {
    const links = ['DS-001', 'EPIC-001'];
    const broken = validateLinks(links, knownIds);
    expect(broken).toEqual([]);
  });

  it('should return broken links', () => {
    const links = ['DS-001', 'DS-999', 'EPIC-999'];
    const broken = validateLinks(links, knownIds);
    expect(broken).toEqual(['DS-999', 'EPIC-999']);
  });

  it('should handle empty input', () => {
    expect(validateLinks([], knownIds)).toEqual([]);
  });

  it('should handle all broken links', () => {
    const links = ['UNKNOWN-001', 'INVALID-002'];
    const broken = validateLinks(links, knownIds);
    expect(broken).toEqual(['UNKNOWN-001', 'INVALID-002']);
  });
});
