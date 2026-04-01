import { describe, it, expect } from "vitest";
import { substituteTemplateVariables, TemplateVariables } from "../../commands/templateUtils";

describe("Template Utils", () => {
  describe("substituteTemplateVariables", () => {
    it("should substitute {{DATE}} with current date", () => {
      const template = "Created on {{DATE}}";
      const variables: TemplateVariables = {
        date: "2025-01-15",
        title: "Test",
        id: "STORY-001",
      };
      const result = substituteTemplateVariables(template, variables);
      expect(result).toBe("Created on 2025-01-15");
    });

    it("should substitute {{TITLE}} with story title", () => {
      const template = "# {{TITLE}}\n\nDescription here";
      const variables: TemplateVariables = {
        date: "2025-01-15",
        title: "Add user login",
        id: "STORY-001",
      };
      const result = substituteTemplateVariables(template, variables);
      expect(result).toBe("# Add user login\n\nDescription here");
    });

    it("should substitute {{ID}} with story ID", () => {
      const template = "Story {{ID}} - {{TITLE}}";
      const variables: TemplateVariables = {
        date: "2025-01-15",
        title: "Fix bug",
        id: "DS-042",
      };
      const result = substituteTemplateVariables(template, variables);
      expect(result).toBe("Story DS-042 - Fix bug");
    });

    it("should substitute all variables in one pass", () => {
      const template = "{{ID}}: {{TITLE}} ({{DATE}})";
      const variables: TemplateVariables = {
        date: "2025-01-15",
        title: "My Story",
        id: "STORY-001",
      };
      const result = substituteTemplateVariables(template, variables);
      expect(result).toBe("STORY-001: My Story (2025-01-15)");
    });

    it("should handle multiple occurrences of same variable", () => {
      const template = "{{TITLE}} - more about {{TITLE}}";
      const variables: TemplateVariables = {
        date: "2025-01-15",
        title: "Feature X",
        id: "STORY-001",
      };
      const result = substituteTemplateVariables(template, variables);
      expect(result).toBe("Feature X - more about Feature X");
    });

    it("should preserve template if no variables present", () => {
      const template = "No variables here";
      const variables: TemplateVariables = {
        date: "2025-01-15",
        title: "Test",
        id: "STORY-001",
      };
      const result = substituteTemplateVariables(template, variables);
      expect(result).toBe("No variables here");
    });

    it("should be case-sensitive for variable names", () => {
      const template = "{{date}} {{Date}} {{DATE}}";
      const variables: TemplateVariables = {
        date: "2025-01-15",
        title: "Test",
        id: "STORY-001",
      };
      const result = substituteTemplateVariables(template, variables);
      // Only {{DATE}} should be replaced
      expect(result).toBe("{{date}} {{Date}} 2025-01-15");
    });

    it("should substitute {{PROJECT}} when provided", () => {
      const template = "Project: {{PROJECT}}";
      const variables: TemplateVariables = {
        date: "2025-01-15",
        title: "Test",
        id: "STORY-001",
        project: "DevStories",
      };
      const result = substituteTemplateVariables(template, variables);
      expect(result).toBe("Project: DevStories");
    });

    it("should substitute {{AUTHOR}} when provided", () => {
      const template = "Author: {{AUTHOR}}";
      const variables: TemplateVariables = {
        date: "2025-01-15",
        title: "Test",
        id: "STORY-001",
        author: "Jane Doe",
      };
      const result = substituteTemplateVariables(template, variables);
      expect(result).toBe("Author: Jane Doe");
    });

    it("should leave optional variables unreplaced if not provided", () => {
      const template = "Project: {{PROJECT}}, Author: {{AUTHOR}}";
      const variables: TemplateVariables = {
        date: "2025-01-15",
        title: "Test",
        id: "STORY-001",
      };
      const result = substituteTemplateVariables(template, variables);
      expect(result).toBe("Project: {{PROJECT}}, Author: {{AUTHOR}}");
    });
  });
});
