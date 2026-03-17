/**
 * TextFilterService - Shared text search filter state
 *
 * Manages the current text filter string and notifies subscribers
 * when the filter changes. Used by TreeView to filter nodes by ID/title.
 * Session-only (not persisted).
 */

import * as vscode from 'vscode';

export class TextFilterService implements vscode.Disposable {
  private _filterText: string = '';

  private _onDidFilterChange = new vscode.EventEmitter<string>();
  readonly onDidFilterChange = this._onDidFilterChange.event;

  /**
   * Get the current filter text (empty string = no filter)
   */
  get filterText(): string {
    return this._filterText;
  }

  /**
   * Set the filter text
   * @param text - Search string, or empty string to clear filter
   */
  setFilter(text: string): void {
    if (this._filterText !== text) {
      this._filterText = text;
      this._onDidFilterChange.fire(text);
    }
  }

  dispose(): void {
    this._onDidFilterChange.dispose();
  }
}
