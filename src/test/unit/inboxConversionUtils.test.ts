import { describe, expect, it } from 'vitest';
import {
  stripDatePrefix,
  titleFromKebabCase,
  fillMissingStoryFrontmatter,
  fillMissingEpicFrontmatter,
  buildConvertedFileContent,
  getDefaultSize,
  getDefaultStatus,
  maxPriority,
  StoryDefaults,
  EpicDefaults,
} from '../../view/inboxConversionUtils';

// ─── stripDatePrefix ────────────────────────────────────────────────────────

describe('stripDatePrefix', () => {
  it('should strip a YYYY-MM-DD- prefix', () => {
    expect(stripDatePrefix('2026-02-15-login-form')).toBe('login-form');
  });

  it('should handle full date with longer slug', () => {
    expect(stripDatePrefix('2025-01-01-add-dark-mode-toggle')).toBe('add-dark-mode-toggle');
  });

  it('should return the original string if no date prefix', () => {
    expect(stripDatePrefix('no-date-prefix')).toBe('no-date-prefix');
  });

  it('should return original if date has no trailing slug', () => {
    expect(stripDatePrefix('2026-02-15')).toBe('2026-02-15');
  });

  it('should handle single character after date', () => {
    expect(stripDatePrefix('2026-01-01-x')).toBe('x');
  });
});

// ─── titleFromKebabCase ─────────────────────────────────────────────────────

describe('titleFromKebabCase', () => {
  it('should convert kebab-case to Title Case', () => {
    expect(titleFromKebabCase('kebab-case-file-name')).toBe('Kebab Case File Name');
  });

  it('should handle single word', () => {
    expect(titleFromKebabCase('api')).toBe('Api');
  });

  it('should return empty string for empty input', () => {
    expect(titleFromKebabCase('')).toBe('');
  });

  it('should handle numbers in slug', () => {
    expect(titleFromKebabCase('fix-v2-login')).toBe('Fix V2 Login');
  });
});

// ─── fillMissingStoryFrontmatter ────────────────────────────────────────────

describe('fillMissingStoryFrontmatter', () => {
  const defaults: StoryDefaults = {
    id: 'STORY-00001',
    title: 'Default Title',
    type: 'feature',
    epic: 'EPIC-001',
    status: 'todo',
    sprint: 'sprint-4',
    size: 'M',
    priority: 1,
    created: '2026-03-02',
    updated: '2026-03-02',
  };

  it('should fill all fields when existingData is empty', () => {
    const result = fillMissingStoryFrontmatter({}, defaults);
    expect(result.id).toBe('STORY-00001');
    expect(result.title).toBe('Default Title');
    expect(result.type).toBe('feature');
    expect(result.epic).toBe('EPIC-001');
    expect(result.status).toBe('todo');
    expect(result.sprint).toBe('sprint-4');
    expect(result.size).toBe('M');
    expect(result.priority).toBe(1);
    expect(result.assignee).toBe('');
    expect(result.dependencies).toEqual([]);
    expect(result.created).toBe('2026-03-02');
    expect(result.updated).toBe('2026-03-02');
  });

  it('should preserve existing title and type', () => {
    const result = fillMissingStoryFrontmatter(
      { title: 'My Title', type: 'bug' },
      defaults,
    );
    expect(result.title).toBe('My Title');
    expect(result.type).toBe('bug');
  });

  it('should always overwrite id, sprint, and priority', () => {
    const result = fillMissingStoryFrontmatter(
      { id: 'OLD-001', sprint: 'sprint-1', priority: 999 },
      defaults,
    );
    expect(result.id).toBe('STORY-00001');
    expect(result.sprint).toBe('sprint-4');
    expect(result.priority).toBe(1);
  });

  it('should always overwrite epic from defaults (drop target determines epic)', () => {
    const result = fillMissingStoryFrontmatter(
      { epic: 'EPIC-002' },
      defaults,
    );
    expect(result.epic).toBe('EPIC-001');
  });

  it('should use default epic when existing data has no epic', () => {
    const result = fillMissingStoryFrontmatter({}, defaults);
    expect(result.epic).toBe('EPIC-001');
  });

  it('should preserve existing size', () => {
    const result = fillMissingStoryFrontmatter({ size: 'XL' }, defaults);
    expect(result.size).toBe('XL');
  });
});

// ─── fillMissingEpicFrontmatter ─────────────────────────────────────────────

