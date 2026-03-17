/**
 * Convert a title string to kebab-case suitable for use as a filename suffix.
 *
 * Examples:
 *   "Login Form Implementation" -> "login-form-implementation"
 *   "Fix: API (v2) issue!"      -> "fix-api-v2-issue"
 *
 * Rules:
 *  - Lowercase everything
 *  - Replace any run of non-alphanumeric characters with a single hyphen
 *  - Trim leading/trailing hyphens
 *  - Truncate at 50 characters, re-trim trailing hyphen after truncation
 */
export function toKebabCase(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
    .replace(/-+$/, '');
}
