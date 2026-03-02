import matter from 'gray-matter';
import { Epic, EpicStatus } from '../types/epic';
import { Story, StorySize, StoryStatus, StoryType } from '../types/story';
import { Theme, ThemeStatus } from '../types/theme';
import { validateStoryTitle, validateEpicName, validateThemeName } from '../utils/inputValidation';

export class Parser {
  static parseStory(content: string, filePath?: string): Story {
    const parsed = matter(content);
    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      throw new Error('Invalid frontmatter: No frontmatter found');
    }

    // Required fields (epic is optional — missing/empty stories appear under "No Epic")
    if (!data.id || !data.title || !data.type || !data.status || !data.size || !data.created) {
      throw new Error('Missing required fields: id, title, type, status, size, created');
    }

    // Validate title content
    const titleValidation = validateStoryTitle(data.title);
    if (!titleValidation.valid) {
      throw new Error(titleValidation.error);
    }

    return {
      id: data.id,
      title: data.title,
      type: data.type as StoryType,
      epic: data.epic ?? '',
      status: data.status as StoryStatus,
      sprint: data.sprint,
      size: data.size as StorySize,
      priority: data.priority ?? 500,
      assignee: data.assignee,
      dependencies: data.dependencies || [],
      created: new Date(data.created),
      updated: data.updated ? new Date(data.updated) : undefined,
      dateDone: data.date_done ? new Date(data.date_done) : undefined,
      content: parsed.content,
      filePath: filePath
    };
  }

  static parseEpic(content: string, filePath?: string): Epic {
    const parsed = matter(content);
    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      throw new Error('Invalid frontmatter: No frontmatter found');
    }

    if (!data.id || !data.title || !data.status || !data.created) {
      throw new Error('Missing required fields: id, title, status, created');
    }

    // Validate title content
    const titleValidation = validateEpicName(data.title);
    if (!titleValidation.valid) {
      throw new Error(titleValidation.error);
    }

    return {
      id: data.id,
      title: data.title,
      status: data.status as EpicStatus,
      theme: data.theme,
      priority: data.priority ?? 500,
      created: new Date(data.created),
      updated: data.updated ? new Date(data.updated) : undefined,
      content: parsed.content,
      filePath: filePath
    };
  }

  static parseTheme(content: string, filePath?: string): Theme {
    const parsed = matter(content);
    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      throw new Error('Invalid frontmatter: No frontmatter found');
    }

    if (!data.id || !data.title || !data.status || !data.created) {
      throw new Error('Missing required fields: id, title, status, created');
    }

    // Validate title content
    const titleValidation = validateThemeName(data.title);
    if (!titleValidation.valid) {
      throw new Error(titleValidation.error);
    }

    return {
      id: data.id,
      title: data.title,
      status: data.status as ThemeStatus,
      priority: data.priority ?? 500,
      created: new Date(data.created),
      updated: data.updated ? new Date(data.updated) : undefined,
      content: parsed.content,
      filePath: filePath
    };
  }
}
