/**
 * Pure validation functions for story/epic frontmatter
 * No VS Code dependencies - unit testable with Vitest
 */

import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';

const matter = require('gray-matter');

/**
 * Validation error with position info for diagnostics
 */
export interface ValidationError {
  line: number;       // 1-indexed line number in file
  column: number;     // 0-indexed column position
  endColumn?: number; // End column for range highlighting
  message: string;    // User-friendly error message
  severity: 'error' | 'warning';
  field?: string;     // Field name if applicable
}

/**
 * File type for schema selection
 */
export type FileType = 'story' | 'epic' | 'theme' | 'task';

/**
 * Config values for dynamic validation
 */
export interface ValidationConfig {
  statuses: string[];
  sizes: string[];
}

/**
 * Known IDs for cross-file validation
 */
export interface KnownIds {
  stories: Set<string>;                         // All story IDs
  epics: Set<string>;                           // All epic IDs
  themes: Set<string>;                          // All theme IDs
  tasks: Set<string>;                           // All task IDs
  epicStoryMap: Map<string, Set<string>>;       // Epic ID → story IDs listed in that epic's ## Stories section
  themeEpicMap: Map<string, Set<string>>;       // Theme ID → epic IDs listed in that theme's ## Epics section
}

// Lazy-loaded Ajv instance
let ajvInstance: Ajv | null = null;
let storyValidate: ReturnType<Ajv['compile']> | null = null;
let epicValidate: ReturnType<Ajv['compile']> | null = null;
let themeValidate: ReturnType<Ajv['compile']> | null = null;
let taskValidate: ReturnType<Ajv['compile']> | null = null;

/**
 * Get or create Ajv instance with schemas loaded
 */
function getAjv(schemasDir: string): Ajv {
  if (ajvInstance) {
    return ajvInstance;
  }

  ajvInstance = new Ajv({ strict: false, allErrors: true });
  addFormats(ajvInstance);

  // Load common schema
  const commonSchema = JSON.parse(
    fs.readFileSync(path.join(schemasDir, 'defs/common.schema.json'), 'utf-8')
  );
  ajvInstance.addSchema(commonSchema, 'defs/common.schema.json');

  // Load and compile story schema
  const storySchema = JSON.parse(
    fs.readFileSync(path.join(schemasDir, 'story.schema.json'), 'utf-8')
  );
  storyValidate = ajvInstance.compile(storySchema);

  // Load and compile epic schema
  const epicSchema = JSON.parse(
    fs.readFileSync(path.join(schemasDir, 'epic.schema.json'), 'utf-8')
  );
  epicValidate = ajvInstance.compile(epicSchema);

  // Load and compile theme schema
  const themeSchema = JSON.parse(
    fs.readFileSync(path.join(schemasDir, 'theme.schema.json'), 'utf-8')
  );
  themeValidate = ajvInstance.compile(themeSchema);

  // Load and compile task schema
  const taskSchemaPath = path.join(schemasDir, 'task.schema.json');
  if (fs.existsSync(taskSchemaPath)) {
    const taskSchema = JSON.parse(
      fs.readFileSync(taskSchemaPath, 'utf-8')
    );
    taskValidate = ajvInstance.compile(taskSchema);
  }

  return ajvInstance;
}

/**
 * Find the line number of a YAML field in content
 * Returns 1-indexed line number, or 1 if not found
 */
export function findFieldLine(content: string, fieldName: string): number {
  const lines = content.split('\n');
  const regex = new RegExp(`^${fieldName}:`);

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i].trim())) {
      return i + 1; // 1-indexed
    }
  }

  return 1; // Default to line 1 if not found
}

/**
 * Find the column position of a value in a YAML field line
 */
export function findValueColumn(line: string, fieldName: string): { start: number; end: number } {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) {
    return { start: 0, end: line.length };
  }

  // Value starts after colon and any whitespace
  const afterColon = line.slice(colonIndex + 1);
  const valueMatch = afterColon.match(/^\s*(.+?)\s*$/);

  if (valueMatch) {
    const valueStart = colonIndex + 1 + (afterColon.length - afterColon.trimStart().length);
    const valueEnd = valueStart + valueMatch[1].length;
    return { start: valueStart, end: valueEnd };
  }

  return { start: colonIndex + 1, end: line.length };
}

/**
 * Map Ajv error to user-friendly validation error
 */
