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
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
