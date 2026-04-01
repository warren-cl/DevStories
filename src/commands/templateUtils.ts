/**
 * Template utility functions for story creation
 * Handles variable substitution
 */

/**
 * Variables available for template substitution
 */
export interface TemplateVariables {
  date: string;       // {{DATE}} - Today's date (YYYY-MM-DD)
  title: string;      // {{TITLE}} - Story title
  id: string;         // {{ID}} - Story ID
  project?: string;   // {{PROJECT}} - Project name from config
  author?: string;    // {{AUTHOR}} - Author from git/settings
}

/**
 * Substitute template variables in template string
 * Variables are case-sensitive: {{DATE}} works, {{date}} does not
 */
export function substituteTemplateVariables(
  template: string,
  variables: TemplateVariables
): string {
  let result = template;

  // Required variables
  result = result.replace(/\{\{DATE\}\}/g, variables.date);
  result = result.replace(/\{\{TITLE\}\}/g, variables.title);
  result = result.replace(/\{\{ID\}\}/g, variables.id);

  // Optional variables - only replace if provided
  if (variables.project !== undefined) {
    result = result.replace(/\{\{PROJECT\}\}/g, variables.project);
  }
  if (variables.author !== undefined) {
    result = result.replace(/\{\{AUTHOR\}\}/g, variables.author);
  }

  return result;
}
