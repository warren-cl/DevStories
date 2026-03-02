/**
 * Input validation utilities for command handlers
 * DS-063: Validate user input in command handlers
 *
 * Provides centralized validation for user-provided input before writing to files.
 * All validators allow UTF-8 characters but reject control characters.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Control character regex: matches ASCII control characters (0x00-0x1F, 0x7F)
 * Excludes printable characters and allows all UTF-8 multibyte sequences
 */
const CONTROL_CHAR_REGEX = /[\x00-\x1F\x7F]/;

/**
 * Sprint name regex: alphanumeric and hyphens only
 */
const SPRINT_NAME_REGEX = /^[a-zA-Z0-9-]+$/;

/**
 * Maximum lengths
 */
const MAX_STORY_TITLE_LENGTH = 200;
const MAX_EPIC_NAME_LENGTH = 100;

/**
 * Validate story title
 * - Required (non-empty)
 * - Max 200 characters
 * - No control characters (allows UTF-8)
 */
export function validateStoryTitle(title: string): ValidationResult {
  const trimmed = title.trim();

  if (!trimmed) {
    return { valid: false, error: 'Story title is required' };
  }

  if (trimmed.length > MAX_STORY_TITLE_LENGTH) {
    return {
      valid: false,
      error: `Story title must be 200 characters or less (got ${trimmed.length})`,
    };
  }

  if (CONTROL_CHAR_REGEX.test(title)) {
    return {
      valid: false,
      error: 'Story title contains invalid control character',
    };
  }

  return { valid: true };
}

/**
 * Validate theme name/title
 * - Required (non-empty)
 * - Max 100 characters
 * - No control characters (allows UTF-8)
 */
export function validateThemeName(name: string): ValidationResult {
  const trimmed = name.trim();

  if (!trimmed) {
    return { valid: false, error: 'Theme name is required' };
  }

  if (trimmed.length > MAX_EPIC_NAME_LENGTH) {
    return {
      valid: false,
      error: `Theme name must be 100 characters or less (got ${trimmed.length})`,
    };
  }

  if (CONTROL_CHAR_REGEX.test(name)) {
    return {
      valid: false,
      error: 'Theme name contains invalid control character',
    };
  }

  return { valid: true };
}

/**
 * Validate epic name/title
 * - Required (non-empty)
 * - Max 100 characters
 * - No control characters (allows UTF-8)
 */
export function validateEpicName(name: string): ValidationResult {
  const trimmed = name.trim();

  if (!trimmed) {
    return { valid: false, error: 'Epic name is required' };
  }

  if (trimmed.length > MAX_EPIC_NAME_LENGTH) {
    return {
      valid: false,
      error: `Epic name must be 100 characters or less (got ${trimmed.length})`,
    };
  }

  if (CONTROL_CHAR_REGEX.test(name)) {
    return {
      valid: false,
      error: 'Epic name contains invalid control character',
    };
  }

  return { valid: true };
}

/**
 * Validate sprint name
 * - Required (non-empty after trim)
 * - Alphanumeric and hyphens only
 */
export function validateSprintName(sprintName: string): ValidationResult {
  const trimmed = sprintName.trim();

  if (!trimmed) {
    return { valid: false, error: 'Sprint name is required' };
  }

  if (!SPRINT_NAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Sprint name must contain only alphanumeric characters and hyphens',
    };
  }

  return { valid: true };
}
