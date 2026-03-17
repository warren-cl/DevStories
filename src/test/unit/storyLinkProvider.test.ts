import { describe, it, expect } from 'vitest';
import {
  findLinksInDocument,
  createDocumentLink,
  LinkMatch,
} from '../../providers/storyLinkProviderUtils';

describe('StoryLinkProvider Utils', () => {
  describe('findLinksInDocument', () => {
    it('should find single link in text', () => {
      const text = 'See [[DS-001]] for details';
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(1);
      expect(links[0].id).toBe('DS-001');
      expect(links[0].start).toBe(4);
      expect(links[0].end).toBe(14);
    });

    it('should find multiple links in text', () => {
      const text = 'Depends on [[DS-001]] and [[DS-002]]';
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(2);
      expect(links[0].id).toBe('DS-001');
      expect(links[1].id).toBe('DS-002');
    });

    it('should find epic links', () => {
      const text = 'Part of [[EPIC-001]]';
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(1);
      expect(links[0].id).toBe('EPIC-001');
    });

    it('should find EPIC-INBOX link', () => {
      const text = 'Goes to [[EPIC-INBOX]]';
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(1);
      expect(links[0].id).toBe('EPIC-INBOX');
    });

    it('should find custom prefix links', () => {
      const text = 'See [[PROJ-123]] and [[FEAT-456]]';
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(2);
      expect(links[0].id).toBe('PROJ-123');
      expect(links[1].id).toBe('FEAT-456');
    });

    it('should return empty array for no links', () => {
      const text = 'No links here';
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(0);
    });

    it('should not match incomplete patterns', () => {
      const text = '[[incomplete and [DS-001] and DS-001]]';
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(0);
    });

    it('should handle multiline text', () => {
      const text = `Line 1 with [[DS-001]]
Line 2 with [[EPIC-002]]
Line 3 no link`;
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(2);
      expect(links[0].id).toBe('DS-001');
      expect(links[1].id).toBe('EPIC-002');
    });

    it('should calculate correct offsets in multiline', () => {
      const text = 'First line\n[[DS-001]]';
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(1);
      expect(links[0].start).toBe(11);
      expect(links[0].end).toBe(21);
    });

    it('should find links in frontmatter dependencies', () => {
      const text = `---
dependencies:
  - [[DS-001]]
  - [[DS-002]]
---`;
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(2);
    });
  });

  describe('createDocumentLink', () => {
    it('should create link when resolveFilePath returns a path', () => {
      const match: LinkMatch = { id: 'DS-001', start: 0, end: 10 };
      const fakePath = '/workspace/.devstories/stories/DS-001-login-form.md';

      const link = createDocumentLink(match, (id) => id === 'DS-001' ? fakePath : undefined);

      expect(link).not.toBeNull();
      expect(link!.targetPath).toBe(fakePath);
    });

    it('should create link for epic via resolveFilePath', () => {
      const match: LinkMatch = { id: 'EPIC-001', start: 0, end: 12 };
      const fakePath = '/workspace/.devstories/epics/EPIC-001-my-epic.md';

      const link = createDocumentLink(match, (id) => id === 'EPIC-001' ? fakePath : undefined);

      expect(link).not.toBeNull();
      expect(link!.targetPath).toBe(fakePath);
    });

    it('should return null when resolveFilePath returns undefined (broken link)', () => {
      const match: LinkMatch = { id: 'DS-999', start: 0, end: 10 };

      const link = createDocumentLink(match, (_id) => undefined);

      expect(link).toBeNull();
    });

    it('should handle EPIC-INBOX via resolveFilePath', () => {
      const match: LinkMatch = { id: 'EPIC-INBOX', start: 0, end: 14 };
      const fakePath = '/workspace/.devstories/epics/EPIC-INBOX-inbox.md';

      const link = createDocumentLink(match, (id) => id === 'EPIC-INBOX' ? fakePath : undefined);

      expect(link).not.toBeNull();
      expect(link!.targetPath).toBe(fakePath);
    });

    it('should preserve start and end positions', () => {
      const match: LinkMatch = { id: 'DS-001', start: 15, end: 25 };
      const fakePath = '/workspace/.devstories/stories/DS-001-some-title.md';

      const link = createDocumentLink(match, (_id) => fakePath);

      expect(link).not.toBeNull();
      expect(link!.start).toBe(15);
      expect(link!.end).toBe(25);
    });
  });

  describe('edge cases', () => {
    it('should handle adjacent links', () => {
      const text = '[[DS-001]][[DS-002]]';
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(2);
      expect(links[0].end).toBe(10);
      expect(links[1].start).toBe(10);
    });

    it('should handle link at start of text', () => {
      const text = '[[DS-001]] is the first story';
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(1);
      expect(links[0].start).toBe(0);
    });

    it('should handle link at end of text', () => {
      const text = 'See [[DS-001]]';
      const links = findLinksInDocument(text);

      expect(links).toHaveLength(1);
      expect(links[0].end).toBe(14);
    });

    it('should handle empty text', () => {
      const links = findLinksInDocument('');
      expect(links).toHaveLength(0);
    });
  });
});