function mapAjvError(error: ErrorObject, content: string): ValidationError {
  const lines = content.split('\n');

  // Extract field name from instancePath (e.g., "/id" -> "id")
  const field = error.instancePath.replace(/^\//, '') || error.params?.missingProperty;
  const line = field ? findFieldLine(content, field) : 1;
  const lineContent = lines[line - 1] || '';
  const { start, end } = findValueColumn(lineContent, field || '');

  let message: string;

  switch (error.keyword) {
    case 'required':
      message = `Missing required field: ${error.params?.missingProperty}`;
      break;
    case 'enum':
      message = `Invalid value for '${field}'. Allowed: ${error.params?.allowedValues?.join(', ')}`;
      break;
    case 'pattern':
      message = `Invalid format for '${field}'. ${error.message}`;
      break;
    case 'type':
      message = `Invalid type for '${field}'. Expected ${error.params?.type}`;
      break;
    case 'minLength':
      message = `'${field}' cannot be empty`;
      break;
    case 'maxLength':
      message = `'${field}' exceeds maximum length of ${error.params?.limit}`;
      break;
    case 'additionalProperties':
      message = `Unknown field: ${error.params?.additionalProperty}`;
      break;
    default:
      message = error.message || `Invalid value for '${field}'`;
  }

  return {
    line,
    column: start,
    endColumn: end,
    message,
    severity: 'error',
    field: field || undefined
  };
}

/**
 * Normalize data parsed by gray-matter for Ajv validation.
 * gray-matter auto-converts dates to Date objects, but Ajv expects strings.
 */
function normalizeForValidation(data: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      // Convert Date back to YYYY-MM-DD string
      normalized[key] = value.toISOString().split('T')[0];
    } else if (Array.isArray(value)) {
      normalized[key] = value.map(item =>
        item instanceof Date ? item.toISOString().split('T')[0] : item
      );
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}

/**
 * Validate frontmatter against JSON schema and config
 * Returns array of validation errors (empty if valid)
 */
export function validateFrontmatter(
  content: string,
  fileType: FileType,
  config: ValidationConfig,
  schemasDir: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Parse frontmatter
  let parsed;
  try {
    parsed = matter(content);
  } catch (e) {
    return [{
      line: 1,
      column: 0,
      message: 'Invalid YAML frontmatter syntax',
      severity: 'error'
    }];
  }

  // Normalize data for validation (gray-matter converts dates to Date objects)
  const data = normalizeForValidation(parsed.data);

  // Check if frontmatter exists
  if (!data || Object.keys(data).length === 0) {
    return [{
      line: 1,
      column: 0,
      message: 'No frontmatter found. Add YAML frontmatter between --- markers.',
      severity: 'error'
    }];
  }

  // Initialize Ajv and get validator
  getAjv(schemasDir);
  let validate: ReturnType<Ajv['compile']> | null;
  if (fileType === 'task') {
    validate = taskValidate;
  } else if (fileType === 'story') {
    validate = storyValidate;
  } else if (fileType === 'theme') {
    validate = themeValidate;
  } else {
    validate = epicValidate;
  }

  if (!validate) {
    return [{
      line: 1,
      column: 0,
      message: 'Failed to load validation schema',
      severity: 'error'
    }];
  }

  // Run schema validation
  const valid = validate(data);

  if (!valid && validate.errors) {
    for (const error of validate.errors) {
      errors.push(mapAjvError(error, content));
    }
  }

  // Config-aware validation (warnings, not errors)
  // Only validate if field exists and passes schema validation
  const statusValue = data.status as string | undefined;
  if (statusValue && !errors.some(e => e.field === 'status')) {
    if (!config.statuses.includes(statusValue)) {
      const line = findFieldLine(content, 'status');
      const lineContent = content.split('\n')[line - 1] || '';
      const { start, end } = findValueColumn(lineContent, 'status');

      errors.push({
        line,
        column: start,
        endColumn: end,
        message: `Status '${statusValue}' is not defined in config. Available: ${config.statuses.join(', ')}`,
        severity: 'warning',
        field: 'status'
      });
    }
  }

  // Size validation against config (stories only)
  const sizeValue = data.size as string | undefined;
  if (fileType === 'story' && sizeValue && !errors.some(e => e.field === 'size')) {
    if (!config.sizes.includes(sizeValue)) {
      const line = findFieldLine(content, 'size');
      const lineContent = content.split('\n')[line - 1] || '';
      const { start, end } = findValueColumn(lineContent, 'size');

      errors.push({
        line,
        column: start,
        endColumn: end,
        message: `Size '${sizeValue}' is not defined in config. Available: ${config.sizes.join(', ')}`,
        severity: 'warning',
        field: 'size'
      });
    }
  }

  return errors;
}

/**
 * Determine file type from path
 */
export function getFileTypeFromPath(filePath: string): FileType | null {
  // Check for task files first (tasks live under stories/{ID}/tasks/)
  if (filePath.includes('/tasks/') || filePath.includes('\\tasks\\')) {
    return 'task';
  }
  if (filePath.includes('/stories/') || filePath.includes('\\stories\\')) {
    return 'story';
  }
  if (filePath.includes('/epics/') || filePath.includes('\\epics\\')) {
    return 'epic';
  }
  if (filePath.includes('/themes/') || filePath.includes('\\themes\\')) {
    return 'theme';
  }
  return null;
}

/**
 * Check if a file path is within .devstories folder
 */
export function isDevStoriesFile(filePath: string): boolean {
  return filePath.includes('.devstories/') || filePath.includes('.devstories\\');
}

/**
 * Reset cached Ajv instance (for testing)
 */
export function resetAjvCache(): void {
  ajvInstance = null;
  storyValidate = null;
  epicValidate = null;
  themeValidate = null;
  taskValidate = null;
}

/**
 * Special epic ID that always exists (quick capture inbox)
 */
const EPIC_INBOX = 'EPIC-INBOX';

/**
 * Pattern to extract [[ID]] links from markdown content
 */
const LINK_PATTERN = /\[\[([A-Z]+-(?:\d+|INBOX))\]\]/g;

/**
 * Extract the ID from a dependency string (handles both "DS-001" and "[[DS-001]]" formats)
 */
function extractIdFromDependency(dep: string): string {
  const match = dep.match(/\[\[([A-Z]+-(?:\d+|INBOX))\]\]/);
  return match ? match[1] : dep;
}

/**
 * Find the line number where a specific array item appears
 */
function findArrayItemLine(content: string, fieldName: string, item: string): number {
  const lines = content.split('\n');
  let inField = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith(`${fieldName}:`)) {
      inField = true;
      continue;
    }
    if (inField) {
      // Check if we've left the array (next field starts)
      if (!line.startsWith('-') && line.includes(':') && !line.startsWith('#')) {
        break;
      }
      // Check if this line contains the item
      if (line.includes(item)) {
        return i + 1; // 1-indexed
      }
    }
  }

  return findFieldLine(content, fieldName);
}