describe('fillMissingEpicFrontmatter', () => {
  const defaults: EpicDefaults = {
    id: 'EPIC-0001',
    title: 'Default Epic',
    status: 'todo',
    priority: 5,
    theme: 'THEME-001',
    created: '2026-03-02',
  };

  it('should fill all fields when existingData is empty', () => {
    const result = fillMissingEpicFrontmatter({}, defaults);
    expect(result.id).toBe('EPIC-0001');
    expect(result.title).toBe('Default Epic');
    expect(result.status).toBe('todo');
    expect(result.priority).toBe(5);
    expect(result.theme).toBe('THEME-001');
    expect(result.created).toBe('2026-03-02');
  });

  it('should preserve existing title', () => {
    const result = fillMissingEpicFrontmatter({ title: 'My Epic' }, defaults);
    expect(result.title).toBe('My Epic');
  });

  it('should always overwrite id, priority, and theme', () => {
    const result = fillMissingEpicFrontmatter(
      { id: 'OLD-001', priority: 999, theme: 'OLD-THEME' },
      defaults,
    );
    expect(result.id).toBe('EPIC-0001');
    expect(result.priority).toBe(5);
    expect(result.theme).toBe('THEME-001');
  });

  it('should delete theme when defaults.theme is empty', () => {
    const noThemeDefaults: EpicDefaults = { ...defaults, theme: '' };
    const result = fillMissingEpicFrontmatter({ theme: 'OLD' }, noThemeDefaults);
    expect(result.theme).toBeUndefined();
  });
});

// ─── buildConvertedFileContent ──────────────────────────────────────────────

describe('buildConvertedFileContent', () => {
  it('should preserve body content and replace frontmatter', () => {
    const original = `---
title: Old Title
---

# My Document

Body content here.
`;
    const newData = { id: 'STORY-00001', title: 'New Title', status: 'todo' };
    const result = buildConvertedFileContent(original, newData);

    // Body should be preserved
    expect(result).toContain('# My Document');
    expect(result).toContain('Body content here.');
    // New frontmatter fields should be present
    expect(result).toContain('id: STORY-00001');
    expect(result).toContain('title: New Title');
    expect(result).toContain('status: todo');
    // Old title should be updated
    expect(result).not.toContain('title: Old Title');
  });

  it('should handle files with no existing frontmatter', () => {
    const original = `# Just a heading

Some notes.
`;
    const newData = { id: 'STORY-00001', title: 'My Story', type: 'feature' };
    const result = buildConvertedFileContent(original, newData);

    expect(result).toContain('id: STORY-00001');
    expect(result).toContain('# Just a heading');
    expect(result).toContain('Some notes.');
  });

  it('should handle file with partial frontmatter', () => {
    const original = `---
title: Partial
size: L
---

Content.
`;
    const newData = { id: 'STORY-00001', title: 'Partial', size: 'L', status: 'todo', type: 'feature' };
    const result = buildConvertedFileContent(original, newData);

    expect(result).toContain('id: STORY-00001');
    expect(result).toContain('title: Partial');
    expect(result).toContain('size: L');
    expect(result).toContain('status: todo');
    expect(result).toContain('Content.');
  });
});

// ─── getDefaultSize ─────────────────────────────────────────────────────────

describe('getDefaultSize', () => {
  it('should return middle size', () => {
    expect(getDefaultSize(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'])).toBe('M');
  });

  it('should return M for empty sizes', () => {
    expect(getDefaultSize([])).toBe('M');
  });

  it('should handle single size', () => {
    expect(getDefaultSize(['S'])).toBe('S');
  });
});

// ─── getDefaultStatus ───────────────────────────────────────────────────────

describe('getDefaultStatus', () => {
  it('should return first status id', () => {
    expect(getDefaultStatus([{ id: 'todo' }, { id: 'in_progress' }, { id: 'done' }])).toBe('todo');
  });

  it('should fallback to todo for empty array', () => {
    expect(getDefaultStatus([])).toBe('todo');
  });
});

// ─── maxPriority ────────────────────────────────────────────────────────────

describe('maxPriority', () => {
  it('should return max priority from items', () => {
    expect(maxPriority([{ priority: 1 }, { priority: 5 }, { priority: 3 }])).toBe(5);
  });

  it('should return 0 for empty array', () => {
    expect(maxPriority([])).toBe(0);
  });

  it('should handle single item', () => {
    expect(maxPriority([{ priority: 42 }])).toBe(42);
  });
});
