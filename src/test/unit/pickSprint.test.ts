import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePickSprint } from '../../commands/pickSprint';
import { Story } from '../../types/story';

// ── VS Code mock ───────────────────────────────────────────────────────────────
const { mockShowQuickPick } = vi.hoisted(() => ({
  mockShowQuickPick: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showQuickPick: mockShowQuickPick,
  },
  QuickPickItemKind: {
    Separator: -1,
    Default: 0,
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function createStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'STORY-00001',
    title: 'Test story',
    type: 'feature',
    epic: 'EPIC-00001',
    status: 'todo',
    sprint: 'sprint-1',
    size: 'M',
    priority: 500,
    content: '',
    filePath: '/workspace/.devstories/stories/STORY-00001.md',
    created: new Date('2025-01-01'),
    updated: new Date('2025-01-01'),
    ...overrides,
  };
}

function makeStore(stories: Story[] = []) {
  return { getStories: () => stories };
}

function makeSprintFilter(current: string | null = null) {
  const setSprint = vi.fn();
  return { currentSprint: current, setSprint };
}

function makeConfigService(overrides: {
  currentSprint?: string;
  sprintSequence?: string[];
  updateCurrentSprint?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    config: {
      currentSprint: overrides.currentSprint ?? 'sprint-2',
      sprintSequence: overrides.sprintSequence ?? ['sprint-1', 'sprint-2', 'sprint-3'],
    },
    updateCurrentSprint: overrides.updateCurrentSprint ?? vi.fn().mockResolvedValue(undefined),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('executePickSprint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('QuickPick items', () => {
    it('always shows "All Sprints" as first item', async () => {
      mockShowQuickPick.mockResolvedValue(undefined); // cancelled
      const store = makeStore();
      const filter = makeSprintFilter();
      const config = makeConfigService();

      await executePickSprint(store as never, filter as never, config as never);

      const items = mockShowQuickPick.mock.calls[0][0];
      expect(items[0].label).toContain('All Sprints');
      expect(items[0].value).toBe(null);
    });

    it('builds sprint list from sprintSequence in config, not story files', async () => {
      mockShowQuickPick.mockResolvedValue(undefined);
      // Store has a story referencing an ad-hoc sprint not in the config sequence
      const store = makeStore([createStory({ sprint: 'ad-hoc-sprint-99' })]);
      const config = makeConfigService({ sprintSequence: ['sprint-1', 'sprint-2'] });

      await executePickSprint(store as never, makeSprintFilter() as never, config as never);

      const items = mockShowQuickPick.mock.calls[0][0];
      const labels = items.map((i: { label: string }) => i.label);
      expect(labels.some((l: string) => l.includes('sprint-1'))).toBe(true);
      expect(labels.some((l: string) => l.includes('sprint-2'))).toBe(true);
      // ad-hoc sprint from story file should NOT appear
      expect(labels.some((l: string) => l.includes('ad-hoc-sprint-99'))).toBe(false);
    });

    it('marks current sprint from config with "Current Sprint" description', async () => {
      mockShowQuickPick.mockResolvedValue(undefined);
      const config = makeConfigService({ currentSprint: 'sprint-2', sprintSequence: ['sprint-1', 'sprint-2', 'sprint-3'] });

      await executePickSprint(makeStore() as never, makeSprintFilter() as never, config as never);

      const items = mockShowQuickPick.mock.calls[0][0];
      const sprint2Item = items.find((i: { value: string }) => i.value === 'sprint-2');
      expect(sprint2Item?.description).toContain('Current Sprint');
    });

    it('marks currently filtered sprint with "(selected)" in description', async () => {
      mockShowQuickPick.mockResolvedValue(undefined);
      const config = makeConfigService({ sprintSequence: ['sprint-1', 'sprint-2'] });
      const filter = makeSprintFilter('sprint-1'); // sprint-1 is the active filter

      await executePickSprint(makeStore() as never, filter as never, config as never);

      const items = mockShowQuickPick.mock.calls[0][0];
      const sprint1Item = items.find((i: { value: string }) => i.value === 'sprint-1');
      expect(sprint1Item?.description).toContain('selected');
    });

    it('shows Backlog option when backlog stories exist', async () => {
      mockShowQuickPick.mockResolvedValue(undefined);
      const store = makeStore([createStory({ sprint: '' })]);

      await executePickSprint(store as never, makeSprintFilter() as never, makeConfigService() as never);

      const items = mockShowQuickPick.mock.calls[0][0];
      const backlogItem = items.find((i: { value: string }) => i.value === 'backlog');
      expect(backlogItem).toBeDefined();
    });

    it('hides Backlog option when no backlog stories exist', async () => {
      mockShowQuickPick.mockResolvedValue(undefined);
      const store = makeStore([createStory({ sprint: 'sprint-1' })]); // all in a real sprint

      await executePickSprint(store as never, makeSprintFilter() as never, makeConfigService() as never);

      const items = mockShowQuickPick.mock.calls[0][0];
      const backlogItem = items.find((i: { value: string }) => i.value === 'backlog');
      expect(backlogItem).toBeUndefined();
    });
  });

  describe('on sprint selection', () => {
    it('calls setSprint with the selected sprint', async () => {
      const selectedItem = { label: '$(milestone) sprint-3', value: 'sprint-3' };
      mockShowQuickPick.mockResolvedValue(selectedItem);

      const filter = makeSprintFilter();
      const config = makeConfigService();

      await executePickSprint(makeStore() as never, filter as never, config as never);

      expect(filter.setSprint).toHaveBeenCalledWith('sprint-3');
    });

    it('does NOT write to config.json (filter-only — use setCurrentSprint to persist)', async () => {
      const selectedItem = { label: '$(milestone) sprint-3', value: 'sprint-3' };
      mockShowQuickPick.mockResolvedValue(selectedItem);

      const config = makeConfigService();

      await executePickSprint(makeStore() as never, makeSprintFilter() as never, config as never);

      expect(config.updateCurrentSprint).not.toHaveBeenCalled();
    });
  });

  describe('on "All Sprints" selection', () => {
    it('calls setSprint(null) to clear the filter', async () => {
      const allSprintsItem = { label: '$(list-flat) All Sprints', value: null };
      mockShowQuickPick.mockResolvedValue(allSprintsItem);

      const filter = makeSprintFilter('sprint-1');
      const config = makeConfigService();

      await executePickSprint(makeStore() as never, filter as never, config as never);

      expect(filter.setSprint).toHaveBeenCalledWith(null);
    });
  });

  describe('on "Backlog" selection', () => {
    it('calls setSprint("backlog")', async () => {
      const backlogItem = { label: '$(archive) Backlog', value: 'backlog' };
      mockShowQuickPick.mockResolvedValue(backlogItem);

      const store = makeStore([createStory({ sprint: '' })]);
      const filter = makeSprintFilter();
      const config = makeConfigService();

      await executePickSprint(store as never, filter as never, config as never);

      expect(filter.setSprint).toHaveBeenCalledWith('backlog');
    });
  });

  describe('on cancellation', () => {
    it('does nothing when user dismisses the QuickPick', async () => {
      mockShowQuickPick.mockResolvedValue(undefined);

      const filter = makeSprintFilter();
      const config = makeConfigService();

      await executePickSprint(makeStore() as never, filter as never, config as never);

      expect(filter.setSprint).not.toHaveBeenCalled();
    });
  });

  describe('without configService', () => {
    it('still applies the filter even with no configService', async () => {
      const selectedItem = { label: '$(milestone) sprint-1', value: 'sprint-1' };
      mockShowQuickPick.mockResolvedValue(selectedItem);

      const filter = makeSprintFilter();

      // No configService passed
      await executePickSprint(makeStore() as never, filter as never);

      expect(filter.setSprint).toHaveBeenCalledWith('sprint-1');
    });
  });
});
