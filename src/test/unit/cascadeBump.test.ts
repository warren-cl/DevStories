/**
 * Unit tests for cascade priority-bump helpers.
 *
 * These are pure functions with no VS Code dependency — they compute the
 * minimal set of priority changes needed when a story is inserted at a
 * given priority.
 */

import { describe, it, expect } from "vitest";
import { cascadeBumpIfNeeded, computeSprintNodeDropPriority, type PrioritySibling } from "../../view/storiesDragAndDropControllerUtils";

// ─── cascadeBumpIfNeeded ────────────────────────────────────────────────────

describe("cascadeBumpIfNeeded", () => {
  it("returns no bumps when there are no siblings", () => {
    expect(cascadeBumpIfNeeded([], 10)).toEqual([]);
  });

  it("returns no bumps when no sibling collides (gap exists)", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-001", priority: 20 },
      { id: "DS-002", priority: 30 },
    ];
    // Inserting at 10 — no sibling has priority 10 or 11
    expect(cascadeBumpIfNeeded(siblings, 10)).toEqual([]);
  });

  it("bumps a single colliding sibling", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-001", priority: 10 },
      { id: "DS-002", priority: 30 },
    ];
    // Insert at 10 → DS-001 (10) must move to 11.  DS-002 (30) has gap, no bump.
    expect(cascadeBumpIfNeeded(siblings, 10)).toEqual([{ id: "DS-001", newPriority: 11 }]);
  });

  it("cascades through a consecutive block and stops at gap", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-001", priority: 200 },
      { id: "DS-002", priority: 201 },
      { id: "DS-003", priority: 202 },
      { id: "DS-004", priority: 300 },
    ];
    // Insert at 200 → 200→201, 201→202, 202→203, 300 >= 204 → STOP
    expect(cascadeBumpIfNeeded(siblings, 200)).toEqual([
      { id: "DS-001", newPriority: 201 },
      { id: "DS-002", newPriority: 202 },
      { id: "DS-003", newPriority: 203 },
    ]);
  });

  it("cascades all siblings when every priority is consecutive", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-001", priority: 5 },
      { id: "DS-002", priority: 6 },
      { id: "DS-003", priority: 7 },
    ];
    // Insert at 5 → all three must cascade
    expect(cascadeBumpIfNeeded(siblings, 5)).toEqual([
      { id: "DS-001", newPriority: 6 },
      { id: "DS-002", newPriority: 7 },
      { id: "DS-003", newPriority: 8 },
    ]);
  });

  it("ignores siblings below the inserted priority", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-001", priority: 5 },
      { id: "DS-002", priority: 20 },
      { id: "DS-003", priority: 30 },
    ];
    // Insert at 20 → DS-001 (5) is ignored.  DS-002 (20) collides → 21.
    // DS-003 (30) has gap (>= 22) → STOP
    expect(cascadeBumpIfNeeded(siblings, 20)).toEqual([{ id: "DS-002", newPriority: 21 }]);
  });

  it("handles ties deterministically (sorted by id)", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-003", priority: 10 },
      { id: "DS-001", priority: 10 },
      { id: "DS-002", priority: 12 },
    ];
    // Insert at 10 → two siblings at 10.  Sorted by id: DS-001 first, then DS-003.
    // DS-001 → 11, DS-003 → 12, DS-002 (12 < 13) → 13
    expect(cascadeBumpIfNeeded(siblings, 10)).toEqual([
      { id: "DS-001", newPriority: 11 },
      { id: "DS-003", newPriority: 12 },
      { id: "DS-002", newPriority: 13 },
    ]);
  });

  it("handles unsorted input correctly", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-003", priority: 30 },
      { id: "DS-001", priority: 10 },
      { id: "DS-002", priority: 11 },
    ];
    // Insert at 10 → 10→11, 11→12, 30 >= 13 → STOP
    expect(cascadeBumpIfNeeded(siblings, 10)).toEqual([
      { id: "DS-001", newPriority: 11 },
      { id: "DS-002", newPriority: 12 },
    ]);
  });

  it("handles real-world PO spacing (multiples of 10)", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-001", priority: 10 },
      { id: "DS-002", priority: 20 },
      { id: "DS-003", priority: 30 },
      { id: "DS-004", priority: 40 },
      { id: "DS-005", priority: 50 },
    ];
    // Insert at 20 → only DS-002 (20) collides → 21.  DS-003 (30) has gap → STOP
    expect(cascadeBumpIfNeeded(siblings, 20)).toEqual([{ id: "DS-002", newPriority: 21 }]);
  });

  it("handles real-world PO spacing (multiples of 100)", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-001", priority: 100 },
      { id: "DS-002", priority: 200 },
      { id: "DS-003", priority: 300 },
    ];
    // Insert at 200 → only DS-002 collides
    expect(cascadeBumpIfNeeded(siblings, 200)).toEqual([{ id: "DS-002", newPriority: 201 }]);
  });
});

