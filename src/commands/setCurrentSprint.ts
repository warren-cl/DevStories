/**
 * Set Current Sprint Command - Persists the current sprint to config.json
 * and auto-applies the sprint filter.
 *
 * Different from pickSprint (view-only filter):
 *   - setCurrentSprint writes to config.json (project-level setting)
 *   - setCurrentSprint auto-applies the filter to match the new current sprint
 */

import * as vscode from 'vscode';
import { ConfigService } from '../core/configService';
import { getLogger } from '../core/logger';
import { SprintFilterService } from '../core/sprintFilterService';

interface SprintQuickPickItem extends vscode.QuickPickItem {
  value: string;
}

/**
 * Execute the set current sprint command
 */
export async function executeSetCurrentSprint(
  sprintFilterService: SprintFilterService,
  configService: ConfigService
): Promise<void> {
  const sprintSequence = configService.config.sprintSequence ?? [];
  const currentSprint = configService.config.currentSprint;

  if (sprintSequence.length === 0) {
    void vscode.window.showWarningMessage(
      'DevStories: No sprints defined in config.json. Add sprints to sprintSequence first.'
    );
    return;
  }

  // Build QuickPick items from sprintSequence only
  const items: SprintQuickPickItem[] = sprintSequence.map(sprint => ({
    label: `$(milestone) ${sprint}`,
    description: sprint === currentSprint ? '(current)' : undefined,
    value: sprint,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select sprint to set as current',
    title: 'DevStories: Set Current Sprint',
  });

  if (!selected) {
    return;
  }

  // Persist to config.json
  try {
    await configService.updateCurrentSprint(selected.value);
  } catch (error) {
    getLogger().warn('setCurrentSprint: failed to write config.json', error);
    void vscode.window.showWarningMessage(
      'DevStories: Could not write current sprint to config.json.'
    );
    return;
  }

  // Auto-apply view filter to match the new current sprint
  sprintFilterService.setSprint(selected.value);
}
