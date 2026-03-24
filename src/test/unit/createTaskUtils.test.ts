/**
 * Unit tests for createTaskUtils pure functions
 */

import { describe, it, expect } from "vitest";
import * as path from "path";
import {
  findNextTaskId,
  buildTaskId,
  buildTaskFilePath,
  generateTaskMarkdown,
  parseAgentFile,
  DEFAULT_TASK_TEMPLATE,
} from "../../commands/createTaskUtils";

describe("findNextTaskId", () => {
  it("returns 1 when no existing IDs", () => {
    expect(findNextTaskId([], "TASK")).toBe(1);
  });

  it("returns next sequential ID", () => {
    expect(findNextTaskId(["TASK-001", "TASK-002", "TASK-003"], "TASK")).toBe(4);
  });

  it("handles gaps in IDs", () => {
    expect(findNextTaskId(["TASK-001", "TASK-005"], "TASK")).toBe(6);
  });

  it("handles custom prefix", () => {
    expect(findNextTaskId(["TSK-001", "TSK-002"], "TSK")).toBe(3);
  });

  it("ignores IDs with wrong prefix", () => {
    expect(findNextTaskId(["OTHER-001", "OTHER-002"], "TASK")).toBe(1);
  });

  it("handles mixed valid and invalid IDs", () => {
    expect(findNextTaskId(["TASK-001", "not-a-task", "TASK-003"], "TASK")).toBe(4);
  });
});

describe("buildTaskId", () => {
  it("pads to 3 digits", () => {
    expect(buildTaskId("TASK", 1)).toBe("TASK-001");
    expect(buildTaskId("TASK", 42)).toBe("TASK-042");
    expect(buildTaskId("TASK", 999)).toBe("TASK-999");
  });

  it("handles numbers over 3 digits", () => {
    expect(buildTaskId("TASK", 1000)).toBe("TASK-1000");
  });

  it("works with custom prefix", () => {
    expect(buildTaskId("TSK", 5)).toBe("TSK-005");
  });
});

describe("buildTaskFilePath", () => {
  it("builds the correct path with slug", () => {
    const result = buildTaskFilePath("docs/storydocs", "DS-00001", "TASK-001", "Login Form");
    expect(result).toBe(path.join("docs/storydocs", "stories", "DS-00001", "tasks", "TASK-001-login-form.md"));
  });

  it("handles empty title gracefully", () => {
    const result = buildTaskFilePath("docs/storydocs", "DS-00001", "TASK-001", "");
    expect(result).toBe(path.join("docs/storydocs", "stories", "DS-00001", "tasks", "TASK-001.md"));
  });

  it("uses toKebabCase for the slug", () => {
    const result = buildTaskFilePath("root", "DS-001", "TASK-002", "My Complex Title Here");
    expect(result).toBe(path.join("root", "stories", "DS-001", "tasks", "TASK-002-my-complex-title-here.md"));
  });
});

describe("generateTaskMarkdown", () => {
  it("generates valid frontmatter with required fields", () => {
    const result = generateTaskMarkdown(
      {
        id: "TASK-001",
        title: "Implement login",
        taskType: "code",
        story: "DS-00001",
        status: "todo",
      },
      DEFAULT_TASK_TEMPLATE,
    );

    expect(result).toContain("id: TASK-001");
    expect(result).toContain('title: "Implement login"');
    expect(result).toContain("task_type: code");
    expect(result).toContain("story: DS-00001");
    expect(result).toContain("status: todo");
    expect(result).toContain("priority: 1"); // default
    expect(result).toContain("# Implement login");
    expect(result).toContain("## Description");
  });

  it("includes assigned_agent when provided", () => {
    const result = generateTaskMarkdown(
      {
        id: "TASK-001",
        title: "Test",
        taskType: "code",
        story: "DS-001",
        status: "todo",
        assignedAgent: "copilot",
      },
      "",
    );
    expect(result).toContain('assigned_agent: "copilot"');
  });

  it("omits assigned_agent line when not provided", () => {
    const result = generateTaskMarkdown(
      {
        id: "TASK-001",
        title: "Test",
        taskType: "code",
        story: "DS-001",
        status: "todo",
      },
      "",
    );
    expect(result).not.toContain("assigned_agent");
  });

  it("uses custom priority when provided", () => {
    const result = generateTaskMarkdown(
      {
        id: "TASK-001",
        title: "Test",
        taskType: "code",
        story: "DS-001",
        status: "todo",
        priority: 5,
      },
      "",
    );
    expect(result).toContain("priority: 5");
  });

  it("escapes double quotes in title", () => {
    const result = generateTaskMarkdown(
      {
        id: "TASK-001",
        title: 'Test "quoted" title',
        taskType: "code",
        story: "DS-001",
        status: "todo",
      },
      "",
    );
    expect(result).toContain('title: "Test \\"quoted\\" title"');
  });
});

describe("parseAgentFile", () => {
  it("extracts name from frontmatter", () => {
    const content = `---
name: GitHub Copilot
description: An AI assistant
---

# Instructions
`;
    const agent = parseAgentFile("/agents/copilot.md", content);
    expect(agent.name).toBe("GitHub Copilot");
    expect(agent.filePath).toBe("/agents/copilot.md");
  });

  it("falls back to filename when name is missing", () => {
    const content = `---
description: An AI assistant
---
`;
    const agent = parseAgentFile("/agents/my-agent.md", content);
    expect(agent.name).toBe("my-agent");
  });

  it("falls back to filename when no frontmatter", () => {
    const content = "# Just markdown";
    const agent = parseAgentFile("/agents/test-agent.md", content);
    expect(agent.name).toBe("test-agent");
  });

  it("falls back to filename when name is empty string", () => {
    const content = `---
name: ""
---
`;
    const agent = parseAgentFile("/agents/fallback.md", content);
    expect(agent.name).toBe("fallback");
  });
});

describe("DEFAULT_TASK_TEMPLATE", () => {
  it("contains expected sections", () => {
    expect(DEFAULT_TASK_TEMPLATE).toContain("## Description");
    expect(DEFAULT_TASK_TEMPLATE).toContain("## Acceptance Criteria");
    expect(DEFAULT_TASK_TEMPLATE).toContain("## Notes");
  });
});
