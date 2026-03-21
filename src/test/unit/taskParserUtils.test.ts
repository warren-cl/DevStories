import { describe, it, expect } from "vitest";
import {
  deriveStoryIdFromPath,
  deriveTaskIdFromFilename,
  deriveTitleFromFilename,
  normalizeTaskFrontmatter,
} from "../../core/taskParserUtils";

// ---- deriveStoryIdFromPath ----

describe("deriveStoryIdFromPath", () => {
  it("extracts story ID from Unix-style path", () => {
    expect(deriveStoryIdFromPath("/docs/storydocs/stories/STORY-00157/tasks/TASK-001-foo.md")).toBe("STORY-00157");
  });

  it("extracts story ID from Windows-style path", () => {
    expect(deriveStoryIdFromPath("C:\\docs\\storydocs\\stories\\STORY-00157\\tasks\\TASK-001-foo.md")).toBe("STORY-00157");
  });

  it("returns undefined when path has no stories segment", () => {
    expect(deriveStoryIdFromPath("/docs/tasks/TASK-001.md")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(deriveStoryIdFromPath("")).toBeUndefined();
  });

  it("handles story IDs with different numeric lengths", () => {
    expect(deriveStoryIdFromPath("/stories/STORY-001/tasks/TASK-001.md")).toBe("STORY-001");
  });

  it("handles mixed-case story folder names", () => {
    expect(deriveStoryIdFromPath("/stories/Story-00157/tasks/TASK-001.md")).toBe("Story-00157");
  });
});

// ---- deriveTaskIdFromFilename ----

describe("deriveTaskIdFromFilename", () => {
  it("extracts task ID from standard filename", () => {
    expect(deriveTaskIdFromFilename("/path/TASK-001-pre-slice-scanning.md")).toBe("TASK-001");
  });

  it("extracts task ID from filename with many digits", () => {
    expect(deriveTaskIdFromFilename("/path/TASK-0001-something.md")).toBe("TASK-0001");
  });

  it("extracts task ID from Windows path", () => {
    expect(deriveTaskIdFromFilename("C:\\docs\\TASK-008-validate.md")).toBe("TASK-008");
  });

  it("handles case-insensitive prefix", () => {
    expect(deriveTaskIdFromFilename("/path/task-001-foo.md")).toBe("TASK-001");
  });

  it("returns undefined when filename has no task prefix", () => {
    expect(deriveTaskIdFromFilename("/path/readme.md")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(deriveTaskIdFromFilename("")).toBeUndefined();
  });

  it("handles filename with no slug after ID", () => {
    expect(deriveTaskIdFromFilename("/path/TASK-005.md")).toBe("TASK-005");
  });
});

// ---- deriveTitleFromFilename ----

describe("deriveTitleFromFilename", () => {
  it("converts kebab-slug to Title Case", () => {
    expect(deriveTitleFromFilename("/path/TASK-001-pre-slice-scanning.md")).toBe("Pre Slice Scanning");
  });

  it("handles single-word slug", () => {
    expect(deriveTitleFromFilename("/path/TASK-001-validate.md")).toBe("Validate");
  });

  it("falls back to full filename when no slug after ID", () => {
    expect(deriveTitleFromFilename("/path/TASK-005.md")).toBe("TASK-005");
  });

  it("handles Windows path", () => {
    expect(deriveTitleFromFilename("C:\\docs\\TASK-008-validate-results.md")).toBe("Validate Results");
  });

  it("handles filename without TASK prefix", () => {
    expect(deriveTitleFromFilename("/path/some-task-file.md")).toBe("Some Task File");
  });
});

// ---- normalizeTaskFrontmatter ----

describe("normalizeTaskFrontmatter", () => {
  const basePath = "/docs/storydocs/stories/STORY-00157/tasks/TASK-001-pre-slice-scanning.md";

  it("returns changed: false when all canonical fields present and correct", () => {
    const data = {
      id: "TASK-001",
      title: "Pre Slice Scanning",
      task_type: "code",
      story: "STORY-00157",
      status: "todo",
      priority: 1,
      created: "2026-03-01",
      updated: "2026-03-01",
    };
    const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
    expect(changed).toBe(false);
    expect(normalized.id).toBe("TASK-001");
    expect(normalized.story).toBe("STORY-00157");
  });

  describe("field alias mapping", () => {
    it("renames task_id → id", () => {
      const data = {
        task_id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.id).toBe("TASK-001");
      expect(normalized.task_id).toBeUndefined();
      expect(changed).toBe(true);
    });

    it("renames story_id → story", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story_id: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.story).toBe("STORY-00157");
      expect(normalized.story_id).toBeUndefined();
      expect(changed).toBe(true);
    });

    it("renames parent_story → story", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        parent_story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.story).toBe("STORY-00157");
      expect(normalized.parent_story).toBeUndefined();
      expect(changed).toBe(true);
    });

    it("renames completed → completed_on", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        status: "done",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
        completed: "2026-03-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.completed_on).toBe("2026-03-01");
      expect(normalized.completed).toBeUndefined();
      expect(changed).toBe(true);
    });

    it("renames completed_at → completed_on", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        status: "done",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
        completed_at: "2026-03-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.completed_on).toBe("2026-03-01");
      expect(normalized.completed_at).toBeUndefined();
      expect(changed).toBe(true);
    });

    it("renames agent → assigned_agent", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
        agent: "claude",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.assigned_agent).toBe("claude");
      expect(normalized.agent).toBeUndefined();
      expect(changed).toBe(true);
    });

    it("renames depends_on → dependencies", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
        depends_on: ["TASK-002"],
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.dependencies).toEqual(["TASK-002"]);
      expect(normalized.depends_on).toBeUndefined();
      expect(changed).toBe(true);
    });

    it("does NOT rename alias if canonical already present", () => {
      const data = {
        id: "TASK-001",
        task_id: "TASK-999",
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
      };
      const { normalized } = normalizeTaskFrontmatter(data, basePath);
      // canonical `id` present → `task_id` is left untouched
      expect(normalized.id).toBe("TASK-001");
      expect(normalized.task_id).toBe("TASK-999");
    });

    it("renames type → task_type when value is a task-type value", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        type: "code",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.task_type).toBe("code");
      expect(normalized.type).toBeUndefined();
      expect(changed).toBe(true);
    });

    it("does NOT rename type when value is a story-type value", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        type: "feature",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      // 'feature' is not a task type, so 'type' stays and task_type gets defaulted
      expect(normalized.type).toBe("feature");
      expect(normalized.task_type).toBe("code");
      expect(changed).toBe(true);
    });
  });

  describe("deriving values from path/filename", () => {
    it("derives id from filename when missing", () => {
      const data = {
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.id).toBe("TASK-001");
      expect(changed).toBe(true);
    });

    it("derives story from path (authoritative, overrides frontmatter)", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story: "STORY-WRONG",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.story).toBe("STORY-00157");
      expect(changed).toBe(true);
    });

    it("derives title from filename slug when missing", () => {
      const data = {
        id: "TASK-001",
        task_type: "code",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.title).toBe("Pre Slice Scanning");
      expect(changed).toBe(true);
    });
  });

  describe("default values", () => {
    it("defaults task_type to 'code'", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.task_type).toBe("code");
      expect(changed).toBe(true);
    });

    it("defaults status to 'todo'", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.status).toBe("todo");
      expect(changed).toBe(true);
    });

    it("defaults priority to 1", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        status: "todo",
        created: "2026-01-01",
        updated: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.priority).toBe(1);
      expect(changed).toBe(true);
    });

    it("defaults created to today", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        updated: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(changed).toBe(true);
    });

    it("defaults updated to today", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(changed).toBe(true);
    });
  });

  describe("preserving unknown fields", () => {
    it("preserves unknown 'sip' field", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
        sip: "SIP-001",
      };
      const { normalized } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.sip).toBe("SIP-001");
    });

    it("preserves unknown custom fields", () => {
      const data = {
        id: "TASK-001",
        title: "Foo",
        task_type: "code",
        story: "STORY-00157",
        status: "todo",
        priority: 1,
        created: "2026-01-01",
        updated: "2026-01-01",
        custom_field: "value",
        tags: ["a", "b"],
      };
      const { normalized } = normalizeTaskFrontmatter(data, basePath);
      expect(normalized.custom_field).toBe("value");
      expect(normalized.tags).toEqual(["a", "b"]);
    });
  });

  describe("real-world scenario: agent-created task file", () => {
    it("normalizes a file with task_id/story_id/completed fields", () => {
      const agentData = {
        task_id: "TASK-001",
        title: "Pre-Slice Scanning",
        task_type: "code",
        story_id: "STORY-00157",
        assigned_agent: "cline-agent",
        status: "todo",
        priority: 1,
        created: "2026-03-01",
        updated: "2026-03-01",
        sip: "SIP-001",
        completed: "2026-03-15",
      };
      const { normalized, changed } = normalizeTaskFrontmatter(agentData, basePath);

      expect(changed).toBe(true);
      expect(normalized.id).toBe("TASK-001");
      expect(normalized.task_id).toBeUndefined();
      expect(normalized.story).toBe("STORY-00157");
      expect(normalized.story_id).toBeUndefined();
      expect(normalized.completed_on).toBe("2026-03-15");
      expect(normalized.completed).toBeUndefined();
      expect(normalized.sip).toBe("SIP-001"); // preserved
      expect(normalized.assigned_agent).toBe("cline-agent"); // kept
    });

    it("normalizes a nearly-empty frontmatter relying on path/filename derivation", () => {
      const minimalData = { status: "in_progress" };
      const { normalized, changed } = normalizeTaskFrontmatter(minimalData, basePath);

      expect(changed).toBe(true);
      expect(normalized.id).toBe("TASK-001");
      expect(normalized.story).toBe("STORY-00157");
      expect(normalized.title).toBe("Pre Slice Scanning");
      expect(normalized.task_type).toBe("code");
      expect(normalized.status).toBe("in_progress"); // existing value preserved
      expect(normalized.priority).toBe(1);
      expect(normalized.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
