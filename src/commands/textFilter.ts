/**
 * Text Filter Command - Opens InputBox for text-based tree search.
 *
 * Filters tree nodes by matching ID, title, or filename against the
 * entered text. When a non-empty filter is applied, any active sprint
 * filter is cleared so all nodes are searched.
 */

import * as vscode from 'vscode';
import { SprintFilterService } from '../core/sprintFilterService';
import { TextFilterService } from '../core/textFilterService';

/**
 * Execute the text filter command — opens an InputBox for the user to type a search string.
 */
export async function executeTextFilter(
  textFilterService: TextFilterService,
  sprintFilterService: SprintFilterService
): Promise<void> {
  const input = await vscode.window.showInputBox({
    prompt: 'Filter tree by ID or title',
    placeHolder: 'e.g. DS-00123, EPIC-00, or login',
    value: textFilterService.filterText,
  });

  // Cancel (Escape) → no-op
  if (input === undefined) {
    return;
  }

  textFilterService.setFilter(input);

  // When applying a non-empty text filter, clear the sprint filter
  // so the search covers all nodes across all sprints
  if (input !== '') {
    sprintFilterService.setSprint(null);
  }
}
