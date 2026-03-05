import { describe, it, expect } from 'vitest';
import {
  detectFieldAtCursor,
  getStatusCompletions,
  getTypeCompletions,
  getSizeCompletions,
  getSprintCompletions,
  detectEpicField,
  detectDependencyContext,
  detectLinkTrigger,
  getEpicCompletions,
  getStoryCompletions,
  getAllIdCompletions,
  CompletionData,
} from '../../providers/frontmatterCompletionProviderUtils';
import { StatusDef } from '../../core/configServiceUtils';
import { StorySize, Story } from '../../types/story';
import { Epic } from '../../types/epic';

describe('frontmatterCompletionProviderUtils', () => {
  describe('detectFieldAtCursor', () => {
    it('should detect status field', () => {
      expect(detectFieldAtCursor('status: ', 8)).toBe('status');
      expect(detectFieldAtCursor('status:', 7)).toBe('status');
      expect(detectFieldAtCursor('status: todo', 8)).toBe('status');
    });

    it('should detect type field', () => {
      expect(detectFieldAtCursor('type: ', 6)).toBe('type');
      expect(detectFieldAtCursor('type:', 5)).toBe('type');
      expect(detectFieldAtCursor('type: feat', 10)).toBe('type');
    });

    it('should detect size field', () => {
      expect(detectFieldAtCursor('size: ', 6)).toBe('size');
      expect(detectFieldAtCursor('size:', 5)).toBe('size');
      expect(detectFieldAtCursor('size: M', 7)).toBe('size');
    });

    it('should detect sprint field', () => {
      expect(detectFieldAtCursor('sprint: ', 8)).toBe('sprint');
      expect(detectFieldAtCursor('sprint:', 7)).toBe('sprint');
      expect(detectFieldAtCursor('sprint: 1.1.0', 13)).toBe('sprint');
    });

    it('should return null for non-enum fields', () => {
      expect(detectFieldAtCursor('id: DS-001', 10)).toBeNull();
      expect(detectFieldAtCursor('title: My story', 15)).toBeNull();
      expect(detectFieldAtCursor('epic: EPIC-001', 14)).toBeNull();
      expect(detectFieldAtCursor('assignee: john', 14)).toBeNull();
    });

    it('should return null when cursor is before colon', () => {
      expect(detectFieldAtCursor('status: todo', 3)).toBeNull();
      expect(detectFieldAtCursor('type: feature', 2)).toBeNull();
    });

    it('should return null for empty line', () => {
      expect(detectFieldAtCursor('', 0)).toBeNull();
    });

    it('should return null for line without colon', () => {
      expect(detectFieldAtCursor('some text without field', 10)).toBeNull();
    });

    it('should handle indented lines (dependencies array context)', () => {
      // In YAML array context, don't trigger on these
      expect(detectFieldAtCursor('  - DS-001', 10)).toBeNull();
    });
  });

  describe('getStatusCompletions', () => {
    const statuses: StatusDef[] = [
      { id: 'todo', label: 'To Do' },
      { id: 'in_progress', label: 'In Progress' },
      { id: 'done', label: 'Done' },
    ];

    it('should return completion for each status', () => {
      const completions = getStatusCompletions(statuses);
      expect(completions).toHaveLength(3);
    });

    it('should use status id as value', () => {
      const completions = getStatusCompletions(statuses);
      expect(completions[0].value).toBe('todo');
      expect(completions[1].value).toBe('in_progress');
      expect(completions[2].value).toBe('done');
    });

    it('should use status label as detail', () => {
      const completions = getStatusCompletions(statuses);
      expect(completions[0].detail).toBe('To Do');
      expect(completions[1].detail).toBe('In Progress');
      expect(completions[2].detail).toBe('Done');
    });

    it('should return empty array for empty statuses', () => {
      const completions = getStatusCompletions([]);
      expect(completions).toHaveLength(0);
    });
  });

  describe('getTypeCompletions', () => {
    it('should return all five story types', () => {
      const completions = getTypeCompletions();
      expect(completions).toHaveLength(5);
    });

    it('should include feature, bug, task, chore, spike', () => {
      const completions = getTypeCompletions();
      const values = completions.map(c => c.value);
      expect(values).toContain('feature');
      expect(values).toContain('bug');
      expect(values).toContain('task');
      expect(values).toContain('chore');
      expect(values).toContain('spike');
    });

    it('should have descriptions for each type', () => {
      const completions = getTypeCompletions();
      completions.forEach(c => {
        expect(c.detail).toBeDefined();
        expect(c.detail?.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getSizeCompletions', () => {
    const sizes: StorySize[] = ['XS', 'S', 'M', 'L', 'XL'];

    it('should return completion for each size', () => {
      const completions = getSizeCompletions(sizes);
      expect(completions).toHaveLength(5);
    });

    it('should use size as value', () => {
      const completions = getSizeCompletions(sizes);
      expect(completions.map(c => c.value)).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    });

    it('should have descriptions for each size', () => {
      const completions = getSizeCompletions(sizes);
      expect(completions[0].detail).toBe('Extra Small');
      expect(completions[1].detail).toBe('Small');
      expect(completions[2].detail).toBe('Medium');
      expect(completions[3].detail).toBe('Large');
      expect(completions[4].detail).toBe('Extra Large');
    });

    it('should return empty array for empty sizes', () => {
      const completions = getSizeCompletions([]);
      expect(completions).toHaveLength(0);
    });
  });

  describe('getSprintCompletions', () => {
    const sprints = ['sprint-1', 'sprint-2', '1.1.0-intellisense'];

    it('should return completion for each sprint', () => {
      const completions = getSprintCompletions(sprints);
      expect(completions).toHaveLength(3);
    });

    it('should use sprint name as value', () => {
      const completions = getSprintCompletions(sprints);
      expect(completions[0].value).toBe('sprint-1');
      expect(completions[1].value).toBe('sprint-2');
      expect(completions[2].value).toBe('1.1.0-intellisense');
    });

    it('should return empty array for empty sprints', () => {
      const completions = getSprintCompletions([]);
      expect(completions).toHaveLength(0);
    });
  });

  describe('detectEpicField', () => {
    it('should detect epic field', () => {
      expect(detectEpicField('epic: ', 6)).toBe(true);
      expect(detectEpicField('epic:', 5)).toBe(true);
      expect(detectEpicField('epic: EPIC-001', 14)).toBe(true);
    });

    it('should return false for other fields', () => {
      expect(detectEpicField('status: todo', 10)).toBe(false);
      expect(detectEpicField('id: DS-001', 10)).toBe(false);
    });

    it('should return false when cursor is before colon', () => {
      expect(detectEpicField('epic: EPIC-001', 3)).toBe(false);
    });
  });

  describe('detectDependencyContext', () => {
    it('should detect array item under dependencies', () => {
      const lines = [
        '---',
        'dependencies:',
        '  - DS-001',
        '  - ',
        '---',
      ];
      expect(detectDependencyContext(lines, 3, 4)).toBe(true);
    });

    it('should detect first item right after dependencies:', () => {
      const lines = [
        '---',
        'dependencies:',
        '  - ',
        '---',
      ];
      expect(detectDependencyContext(lines, 2, 4)).toBe(true);
    });

    it('should return false for non-array lines', () => {
      const lines = [
        '---',
        'status: todo',
        '---',
      ];
      expect(detectDependencyContext(lines, 1, 10)).toBe(false);
    });

    it('should return false for array items not under dependencies', () => {
      const lines = [
        '---',
        'other_array:',
        '  - item',
        '---',
      ];
      expect(detectDependencyContext(lines, 2, 6)).toBe(false);
    });

    it('should return false outside frontmatter', () => {
      const lines = [
        '---',
        'dependencies:',
        '  - DS-001',
        '---',
        '- bullet point',
      ];
      expect(detectDependencyContext(lines, 4, 5)).toBe(false);
    });
  });

  describe('detectLinkTrigger', () => {
    it('should detect [[ pattern', () => {
      expect(detectLinkTrigger('See [[', 6)).toBe(true);
      expect(detectLinkTrigger('[[', 2)).toBe(true);
    });

    it('should detect partial ID after [[', () => {
      expect(detectLinkTrigger('See [[DS', 8)).toBe(true);
      expect(detectLinkTrigger('[[EPIC-', 7)).toBe(true);
    });

    it('should return false for single [', () => {
      expect(detectLinkTrigger('[link]', 1)).toBe(false);
    });

    it('should return false after closing ]]', () => {
      expect(detectLinkTrigger('See [[DS-001]]', 14)).toBe(false);
    });

    it('should return false for empty line', () => {
      expect(detectLinkTrigger('', 0)).toBe(false);
    });
  });

  describe('getEpicCompletions', () => {
    const epics: Pick<Epic, 'id' | 'title'>[] = [
      { id: 'EPIC-001', title: 'First Epic' },
      { id: 'EPIC-002', title: 'Second Epic' },
    ];

    it('should return completion for each epic', () => {
      const completions = getEpicCompletions(epics);
      expect(completions).toHaveLength(3); // 2 epics + EPIC-INBOX
    });

    it('should always include EPIC-INBOX', () => {
      const completions = getEpicCompletions([]);
      expect(completions).toHaveLength(1);
      expect(completions[0].value).toBe('EPIC-INBOX');
    });

    it('should use epic id as value', () => {
      const completions = getEpicCompletions(epics);
      expect(completions.map(c => c.value)).toContain('EPIC-001');
      expect(completions.map(c => c.value)).toContain('EPIC-002');
    });

    it('should use epic title as detail', () => {
      const completions = getEpicCompletions(epics);
      const epic001 = completions.find(c => c.value === 'EPIC-001');
      expect(epic001?.detail).toBe('First Epic');
    });

    it('should have description for EPIC-INBOX', () => {
      const completions = getEpicCompletions([]);
      expect(completions[0].detail).toBeDefined();
    });
  });

  describe('getStoryCompletions', () => {
    const stories: Pick<Story, 'id' | 'title'>[] = [
      { id: 'DS-001', title: 'First Story' },
      { id: 'DS-002', title: 'Second Story' },
    ];

    it('should return completion for each story', () => {
      const completions = getStoryCompletions(stories);
      expect(completions).toHaveLength(2);
    });

    it('should use story id as value', () => {
      const completions = getStoryCompletions(stories);
      expect(completions[0].value).toBe('DS-001');
      expect(completions[1].value).toBe('DS-002');
    });

    it('should use story title as detail', () => {
      const completions = getStoryCompletions(stories);
      expect(completions[0].detail).toBe('First Story');
      expect(completions[1].detail).toBe('Second Story');
    });

    it('should return empty array for empty stories', () => {
      const completions = getStoryCompletions([]);
      expect(completions).toHaveLength(0);
    });
  });

  describe('getAllIdCompletions', () => {
    const stories: Pick<Story, 'id' | 'title'>[] = [
      { id: 'DS-001', title: 'First Story' },
    ];
    const epics: Pick<Epic, 'id' | 'title'>[] = [
      { id: 'EPIC-001', title: 'First Epic' },
    ];

    it('should include both stories and epics', () => {
      const completions = getAllIdCompletions(stories, epics);
      const values = completions.map(c => c.value);
      expect(values).toContain('DS-001');
      expect(values).toContain('EPIC-001');
    });

    it('should include EPIC-INBOX', () => {
      const completions = getAllIdCompletions([], []);
      expect(completions.map(c => c.value)).toContain('EPIC-INBOX');
    });

    it('should combine all ids', () => {
      const completions = getAllIdCompletions(stories, epics);
      // 1 story + 1 epic + EPIC-INBOX
      expect(completions).toHaveLength(3);
    });
  });
});
