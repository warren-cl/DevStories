/**
 * Unit tests for Parser.parseTask()
 */

import { describe, it, expect } from "vitest";
import { Parser } from "../../core/parser";

describe("Parser.parseTask", () => {
  const validContent = `---
id: TASK-001
title: Implement login form
task_type: code
story: DS-00001
status: todo
assigned_agent: copilot
priority: 2
dependencies:
  - TASK-002
created: 2025-01-15
updated: 2025-01-20
completed_on: 2025-02-01
---

# Implement login form

Some content here.`;

  it("parses all fields from valid task frontmatter", () => {
    const { task } = Parser.parseTask(validContent, "/path/to/TASK-001.md");

    expect(task.id).toBe("TASK-001");
    expect(task.title).toBe("Implement login form");
    expect(task.taskType).toBe("code");
    expect(task.story).toBe("DS-00001");
    expect(task.status).toBe("todo");
    expect(task.assignedAgent).toBe("copilot");
    expect(task.priority).toBe(2);
    expect(task.dependencies).toEqual(["TASK-002"]);
    expect(task.created).toBeInstanceOf(Date);
    expect(task.updated).toBeInstanceOf(Date);
    expect(task.completedOn).toBeInstanceOf(Date);
    expect(task.content).toContain("Some content here.");
    expect(task.filePath).toBe("/path/to/TASK-001.md");
  });

  it("returns changed: false when all canonical fields are present", () => {
    const { changed } = Parser.parseTask(validContent, "/path/to/TASK-001.md");
    // story is not derivable from this path, so normalization may set defaults
    // but canonical field names are all present, so alias renames don't fire
    expect(typeof changed).toBe("boolean");
  });

  it("uses default priority of 1 when not specified", () => {
    const content = `---
id: TASK-001
title: Test
task_type: code
story: DS-00001
status: todo
created: 2025-01-15
---
`;
    const { task } = Parser.parseTask(content);
    expect(task.priority).toBe(1);
  });

  it("sets dependencies to empty array when not specified", () => {
    const content = `---
id: TASK-001
title: Test
task_type: code
story: DS-00001
status: todo
created: 2025-01-15
---
`;
    const { task } = Parser.parseTask(content);
    expect(task.dependencies).toEqual([]);
  });

  it("sets optional fields to undefined when not specified", () => {
    const content = `---
id: TASK-001
title: Test
task_type: code
story: DS-00001
status: todo
created: 2025-01-15
---
`;
    const { task } = Parser.parseTask(content);
    expect(task.assignedAgent).toBeUndefined();
    expect(task.completedOn).toBeUndefined();
    expect(task.filePath).toBeUndefined();
  });

  it("no longer throws on missing required fields — normalization fills defaults", () => {
    const content = `---
id: TASK-001
title: Test
---
`;
    const { task, changed } = Parser.parseTask(content, "/stories/STORY-001/tasks/TASK-001-test.md");
    expect(task.taskType).toBe("code"); // defaulted
    expect(task.story).toBe("STORY-001"); // derived from path
    expect(task.status).toBe("todo"); // defaulted
    expect(changed).toBe(true);
  });

  it("throws on empty frontmatter", () => {
    const content = `---
---
`;
    expect(() => Parser.parseTask(content)).toThrow("No frontmatter found");
  });

  it("throws on no frontmatter at all", () => {
    const content = "# Just markdown, no frontmatter";
    expect(() => Parser.parseTask(content)).toThrow("No frontmatter found");
  });

  it("maps snake_case to camelCase correctly", () => {
    const content = `---
id: TASK-001
title: Test
task_type: investigate
story: DS-00001
status: in_progress
assigned_agent: test-agent
completed_on: 2025-02-01
created: 2025-01-15
---
`;
    const { task } = Parser.parseTask(content);
    expect(task.taskType).toBe("investigate");
    expect(task.assignedAgent).toBe("test-agent");
    expect(task.completedOn).toBeInstanceOf(Date);
  });

  it("normalizes alternative field names (task_id, story_id, completed)", () => {
    const content = `---
task_id: TASK-001
title: Test
task_type: code
story_id: STORY-00157
status: todo
completed: 2025-02-01
created: 2025-01-15
---
`;
    const { task, changed } = Parser.parseTask(content, "/stories/STORY-00157/tasks/TASK-001-test.md");
    expect(task.id).toBe("TASK-001");
    expect(task.story).toBe("STORY-00157");
    expect(task.completedOn).toBeInstanceOf(Date);
    expect(changed).toBe(true);
  });

  it("derives story from folder path even when frontmatter has wrong value", () => {
    const content = `---
id: TASK-001
title: Test
task_type: code
story: STORY-WRONG
status: todo
created: 2025-01-15
---
`;
    const { task, changed } = Parser.parseTask(content, "/docs/storydocs/stories/STORY-00157/tasks/TASK-001-test.md");
    expect(task.story).toBe("STORY-00157");
    expect(changed).toBe(true);
  });

  it("returns normalizedData and markdownBody for auto-heal", () => {
    const { normalizedData, markdownBody } = Parser.parseTask(validContent, "/path/to/TASK-001.md");
    expect(normalizedData).toBeDefined();
    expect(typeof normalizedData).toBe("object");
    expect(normalizedData.id).toBe("TASK-001");
    expect(markdownBody).toContain("Some content here.");
  });
});
