import { describe, it, expect, beforeAll } from 'vitest';
import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';

describe('Frontmatter JSON Schemas', () => {
  let ajv: Ajv;
  let storySchema: object;
  let epicSchema: object;
  let commonSchema: object;

  beforeAll(() => {
    ajv = new Ajv({ strict: false });

    const schemasDir = path.join(__dirname, '../../../schemas');
    commonSchema = JSON.parse(
      fs.readFileSync(path.join(schemasDir, 'defs/common.schema.json'), 'utf-8')
    );
    storySchema = JSON.parse(
      fs.readFileSync(path.join(schemasDir, 'story.schema.json'), 'utf-8')
    );
    epicSchema = JSON.parse(
      fs.readFileSync(path.join(schemasDir, 'epic.schema.json'), 'utf-8')
    );

    // Register common schema with relative URI that matches $ref in story/epic schemas
    ajv.addSchema(commonSchema, 'defs/common.schema.json');
  });

  describe('common.schema.json', () => {
    it('should define storyId pattern', () => {
      expect(commonSchema).toHaveProperty('$defs.storyId');
    });

    it('should define epicId pattern', () => {
      expect(commonSchema).toHaveProperty('$defs.epicId');
    });

    it('should define dateString pattern', () => {
      expect(commonSchema).toHaveProperty('$defs.dateString');
    });

    it('should define storyType enum', () => {
      expect(commonSchema).toHaveProperty('$defs.storyType');
    });

    it('should define storySize enum', () => {
      expect(commonSchema).toHaveProperty('$defs.storySize');
    });
  });

  describe('story.schema.json', () => {
    it('should validate a complete valid story', () => {
      const validate = ajv.compile(storySchema);
      const validStory = {
        id: 'DS-001',
        title: 'Test Story',
        type: 'feature',
        epic: 'EPIC-001',
        status: 'todo',
        sprint: 'sprint-1',
        size: 'M',
        priority: 100,
        assignee: 'developer',
        dependencies: ['DS-002', '[[DS-003]]'],
        created: '2025-01-15',
        updated: '2025-01-20',
      };

      const result = validate(validStory);
      expect(result).toBe(true);
    });

    it('should validate story with minimal required fields', () => {
      const validate = ajv.compile(storySchema);
      const minimalStory = {
        id: 'STORY-999',
        title: 'Minimal Story',
        type: 'task',
        epic: 'EPIC-INBOX',
        status: 'in_progress',
        size: 'XS',
        created: '2025-12-04',
      };

      const result = validate(minimalStory);
      expect(result).toBe(true);
    });

    it('should reject story missing required id field', () => {
      const validate = ajv.compile(storySchema);
      const invalidStory = {
        title: 'Missing ID',
        type: 'feature',
        epic: 'EPIC-001',
        status: 'todo',
        size: 'M',
        created: '2025-01-15',
      };

      const result = validate(invalidStory);
      expect(result).toBe(false);
    });

    it('should reject story with invalid type enum', () => {
      const validate = ajv.compile(storySchema);
      const invalidStory = {
        id: 'DS-001',
        title: 'Invalid Type',
        type: 'invalid_type',
        epic: 'EPIC-001',
        status: 'todo',
        size: 'M',
        created: '2025-01-15',
      };

      const result = validate(invalidStory);
      expect(result).toBe(false);
    });

    it('should accept story with any string size (sizes validated against config, not schema)', () => {
      const validate = ajv.compile(storySchema);
      const story = {
        id: 'DS-001',
        title: 'Custom Size',
        type: 'feature',
        epic: 'EPIC-001',
        status: 'todo',
        size: 'XXL',
        created: '2025-01-15',
      };

      const result = validate(story);
      expect(result).toBe(true);
    });

    it('should reject story with invalid date format', () => {
      const validate = ajv.compile(storySchema);
      const invalidStory = {
        id: 'DS-001',
        title: 'Invalid Date',
        type: 'feature',
        epic: 'EPIC-001',
        status: 'todo',
        size: 'M',
        created: '01-15-2025',
      };

      const result = validate(invalidStory);
      expect(result).toBe(false);
    });

    it('should reject story with invalid id pattern', () => {
      const validate = ajv.compile(storySchema);
      const invalidStory = {
        id: 'invalid-id',
        title: 'Invalid ID Pattern',
        type: 'feature',
        epic: 'EPIC-001',
        status: 'todo',
        size: 'M',
        created: '2025-01-15',
      };

      const result = validate(invalidStory);
      expect(result).toBe(false);
    });

    it('should accept wiki-link format in dependencies', () => {
      const validate = ajv.compile(storySchema);
      const storyWithWikiLinks = {
        id: 'DS-001',
        title: 'With Wiki Links',
        type: 'feature',
        epic: 'EPIC-001',
        status: 'todo',
        size: 'M',
        dependencies: ['[[DS-002]]', '[[DS-003]]'],
        created: '2025-01-15',
      };

      const result = validate(storyWithWikiLinks);
      expect(result).toBe(true);
    });

    it('should have descriptions for all fields', () => {
      const properties = (storySchema as { properties: Record<string, { description?: string }> }).properties;
      const requiredFields = ['id', 'title', 'type', 'epic', 'status', 'size', 'created'];

      for (const field of requiredFields) {
        expect(properties[field]).toHaveProperty('description');
        expect(properties[field].description).toBeTruthy();
      }
    });
  });

  describe('epic.schema.json', () => {
    it('should validate a complete valid epic', () => {
      const validate = ajv.compile(epicSchema);
      const validEpic = {
        id: 'EPIC-001',
        title: 'Test Epic',
        status: 'active',
        created: '2025-01-15',
        updated: '2025-01-20',
      };

      const result = validate(validEpic);
      expect(result).toBe(true);
    });

    it('should validate epic with minimal required fields', () => {
      const validate = ajv.compile(epicSchema);
      const minimalEpic = {
        id: 'EPIC-INBOX',
        title: 'Inbox',
        status: 'active',
        created: '2025-01-15',
      };

      const result = validate(minimalEpic);
      expect(result).toBe(true);
    });

    it('should reject epic missing required title field', () => {
      const validate = ajv.compile(epicSchema);
      const invalidEpic = {
        id: 'EPIC-001',
        status: 'active',
        created: '2025-01-15',
      };

      const result = validate(invalidEpic);
      expect(result).toBe(false);
    });

    it('should reject epic with invalid id pattern', () => {
      const validate = ajv.compile(epicSchema);
      const invalidEpic = {
        id: 'epic-001',
        title: 'Invalid ID',
        status: 'active',
        created: '2025-01-15',
      };

      const result = validate(invalidEpic);
      expect(result).toBe(false);
    });

    it('should reject epic with invalid date format', () => {
      const validate = ajv.compile(epicSchema);
      const invalidEpic = {
        id: 'EPIC-001',
        title: 'Invalid Date',
        status: 'active',
        created: 'January 15, 2025',
      };

      const result = validate(invalidEpic);
      expect(result).toBe(false);
    });

    it('should have descriptions for all fields', () => {
      const properties = (epicSchema as { properties: Record<string, { description?: string }> }).properties;
      const requiredFields = ['id', 'title', 'status', 'created'];

      for (const field of requiredFields) {
        expect(properties[field]).toHaveProperty('description');
        expect(properties[field].description).toBeTruthy();
      }
    });

    it('should NOT have sprint field (epics do not have sprints)', () => {
      const properties = (epicSchema as { properties: Record<string, unknown> }).properties;
      expect(properties).not.toHaveProperty('sprint');
    });
  });

  describe('task.schema.json', () => {
    let taskSchema: object;

    beforeAll(() => {
      const schemasDir = path.join(__dirname, '../../../schemas');
      taskSchema = JSON.parse(
        fs.readFileSync(path.join(schemasDir, 'task.schema.json'), 'utf-8')
      );
    });

    it('should validate a complete valid task', () => {
      const validate = ajv.compile(taskSchema);
      const validTask = {
        id: 'TASK-001',
        title: 'Implement login',
        task_type: 'code',
        story: 'DS-00001',
        status: 'todo',
        assigned_agent: 'copilot',
        priority: 2,
        dependencies: ['TASK-002'],
        created: '2025-01-15',
        updated: '2025-01-20',
        completed_on: '2025-02-01',
      };

      const result = validate(validTask);
      expect(result).toBe(true);
    });

    it('should validate task with minimal required fields', () => {
      const validate = ajv.compile(taskSchema);
      const minimalTask = {
        id: 'TASK-001',
        title: 'Minimal Task',
        task_type: 'investigate',
        story: 'DS-001',
        status: 'todo',
        created: '2025-01-15',
      };

      const result = validate(minimalTask);
      expect(result).toBe(true);
    });

    it('should reject task missing required task_type field', () => {
      const validate = ajv.compile(taskSchema);
      const invalidTask = {
        id: 'TASK-001',
        title: 'Missing type',
        story: 'DS-001',
        status: 'todo',
        created: '2025-01-15',
      };

      const result = validate(invalidTask);
      expect(result).toBe(false);
    });

    it('should reject task missing required story field', () => {
      const validate = ajv.compile(taskSchema);
      const invalidTask = {
        id: 'TASK-001',
        title: 'Missing story',
        task_type: 'code',
        status: 'todo',
        created: '2025-01-15',
      };

      const result = validate(invalidTask);
      expect(result).toBe(false);
    });
  });
});
