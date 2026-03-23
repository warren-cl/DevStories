import { describe, it, expect } from "vitest";
import { formatDate, normalizeDatesInData } from "../../utils/dateUtils";

describe("formatDate", () => {
  it("formats a Date as YYYY-MM-DD using local time", () => {
    // Create a date with explicit local values: Jan 5, 2026
    const d = new Date(2026, 0, 5); // month is 0-indexed
    expect(formatDate(d)).toBe("2026-01-05");
  });

  it("pads single-digit month and day", () => {
    const d = new Date(2025, 2, 9); // March 9
    expect(formatDate(d)).toBe("2025-03-09");
  });

  it("handles December 31 correctly", () => {
    const d = new Date(2025, 11, 31);
    expect(formatDate(d)).toBe("2025-12-31");
  });
});

describe("normalizeDatesInData", () => {
  it("converts Date objects to YYYY-MM-DD strings", () => {
    const data: Record<string, unknown> = {
      created: new Date(2026, 2, 22), // March 22
      updated: new Date(2026, 2, 22),
      title: "Keep this",
    };
    normalizeDatesInData(data);
    expect(data.created).toBe("2026-03-22");
    expect(data.updated).toBe("2026-03-22");
    expect(data.title).toBe("Keep this");
  });

  it("converts completed_on Date to string", () => {
    const data: Record<string, unknown> = {
      completed_on: new Date(2026, 0, 15),
    };
    normalizeDatesInData(data);
    expect(data.completed_on).toBe("2026-01-15");
  });

  it("leaves string dates untouched", () => {
    const data: Record<string, unknown> = {
      created: "2026-03-22",
      updated: "2026-03-22",
    };
    normalizeDatesInData(data);
    expect(data.created).toBe("2026-03-22");
    expect(data.updated).toBe("2026-03-22");
  });

  it("leaves non-date fields untouched", () => {
    const data: Record<string, unknown> = {
      id: "DS-00001",
      title: "My Story",
      priority: 100,
      dependencies: ["DS-00002"],
    };
    normalizeDatesInData(data);
    expect(data.id).toBe("DS-00001");
    expect(data.title).toBe("My Story");
    expect(data.priority).toBe(100);
  });

  it("handles missing date fields gracefully", () => {
    const data: Record<string, unknown> = { id: "DS-00001" };
    normalizeDatesInData(data);
    expect(data.id).toBe("DS-00001");
    expect(data.created).toBeUndefined();
  });

  it("does not add date fields that are not present", () => {
    const data: Record<string, unknown> = { title: "test" };
    normalizeDatesInData(data);
    expect("created" in data).toBe(false);
    expect("updated" in data).toBe(false);
    expect("completed_on" in data).toBe(false);
  });

  it("works with gray-matter round-trip", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const matter = require("gray-matter");
    const input = `---
id: DS-00001
title: Test Story
created: 2026-03-22
updated: 2026-03-22
---

# Content
`;
    const parsed = matter(input);
    // gray-matter converts date strings to Date objects
    expect(parsed.data.created).toBeInstanceOf(Date);
    expect(parsed.data.updated).toBeInstanceOf(Date);

    // Apply normalization
    normalizeDatesInData(parsed.data);
    expect(parsed.data.created).toBe("2026-03-22");
    expect(parsed.data.updated).toBe("2026-03-22");

    // Verify stringify produces clean dates
    const output = matter.stringify(parsed.content, parsed.data);
    expect(output).toContain("created: '2026-03-22'");
    expect(output).toContain("updated: '2026-03-22'");
    expect(output).not.toContain("T00:00:00");
  });
});
