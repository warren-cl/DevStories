import { describe, expect, it } from 'vitest';
import {
  updateStoryEpic,
  updateEpicTheme,
  clearStoryEpic,
  updateStorySprintAndPriority,
  updateStoryPriorityOnly,
} from '../../view/storiesDragAndDropControllerUtils';
import { BrokenFile } from '../../types/brokenFile';
import { Epic } from '../../types/epic';
import { Story } from '../../types/story';
import { Theme } from '../../types/theme';

const STORY_CONTENT = `---
id: DS-001
title: "Test Story"
type: feature
epic: EPIC-001
status: todo
sprint: sprint-1
size: M
assignee: ""
created: 2025-01-15
updated: 2025-01-15
---

# Test Story

Story content.
`;

const EPIC_CONTENT_WITH_THEME = `---
id: EPIC-001
title: "Test Epic"
status: active
theme: THEME-001
created: 2025-01-10
updated: 2025-01-10
---

# Test Epic

Epic content.
`;

const EPIC_CONTENT_NO_THEME = `---
id: EPIC-002
title: "Orphan Epic"
status: active
created: 2025-01-10
updated: 2025-01-10
---

# Orphan Epic

Content.
`;

describe('updateStoryEpic', () => {
  it('should update the epic field to the new epic id', () => {
    const result = updateStoryEpic(STORY_CONTENT, 'EPIC-999');
    expect(result).toContain('epic: EPIC-999');
  });

  it('should not contain the old epic id in the frontmatter', () => {
    const result = updateStoryEpic(STORY_CONTENT, 'EPIC-999');
    // The old epic id should be gone from frontmatter
    const frontmatterMatch = result.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const frontmatter = frontmatterMatch![1];
    expect(frontmatter).not.toContain('EPIC-001');
    expect(frontmatter).toContain('EPIC-999');
  });

  it('should preserve story content below frontmatter', () => {
    const result = updateStoryEpic(STORY_CONTENT, 'EPIC-999');
    expect(result).toContain('# Test Story');
    expect(result).toContain('Story content.');
  });

  it('should bump the updated date', () => {
    const today = new Date().toISOString().split('T')[0];
    const result = updateStoryEpic(STORY_CONTENT, 'EPIC-999');
    // gray-matter may quote the date string (e.g. updated: '2026-02-28')
    expect(result).toMatch(new RegExp(`updated: '?${today}'?`));
  });
});

describe('updateEpicTheme', () => {
  it('should update the theme field to the new theme id', () => {
    const result = updateEpicTheme(EPIC_CONTENT_WITH_THEME, 'THEME-002');
    expect(result).toContain('theme: THEME-002');
    expect(result).not.toContain('THEME-001');
  });

  it('should remove the theme field when newThemeId is undefined', () => {
    const result = updateEpicTheme(EPIC_CONTENT_WITH_THEME, undefined);
    // theme key should be absent from frontmatter
    const frontmatterMatch = result.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const frontmatter = frontmatterMatch![1];
    expect(frontmatter).not.toMatch(/\btheme:/);
  });

  it('should add the theme field when epic previously had none', () => {
    const result = updateEpicTheme(EPIC_CONTENT_NO_THEME, 'THEME-003');
    expect(result).toContain('theme: THEME-003');
  });

  it('should be a no-op structurally when setting undefined on an epic with no theme', () => {
    const result = updateEpicTheme(EPIC_CONTENT_NO_THEME, undefined);
    const frontmatterMatch = result.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const frontmatter = frontmatterMatch![1];
    expect(frontmatter).not.toMatch(/\btheme:/);
  });

  it('should preserve epic content below frontmatter', () => {
    const result = updateEpicTheme(EPIC_CONTENT_WITH_THEME, 'THEME-002');
    expect(result).toContain('# Test Epic');
    expect(result).toContain('Epic content.');
  });

  it('should bump the updated date', () => {
    const today = new Date().toISOString().split('T')[0];
    const result = updateEpicTheme(EPIC_CONTENT_WITH_THEME, 'THEME-002');
    // gray-matter may quote the date string (e.g. updated: '2026-02-28')
    expect(result).toMatch(new RegExp(`updated: '?${today}'?`));
  });
});

const STORY_CONTENT_NO_EPIC = `---
id: DS-002
title: "Orphan Story"
type: task
status: todo
sprint: sprint-2
size: S
created: 2025-03-01
updated: 2025-03-01
---

# Orphan Story

No epic here.
`;

describe('clearStoryEpic', () => {
  it('should remove the epic field from frontmatter', () => {
    const result = clearStoryEpic(STORY_CONTENT);
    const frontmatterMatch = result.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    expect(frontmatterMatch![1]).not.toMatch(/\bepic:/);
  });

  it('should preserve all other frontmatter fields', () => {
    const result = clearStoryEpic(STORY_CONTENT);
    expect(result).toContain('id: DS-001');
    expect(result).toContain('type: feature');
    expect(result).toContain('status: todo');
  });

  it('should preserve story markdown content', () => {
    const result = clearStoryEpic(STORY_CONTENT);
    expect(result).toContain('# Test Story');
    expect(result).toContain('Story content.');
  });

  it('should bump the updated date', () => {
    const today = new Date().toISOString().split('T')[0];
    const result = clearStoryEpic(STORY_CONTENT);
    expect(result).toMatch(new RegExp(`updated: '?${today}'?`));
  });

  it('should not throw when story already has no epic field', () => {
    expect(() => clearStoryEpic(STORY_CONTENT_NO_EPIC)).not.toThrow();
  });

  it('should leave no epic field when story had none to begin with', () => {
    const result = clearStoryEpic(STORY_CONTENT_NO_EPIC);
    const frontmatterMatch = result.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    expect(frontmatterMatch![1]).not.toMatch(/\bepic:/);
  });
});