// ─── computeSprintNodeDropPriority ──────────────────────────────────────────

describe("computeSprintNodeDropPriority", () => {
  it("returns priority 100 with no bumps for empty sprint", () => {
    expect(computeSprintNodeDropPriority([])).toEqual({
      draggedPriority: 100,
      bumps: [],
    });
  });

  it("places before minimum when there is room (min >= 2)", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-001", priority: 10 },
      { id: "DS-002", priority: 20 },
    ];
    expect(computeSprintNodeDropPriority(siblings)).toEqual({
      draggedPriority: 9,
      bumps: [],
    });
  });

  it("places before minimum when min is exactly 2", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-001", priority: 2 },
      { id: "DS-002", priority: 5 },
    ];
    expect(computeSprintNodeDropPriority(siblings)).toEqual({
      draggedPriority: 1,
      bumps: [],
    });
  });

  it("cascades when minimum is 1 (no room before)", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-001", priority: 1 },
      { id: "DS-002", priority: 2 },
      { id: "DS-003", priority: 10 },
    ];
    // Must insert at 1, cascade: 1→2, 2→3, 10 >= 4 → STOP
    expect(computeSprintNodeDropPriority(siblings)).toEqual({
      draggedPriority: 1,
      bumps: [
        { id: "DS-001", newPriority: 2 },
        { id: "DS-002", newPriority: 3 },
      ],
    });
  });

  it("cascades entire consecutive block starting from 1", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-001", priority: 1 },
      { id: "DS-002", priority: 2 },
      { id: "DS-003", priority: 3 },
    ];
    expect(computeSprintNodeDropPriority(siblings)).toEqual({
      draggedPriority: 1,
      bumps: [
        { id: "DS-001", newPriority: 2 },
        { id: "DS-002", newPriority: 3 },
        { id: "DS-003", newPriority: 4 },
      ],
    });
  });

  it("places at min-1 with real-world PO spacing", () => {
    const siblings: PrioritySibling[] = [
      { id: "DS-001", priority: 100 },
      { id: "DS-002", priority: 200 },
      { id: "DS-003", priority: 300 },
    ];
    expect(computeSprintNodeDropPriority(siblings)).toEqual({
      draggedPriority: 99,
      bumps: [],
    });
  });

  it("handles single sibling at priority 1", () => {
    const siblings: PrioritySibling[] = [{ id: "DS-001", priority: 1 }];
    expect(computeSprintNodeDropPriority(siblings)).toEqual({
      draggedPriority: 1,
      bumps: [{ id: "DS-001", newPriority: 2 }],
    });
  });

  it("handles single sibling at priority > 1", () => {
    const siblings: PrioritySibling[] = [{ id: "DS-001", priority: 50 }];
    expect(computeSprintNodeDropPriority(siblings)).toEqual({
      draggedPriority: 49,
      bumps: [],
    });
  });
});