/**
 * Find all [[ID]] links in content (below frontmatter) with their line numbers
 */
function findLinksInContent(content: string): Array<{ id: string; line: number; column: number }> {
  const links: Array<{ id: string; line: number; column: number }> = [];
  const lines = content.split('\n');

  // Find where frontmatter ends (second --- line)
  let frontmatterEnd = 0;
  let dashCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      dashCount++;
      if (dashCount === 2) {
        frontmatterEnd = i + 1;
        break;
      }
    }
  }

  // Search content after frontmatter
  for (let i = frontmatterEnd; i < lines.length; i++) {
    const line = lines[i];
    let match;
    LINK_PATTERN.lastIndex = 0; // Reset regex state
    while ((match = LINK_PATTERN.exec(line)) !== null) {
      links.push({
        id: match[1],
        line: i + 1, // 1-indexed
        column: match.index
      });
    }
  }

  return links;
}

/**
 * Validate cross-file references in frontmatter
 * Returns array of validation errors (empty if all references valid)
 */
export function validateCrossFile(
  content: string,
  fileType: FileType,
  currentId: string | undefined,
  knownIds: KnownIds
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Parse frontmatter to get field values
  let parsed;
  try {
    parsed = matter(content);
  } catch {
    // Can't parse - schema validation will catch this
    return [];
  }

  const data = parsed.data;

  // 1. Validate epic field (stories only)
  if (fileType === 'story' && data.epic) {
    const epicId = String(data.epic);
    // EPIC-INBOX is always valid
    if (epicId !== EPIC_INBOX && !knownIds.epics.has(epicId)) {
      const line = findFieldLine(content, 'epic');
      const lineContent = content.split('\n')[line - 1] || '';
      const { start, end } = findValueColumn(lineContent, 'epic');

      errors.push({
        line,
        column: start,
        endColumn: end,
        message: `Epic '${epicId}' does not exist`,
        severity: 'error',
        field: 'epic'
      });
    }
  }

  // 1b. Validate theme field (epics only)
  if (fileType === 'epic' && data.theme) {
    const themeId = String(data.theme);
    if (!knownIds.themes.has(themeId)) {
      const line = findFieldLine(content, 'theme');
      const lineContent = content.split('\n')[line - 1] || '';
      const { start, end } = findValueColumn(lineContent, 'theme');

      errors.push({
        line,
        column: start,
        endColumn: end,
        message: `Theme '${themeId}' does not exist`,
        severity: 'error',
        field: 'theme'
      });
    }
  }

  // 2. Validate dependencies (stories only)
  if (fileType === 'story' && Array.isArray(data.dependencies)) {
    for (const dep of data.dependencies) {
      const depId = extractIdFromDependency(String(dep));

      // Self-reference check
      if (depId === currentId) {
        const line = findArrayItemLine(content, 'dependencies', dep);
        errors.push({
          line,
          column: 0,
          message: `Story cannot depend on itself`,
          severity: 'error',
          field: 'dependencies'
        });
        continue;
      }

      // Existence check
      if (!knownIds.stories.has(depId)) {
        const line = findArrayItemLine(content, 'dependencies', dep);
        errors.push({
          line,
          column: 0,
          message: `Dependency '${depId}' does not exist`,
          severity: 'error',
          field: 'dependencies'
        });
      }
    }
  }

  // 3. Validate [[ID]] links in markdown body
  const links = findLinksInContent(content);
  for (const link of links) {
    const exists = knownIds.stories.has(link.id) || knownIds.epics.has(link.id);
    if (!exists) {
      errors.push({
        line: link.line,
        column: link.column,
        message: `Link '[[${link.id}]]' does not exist`,
        severity: 'warning'
      });
    }
  }

  // 4. ID uniqueness across collections
  if (currentId) {
    if (fileType === 'story' && (knownIds.epics.has(currentId) || knownIds.themes.has(currentId))) {
      const line = findFieldLine(content, 'id');
      const lineContent = content.split('\n')[line - 1] || '';
      const { start, end } = findValueColumn(lineContent, 'id');
      const conflictType = knownIds.epics.has(currentId) ? 'epic' : 'theme';

      errors.push({
        line,
        column: start,
        endColumn: end,
        message: `ID '${currentId}' already exists as a ${conflictType}`,
        severity: 'error',
        field: 'id'
      });
    } else if (fileType === 'epic' && (knownIds.stories.has(currentId) || knownIds.themes.has(currentId))) {
      const line = findFieldLine(content, 'id');
      const lineContent = content.split('\n')[line - 1] || '';
      const { start, end } = findValueColumn(lineContent, 'id');
      const conflictType = knownIds.stories.has(currentId) ? 'story' : 'theme';

      errors.push({
        line,
        column: start,
        endColumn: end,
        message: `ID '${currentId}' already exists as a ${conflictType}`,
        severity: 'error',
        field: 'id'
      });
    } else if (fileType === 'theme' && (knownIds.stories.has(currentId) || knownIds.epics.has(currentId))) {
      const line = findFieldLine(content, 'id');
      const lineContent = content.split('\n')[line - 1] || '';
      const { start, end } = findValueColumn(lineContent, 'id');
      const conflictType = knownIds.stories.has(currentId) ? 'story' : 'epic';

      errors.push({
        line,
        column: start,
        endColumn: end,
        message: `ID '${currentId}' already exists as a ${conflictType}`,
        severity: 'error',
        field: 'id'
      });
    }
  }

  // 5. Orphan story warning (story not listed in epic's ## Stories section)
  if (fileType === 'story' && currentId && data.epic) {
    const epicId = String(data.epic);
    // Skip EPIC-INBOX - stories there don't need to be listed
    if (epicId !== EPIC_INBOX && knownIds.epics.has(epicId)) {
      const epicStories = knownIds.epicStoryMap.get(epicId);
      if (epicStories && !epicStories.has(currentId)) {
        const line = findFieldLine(content, 'epic');

        errors.push({
          line,
          column: 0,
          message: `Story is not listed in ${epicId}'s Stories section`,
          severity: 'warning',
          field: 'epic'
        });
      }
    }
  }

  // 6. Orphan epic warning (epic not listed in theme's ## Epics section)
  if (fileType === 'epic' && currentId && data.theme) {
    const themeId = String(data.theme);
    if (knownIds.themes.has(themeId)) {
      const themeEpics = knownIds.themeEpicMap.get(themeId);
      if (themeEpics && !themeEpics.has(currentId)) {
        const line = findFieldLine(content, 'theme');

        errors.push({
          line,
          column: 0,
          message: `Epic is not listed in ${themeId}'s Epics section`,
          severity: 'warning',
          field: 'theme'
        });
      }
    }
  }

  // 7. Validate task's story field references a known story
  if (fileType === 'task' && data.story) {
    const storyId = String(data.story);
    if (!knownIds.stories.has(storyId)) {
      const line = findFieldLine(content, 'story');
      const lineContent = content.split('\n')[line - 1] || '';
      const { start, end } = findValueColumn(lineContent, 'story');

      errors.push({
        line,
        column: start,
        endColumn: end,
        message: `Story '${storyId}' does not exist`,
        severity: 'error',
        field: 'story'
      });
    }
  }

  return errors;
}
