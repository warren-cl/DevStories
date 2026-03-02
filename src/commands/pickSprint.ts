/**
 * Pick Sprint Command - Opens QuickPick for sprint view filter selection.
 *
 * Shows all sprints (sprintSequence + Backlog option if applicable).
 * Selecting a sprint only updates the in-memory view filter — it does NOT
 * write to config.json. Use setCurrentSprint to persist the current sprint.
 */

import * as vscode from 'vscode';
import { ConfigService } from '../core/configService';
import { SprintFilterService } from '../core/sprintFilterService';
import { Store } from '../core/store';

interface SprintQuickPickItem extends vscode.QuickPickItem {
  value: string | null;
}

/**
 * Execute the pick sprint command
 */
export async function executePickSprint(
  store: Store,
  sprintFilterService: SprintFilterService,
  configService?: ConfigService
): Promise<void> {
  const stories = store.getStories();
  const currentSprint = configService?.config.currentSprint;         // persisted current sprint
  const sprintSequence = configService?.config.sprintSequence ?? []; // config-defined order
  const activeFilter = sprintFilterService.currentSprint;            // current UI filter

  // Build QuickPick items
  const items: SprintQuickPickItem[] = [];

  // All Sprints option — clears filter but does NOT write to config
  items.push({
    label: '$(list-flat) All Sprints',
    description: activeFilter === null ? '(selected)' : undefined,
    value: null,
  });

  // Backlog option — only shown when backlog stories exist
  const hasBacklogStories = stories.some(s => !s.sprint || s.sprint === '' || s.sprint === 'backlog');
  if (hasBacklogStories) {
    items.push({
      label: '$(archive) Backlog',
      description: activeFilter === 'backlog' ? '(selected)' : undefined,
      value: 'backlog',
    });
  }

  // Separator before the sprint list
  if (sprintSequence.length > 0) {
    items.push({
      label: 'Sprints',
      kind: vscode.QuickPickItemKind.Separator,
      value: null,
    });
  }

  // Sprints from config sprintSequence in order — these are the team's defined sprints
  for (const sprint of sprintSequence) {
    const isCurrentSprint = sprint === currentSprint;
    const isSelected = activeFilter === sprint;
    const tags: string[] = [];
    if (isCurrentSprint) { tags.push('Current Sprint'); }
    if (isSelected) { tags.push('selected'); }

    items.push({
      label: `$(milestone) ${sprint}`,
      description: tags.length > 0 ? tags.join(' · ') : undefined,
      value: sprint,
    });
  }

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select sprint to view',
    title: 'DevStories: Switch Sprint',
  });

  if (!selected || selected.kind === vscode.QuickPickItemKind.Separator) {
    return;
  }

  const pickedValue = selected.value;

  // Update the sprint filter (fires onDidSprintChange → tree + status bar refresh)
  sprintFilterService.setSprint(pickedValue);
}