describe('BrokenFile discriminant', () => {
  const brokenStory: BrokenFile = {
    broken: true,
    id: 'STORY-BAD',
    filePath: '/path/to/STORY-BAD.md',
    error: 'Missing required fields: title',
    fileType: 'story',
  };

  const brokenEpic: BrokenFile = {
    broken: true,
    id: 'EPIC-BAD',
    filePath: '/path/to/EPIC-BAD.md',
    error: 'Invalid frontmatter: No frontmatter found',
    fileType: 'epic',
  };

  const validTheme: Partial<Theme> = { id: 'THEME-001', title: 'My Theme', status: 'active', created: new Date(), content: '' };
  const validEpic: Partial<Epic> = { id: 'EPIC-001', title: 'My Epic', status: 'active', theme: 'THEME-001', created: new Date(), content: '' };
  const validStory: Partial<Story> = { id: 'STORY-001', title: 'My Story', type: 'feature', epic: 'EPIC-001', status: 'todo', size: 'M', priority: 500, created: new Date(), content: '' };

  it('BrokenFile has broken:true discriminant', () => {
    expect(brokenStory.broken).toBe(true);
    expect(brokenEpic.broken).toBe(true);
  });

  it('"broken" in obj correctly identifies BrokenFile vs other types', () => {
    expect('broken' in brokenStory).toBe(true);
    expect('broken' in brokenEpic).toBe(true);
    expect('broken' in validTheme).toBe(false);
    expect('broken' in validEpic).toBe(false);
    expect('broken' in validStory).toBe(false);
  });

  it('fileType field correctly distinguishes story vs epic broken files', () => {
    const all: BrokenFile[] = [brokenStory, brokenEpic];
    expect(all.filter(f => f.fileType === 'story')).toHaveLength(1);
    expect(all.filter(f => f.fileType === 'epic')).toHaveLength(1);
  });
});

// ─── updateStorySprintAndPriority ─────────────────────────────────────────────

describe('updateStorySprintAndPriority', () => {
  it('should update both sprint and priority fields', () => {
    const result = updateStorySprintAndPriority(STORY_CONTENT, 'sprint-5', 42);
    expect(result).toContain('sprint: sprint-5');
    expect(result).toContain('priority: 42');
  });

  it('should not contain old sprint in frontmatter', () => {
    const result = updateStorySprintAndPriority(STORY_CONTENT, 'sprint-5', 1);
    const fm = result.match(/^---\n([\s\S]*?)\n---/)![1];
    expect(fm).not.toContain('sprint-1'); // old sprint gone
    expect(fm).toContain('sprint-5');
  });

  it('should bump the updated date', () => {
    const today = new Date().toISOString().split('T')[0];
    const result = updateStorySprintAndPriority(STORY_CONTENT, 'sprint-5', 1);
    expect(result).toMatch(new RegExp(`updated: '?${today}'?`));
  });

  it('should preserve markdown content below frontmatter', () => {
    const result = updateStorySprintAndPriority(STORY_CONTENT, 'sprint-5', 1);
    expect(result).toContain('# Test Story');
    expect(result).toContain('Story content.');
  });

  it('should handle setting sprint to backlog', () => {
    const result = updateStorySprintAndPriority(STORY_CONTENT, 'backlog', 1);
    expect(result).toContain('sprint: backlog');
    expect(result).toContain('priority: 1');
  });

  it('should work on a story that has no epic or priority field', () => {
    const result = updateStorySprintAndPriority(STORY_CONTENT_NO_EPIC, 'sprint-3', 10);
    expect(result).toContain('sprint: sprint-3');
    expect(result).toContain('priority: 10');
  });
});

// ─── updateStoryPriorityOnly ──────────────────────────────────────────────────

describe('updateStoryPriorityOnly', () => {
  it('should update priority field', () => {
    const result = updateStoryPriorityOnly(STORY_CONTENT, 99);
    expect(result).toContain('priority: 99');
  });

  it('should not change sprint field', () => {
    // Use a fixture with explicit priority to avoid gray-matter reserialization quirks
    const STORY_WITH_PRIORITY = `---
id: DS-001
title: "Test Story"
type: feature
epic: EPIC-001
status: todo
sprint: sprint-1
size: M
priority: 500
created: 2025-01-15
updated: 2025-01-15
---

# Test Story

Story content.
`;
    const result = updateStoryPriorityOnly(STORY_WITH_PRIORITY, 99);
    expect(result).toContain('sprint: sprint-1');
    expect(result).toContain('priority: 99');
  });

  it('should bump the updated date', () => {
    const today = new Date().toISOString().split('T')[0];
    const result = updateStoryPriorityOnly(STORY_CONTENT, 99);
    expect(result).toMatch(new RegExp(`updated: '?${today}'?`));
  });

  it('should preserve markdown content below frontmatter', () => {
    const result = updateStoryPriorityOnly(STORY_CONTENT, 99);
    expect(result).toContain('# Test Story');
    expect(result).toContain('Story content.');
  });

  it('should handle priority of 1', () => {
    const result = updateStoryPriorityOnly(STORY_CONTENT, 1);
    expect(result).toContain('priority: 1');
  });

  it('should handle large priority values', () => {
    const result = updateStoryPriorityOnly(STORY_CONTENT, 10000);
    expect(result).toContain('priority: 10000');
  });
});
