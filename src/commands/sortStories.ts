/**
 * Sort Stories Command - Opens QuickPick to choose sort order for the tree view.
 *
 * Sort is session-only (not persisted). Successive clicks on the same key
 * flip the direction. Selecting a new key defaults to ascending.
 */

import * as vscode from 'vscode';
import { SortService, SortKey, SortState } from '../core/sortService';

interface SortQuickPickItem extends vscode.QuickPickItem {
  key: SortKey;
}

const SORT_LABELS: Record<SortKey, string> = {
  priority: 'Priority',
  date: 'Date Created',
  id: 'ID',
};

function directionArrow(direction: 'asc' | 'desc'): string {
  return direction === 'asc' ? '↑' : '↓';
}

/**
 * Execute the sort stories command
 */
export async function executeSortStories(sortService: SortService): Promise<void> {
  const current = sortService.state;

  const keys: SortKey[] = ['priority', 'date', 'id'];

  const items: SortQuickPickItem[] = keys.map(key => {
    const isActive = key === current.key;
    const label = `$(sort-precedence) ${SORT_LABELS[key]}`;
    const description = isActive
      ? `(active ${directionArrow(current.direction)})`
      : undefined;

    return { label, description, key };
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Sort stories by…',
    title: 'DevStories: Sort Stories',
  });

  if (!selected) {
    return;
  }

  let newState: SortState;
  if (selected.key === current.key) {
    // Same key: flip direction
    newState = { key: current.key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  } else {
    // New key: default to ascending
    newState = { key: selected.key, direction: 'asc' };
  }

  sortService.setState(newState);
}
