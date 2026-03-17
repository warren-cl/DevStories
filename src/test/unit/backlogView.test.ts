import { describe, it, expect } from 'vitest';
import {
  groupStoriesBySprint,
  isBacklogStory,
  getTreeViewTitle,
  ViewMode,
} from '../../view/storiesProviderUtils';
import { Story, StoryType, StorySize } from '../../types/story';
import { BrokenFile } from '../../types/brokenFile';
import { SprintNode, BACKLOG_SPRINT_ID, isSprintNode } from '../../types/sprintNode';

// Helper to create mock stories
function createMockStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'STORY-001',
    title: 'Test Story',
    type: 'feature' as StoryType,
    epic: 'EPIC-001',
    status: 'todo',
    size: 'M' as StorySize,
    priority: 500,
    created: new Date('2025-01-15'),
    content: '',
    ...overrides,
  };
}

function createBrokenFile(overrides: Partial<BrokenFile> = {}): BrokenFile {
  return {
    broken: true,
    id: 'BROKEN-001',
    filePath: '/path/to/broken.md',
    error: 'Parse error',
    fileType: 'story',
    ...overrides,
  };
}

describe('Backlog View Utilities', () => {

  describe('SprintNode type', () => {
    it('isSprintNode returns true for a valid SprintNode', () => {
      const node: SprintNode = { _kind: 'sprintNode', sprintId: 'sprint-1', label: 'Sprint 1', isBacklog: false };
      expect(isSprintNode(node)).toBe(true);
    });

    it('isSprintNode returns false for a Story', () => {
      const story = createMockStory();
      expect(isSprintNode(story)).toBe(false);
    });

    it('isSprintNode returns false for null/undefined', () => {
      expect(isSprintNode(null)).toBe(false);
      expect(isSprintNode(undefined)).toBe(false);
    });

    it('BACKLOG_SPRINT_ID is __BACKLOG__', () => {
      expect(BACKLOG_SPRINT_ID).toBe('__BACKLOG__');
    });
  });

  describe('isBacklogStory', () => {
    const sprintSequence = ['sprint-1', 'sprint-2', 'sprint-3'];

    it('returns true when story has no sprint', () => {
      const story = createMockStory({ sprint: undefined });
      expect(isBacklogStory(story, sprintSequence)).toBe(true);
    });

    it('returns true when story has empty sprint', () => {
      const story = createMockStory({ sprint: '' });
      expect(isBacklogStory(story, sprintSequence)).toBe(true);
    });

    it('returns true when story sprint is "backlog"', () => {
      const story = createMockStory({ sprint: 'backlog' });
      expect(isBacklogStory(story, sprintSequence)).toBe(true);
    });

    it('returns true when story sprint is not in sprintSequence', () => {
      const story = createMockStory({ sprint: 'sprint-43' });
      expect(isBacklogStory(story, sprintSequence)).toBe(true);
    });

    it('returns false when story sprint is in sprintSequence', () => {
      const story = createMockStory({ sprint: 'sprint-2' });
      expect(isBacklogStory(story, sprintSequence)).toBe(false);
    });

    it('returns true when sprintSequence contains "backlog" and story sprint is "backlog"', () => {
      const seqWithBacklog = ['sprint-1', 'sprint-2', 'backlog'];
      const story = createMockStory({ sprint: 'backlog' });
      expect(isBacklogStory(story, seqWithBacklog)).toBe(true);
    });

    it('returns true when sprintSequence contains "Backlog" (case-insensitive)', () => {
      const seqWithBacklog = ['sprint-1', 'Backlog', 'sprint-2'];
      const story = createMockStory({ sprint: 'Backlog' });
      expect(isBacklogStory(story, seqWithBacklog)).toBe(true);
    });
  });

  describe('groupStoriesBySprint', () => {
    const sprintSequence = ['sprint-1', 'sprint-2', 'sprint-3'];

    it('creates a group for each sprint plus backlog', () => {
      const result = groupStoriesBySprint([], [], sprintSequence);
      expect(result.size).toBe(4); // 3 sprints + backlog
      expect(result.has('sprint-1')).toBe(true);
      expect(result.has('sprint-2')).toBe(true);
      expect(result.has('sprint-3')).toBe(true);
      expect(result.has(BACKLOG_SPRINT_ID)).toBe(true);
    });

    it('places stories in the correct sprint bucket', () => {
      const stories = [
        createMockStory({ id: 'S-1', sprint: 'sprint-1' }),
        createMockStory({ id: 'S-2', sprint: 'sprint-2' }),
        createMockStory({ id: 'S-3', sprint: 'sprint-1' }),
      ];
      const result = groupStoriesBySprint(stories, [], sprintSequence);
      expect(result.get('sprint-1')!.length).toBe(2);
      expect(result.get('sprint-2')!.length).toBe(1);
      expect(result.get('sprint-3')!.length).toBe(0);
      expect(result.get(BACKLOG_SPRINT_ID)!.length).toBe(0);
    });

    it('places unassigned stories in backlog', () => {
      const stories = [
        createMockStory({ id: 'S-1', sprint: undefined }),
        createMockStory({ id: 'S-2', sprint: '' }),
        createMockStory({ id: 'S-3', sprint: 'backlog' }),
      ];
      const result = groupStoriesBySprint(stories, [], sprintSequence);
      expect(result.get(BACKLOG_SPRINT_ID)!.length).toBe(3);
    });

    it('places stories with unrecognized sprints in backlog (catch-all)', () => {
      const stories = [
        createMockStory({ id: 'S-1', sprint: 'sprint-43' }),
        createMockStory({ id: 'S-2', sprint: 'future-sprint' }),
      ];
      const result = groupStoriesBySprint(stories, [], sprintSequence);
      expect(result.get(BACKLOG_SPRINT_ID)!.length).toBe(2);
    });

    it('attaches broken stories as a side property', () => {
      const broken = [createBrokenFile({ id: 'BROKEN-1' })];
      const result = groupStoriesBySprint([], broken, sprintSequence);
      expect(result.brokenStories.length).toBe(1);
      expect(result.brokenStories[0].id).toBe('BROKEN-1');
    });

    it('does not create a separate group when sprintSequence contains "backlog"', () => {
      const seqWithBacklog = ['sprint-1', 'sprint-2', 'backlog'];
      const result = groupStoriesBySprint([], [], seqWithBacklog);
      // 'backlog' is filtered out → 2 sprints + sentinel = 3 groups
      expect(result.size).toBe(3);
      expect(result.has('backlog')).toBe(false);
      expect(result.has('sprint-1')).toBe(true);
      expect(result.has('sprint-2')).toBe(true);
      expect(result.has(BACKLOG_SPRINT_ID)).toBe(true);
    });

    it('routes stories with sprint="backlog" to sentinel even when in sprintSequence', () => {
      const seqWithBacklog = ['sprint-1', 'backlog'];
      const stories = [
        createMockStory({ id: 'S-1', sprint: 'backlog' }),
        createMockStory({ id: 'S-2', sprint: 'sprint-1' }),
      ];
      const result = groupStoriesBySprint(stories, [], seqWithBacklog);
      expect(result.get(BACKLOG_SPRINT_ID)!.length).toBe(1);
      expect(result.get('sprint-1')!.length).toBe(1);
      expect(result.has('backlog')).toBe(false);
    });
  });

  describe('getTreeViewTitle with viewMode', () => {
    it('defaults to BACKLOG prefix when no viewMode specified', () => {
      expect(getTreeViewTitle('sprint-4', null)).toBe('BACKLOG: Current sprint-4');
    });

    it('uses BREAKDOWN prefix in breakdown mode', () => {
      expect(getTreeViewTitle('sprint-4', null, 'breakdown')).toBe('BREAKDOWN: Current sprint-4');
    });

    it('uses BACKLOG prefix in backlog mode', () => {
      expect(getTreeViewTitle('sprint-4', null, 'backlog')).toBe('BACKLOG: Current sprint-4');
    });

    it('includes sprint filter info with prefix', () => {
      expect(getTreeViewTitle('sprint-4', 'sprint-3', 'breakdown'))
        .toBe('BREAKDOWN: Current sprint-4: Showing sprint-3');
    });

    it('shows Backlog filter with prefix', () => {
      expect(getTreeViewTitle('sprint-4', 'backlog', 'backlog'))
        .toBe('BACKLOG: Current sprint-4: Showing Backlog');
    });

    it('shows (none) with prefix when no current sprint', () => {
      expect(getTreeViewTitle(null, null, 'breakdown'))
        .toBe('BREAKDOWN: Current (none)');
    });
  });

  describe('ViewMode type', () => {
    it('accepts breakdown and backlog as valid values', () => {
      const breakdown: ViewMode = 'breakdown';
      const backlog: ViewMode = 'backlog';
      expect(breakdown).toBe('breakdown');
      expect(backlog).toBe('backlog');
    });
  });
});
