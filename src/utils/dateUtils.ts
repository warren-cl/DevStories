/**
 * Shared date utility — local-time "today" string.
 *
 * Uses the user's **local** calendar day (not UTC) so that dates written
 * to frontmatter match what the user sees on their clock.
 */

/**
 * Get today's date as YYYY-MM-DD using local time (not UTC).
 */
export function localToday(): string {
  const now = new Date();
  return formatDate(now);
}

/**
 * Format a Date object as YYYY-MM-DD using local time (not UTC).
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Known date field names in DevStories frontmatter. */
const DATE_FIELDS = new Set(["created", "updated", "completed_on"]);

/**
 * Convert any Date objects in frontmatter data back to YYYY-MM-DD strings.
 *
 * gray-matter automatically converts YAML date strings to JavaScript Date
 * objects during parsing. When the data is later serialized via
 * `matter.stringify()`, those Date objects produce full ISO-8601 timestamps
 * (e.g. `2026-03-22T00:00:00.000Z`) instead of the clean `YYYY-MM-DD` we
 * want.  Call this after `matter(content)` to normalize before stringify.
 *
 * Mutates `data` in place for convenience.
 */
export function normalizeDatesInData(data: Record<string, unknown>): void {
  for (const key of DATE_FIELDS) {
    const val = data[key];
    if (val instanceof Date) {
      data[key] = formatDate(val);
    }
  }
}
