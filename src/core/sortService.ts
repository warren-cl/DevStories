/**
 * SortService - Shared story sort state
 *
 * Manages the current sort configuration and notifies subscribers
 * when the sort changes. Session-only (not persisted).
 */

import * as vscode from 'vscode';

export type SortKey = 'priority' | 'date' | 'id';
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

export const DEFAULT_SORT_STATE: SortState = { key: 'priority', direction: 'asc' };

export class SortService implements vscode.Disposable {
  private _state: SortState = { ...DEFAULT_SORT_STATE };

  private _onDidSortChange = new vscode.EventEmitter<SortState>();
  readonly onDidSortChange = this._onDidSortChange.event;

  /**
   * Get the current sort state
   */
  get state(): SortState {
    return { ...this._state };
  }

  /**
   * Set the sort state
   */
  setState(state: SortState): void {
    const changed = state.key !== this._state.key || state.direction !== this._state.direction;
    if (changed) {
      this._state = { ...state };
      this._onDidSortChange.fire(this._state);
    }
  }

  dispose(): void {
    this._onDidSortChange.dispose();
  }
}
