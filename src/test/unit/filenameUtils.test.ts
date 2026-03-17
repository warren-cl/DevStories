import { describe, it, expect } from 'vitest';
import { toKebabCase } from '../../utils/filenameUtils';

describe('toKebabCase', () => {
  it('converts simple title to kebab-case', () => {
    expect(toKebabCase('Login Form Implementation')).toBe('login-form-implementation');
  });

  it('strips special characters', () => {
    expect(toKebabCase('Fix: API (v2) issue!')).toBe('fix-api-v2-issue');
  });

  it('collapses multiple separators into one hyphen', () => {
    expect(toKebabCase('Hello   World---Test')).toBe('hello-world-test');
  });

  it('trims leading and trailing hyphens', () => {
    expect(toKebabCase('  spaces  ')).toBe('spaces');
  });

  it('truncates long titles to 50 chars without trailing hyphen', () => {
    const long = 'A very long title that keeps going and going and going far beyond limits';
    const result = toKebabCase(long);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result).not.toMatch(/-$/);
  });

  it('handles numbers in title', () => {
    expect(toKebabCase('Fix bug 42 in v3')).toBe('fix-bug-42-in-v3');
  });

  it('handles already-lowercase input', () => {
    expect(toKebabCase('simple title')).toBe('simple-title');
  });

  it('handles single word', () => {
    expect(toKebabCase('Inbox')).toBe('inbox');
  });

  it('converts sample file titles correctly', () => {
    expect(toKebabCase('Sample Epic (Delete Me)')).toBe('sample-epic-delete-me');
    expect(toKebabCase('Sample Story (Delete Me)')).toBe('sample-story-delete-me');
  });

  it('handles parentheses and colons', () => {
    expect(toKebabCase('Phase 1: Setup (MVP)')).toBe('phase-1-setup-mvp');
  });

  it('does not produce double hyphens', () => {
    const result = toKebabCase('Hello -- World');
    expect(result).not.toContain('--');
  });

  it('handles exactly-50-char boundary', () => {
    // 50 'a' chars separated by spaces → one long kebab word truncated at 50
    const title = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaax'; // 51 chars of word
    const result = toKebabCase(title);
    expect(result.length).toBeLessThanOrEqual(50);
  });
});
