import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSetCurrentSprint } from '../../commands/setCurrentSprint';

// ── Logger mock ────────────────────────────────────────────────────────────────
vi.mock('../../core/logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// ── VS Code mock ───────────────────────────────────────────────────────────────
const { mockShowQuickPick, mockShowWarningMessage } = vi.hoisted(() => ({
  mockShowQuickPick: vi.fn(),
  mockShowWarningMessage: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showQuickPick: mockShowQuickPick,
    showWarningMessage: mockShowWarningMessage,
  },
  QuickPickItemKind: {
    Separator: -1,
    Default: 0,
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────
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

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('executeSetCurrentSprint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows QuickPick with sprints from sprintSequence', async () => {
    mockShowQuickPick.mockResolvedValue(undefined); // cancelled
    const filter = makeSprintFilter();
    const config = makeConfigService({ sprintSequence: ['sprint-1', 'sprint-2', 'sprint-3'] });

    await executeSetCurrentSprint(filter as never, config as never);

    const items = mockShowQuickPick.mock.calls[0][0];
    const values = items.map((i: { value: string }) => i.value);
    expect(values).toEqual(['sprint-1', 'sprint-2', 'sprint-3']);
  });

  it('marks the current sprint with "(current)" description', async () => {
    mockShowQuickPick.mockResolvedValue(undefined);
    const config = makeConfigService({ currentSprint: 'sprint-2', sprintSequence: ['sprint-1', 'sprint-2', 'sprint-3'] });

    await executeSetCurrentSprint(makeSprintFilter() as never, config as never);

    const items = mockShowQuickPick.mock.calls[0][0];
    const sprint2 = items.find((i: { value: string }) => i.value === 'sprint-2');
    expect(sprint2?.description).toContain('current');
  });

  it('writes the selected sprint to config.json', async () => {
    const selectedItem = { label: '$(milestone) sprint-3', value: 'sprint-3' };
    mockShowQuickPick.mockResolvedValue(selectedItem);

    const config = makeConfigService();
    const filter = makeSprintFilter();

    await executeSetCurrentSprint(filter as never, config as never);

    expect(config.updateCurrentSprint).toHaveBeenCalledWith('sprint-3');
  });

  it('sets the sprint filter to match the selected sprint', async () => {
    const selectedItem = { label: '$(milestone) sprint-3', value: 'sprint-3' };
    mockShowQuickPick.mockResolvedValue(selectedItem);

    const config = makeConfigService();
    const filter = makeSprintFilter();

    await executeSetCurrentSprint(filter as never, config as never);

    expect(filter.setSprint).toHaveBeenCalledWith('sprint-3');
  });

  it('does nothing when user cancels', async () => {
    mockShowQuickPick.mockResolvedValue(undefined);

    const config = makeConfigService();
    const filter = makeSprintFilter();

    await executeSetCurrentSprint(filter as never, config as never);

    expect(config.updateCurrentSprint).not.toHaveBeenCalled();
    expect(filter.setSprint).not.toHaveBeenCalled();
  });

  it('shows warning and returns early if config write fails', async () => {
    const selectedItem = { label: '$(milestone) sprint-3', value: 'sprint-3' };
    mockShowQuickPick.mockResolvedValue(selectedItem);

    const config = makeConfigService({
      updateCurrentSprint: vi.fn().mockRejectedValue(new Error('FS write failed')),
    });
    const filter = makeSprintFilter();

    await executeSetCurrentSprint(filter as never, config as never);

    expect(mockShowWarningMessage).toHaveBeenCalled();
    // Filter should NOT be applied if config write fails
    expect(filter.setSprint).not.toHaveBeenCalled();
  });

  it('shows warning when no sprints are configured', async () => {
    const config = makeConfigService({ sprintSequence: [] });
    const filter = makeSprintFilter();

    await executeSetCurrentSprint(filter as never, config as never);

    expect(mockShowWarningMessage).toHaveBeenCalled();
    expect(mockShowQuickPick).not.toHaveBeenCalled();
  });
});
