import matter from 'gray-matter';
import { Epic, EpicStatus } from '../types/epic';
import { Story, StorySize, StoryStatus, StoryType } from '../types/story';
import { Task, TaskType, TaskStatus } from '../types/task';
import { Theme, ThemeStatus } from '../types/theme';
import { validateStoryTitle, validateEpicName, validateThemeName } from '../utils/inputValidation';
import { normalizeTaskFrontmatter, NormalizationResult } from './taskParserUtils';

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
      completedOn: data.completed_on ? new Date(data.completed_on) : undefined,
      workflow: data.workflow,
      author: data.author,
      owner: data.owner,
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
      workflow: data.workflow,
      author: data.author,
      owner: data.owner,
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
      workflow: data.workflow,
      author: data.author,
      owner: data.owner,
      content: parsed.content,
      filePath: filePath
    };
  }

  static parseTask(content: string, filePath?: string): { task: Task; changed: boolean; normalizedData: Record<string, unknown>; markdownBody: string } {
    const parsed = matter(content);
    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      throw new Error('Invalid frontmatter: No frontmatter found');
    }

    // Normalize: map aliases, derive from path/filename, fill defaults
    const { normalized, changed }: NormalizationResult =
      normalizeTaskFrontmatter(data as Record<string, unknown>, filePath ?? '');

    return {
      task: {
        id: normalized.id as string,
        title: normalized.title as string,
        taskType: normalized.task_type as TaskType,
        story: normalized.story as string,
        assignedAgent: normalized.assigned_agent as string | undefined,
        status: normalized.status as TaskStatus,
        dependencies: (normalized.dependencies as string[]) || [],
        priority: (normalized.priority as number) ?? 1,
        created: new Date(normalized.created as string),
        updated: normalized.updated ? new Date(normalized.updated as string) : undefined,
        completedOn: normalized.completed_on ? new Date(normalized.completed_on as string) : undefined,
        content: parsed.content,
        filePath: filePath,
      },
      changed,
      normalizedData: normalized,
      markdownBody: parsed.content,
    };
  }
}
